// GET /api/v1/dashboard/my-summary/export — xlsx export of the "Mi resumen"
// dashboard face (PRD §7.1), ALWAYS scope "own" (the caller's own data,
// regardless of role — same as GET /api/v1/dashboard/my-summary). Reuses
// parseDashboardFilters + tareaScopeWhere + rangoDeFechasNullable from
// src/lib/dashboard.ts.
//
// dashboard-export-excel: three datasets (activas.items, vencidas.items,
// clientes_asignados.items) live in ONE workbook as three sheets ("Activas" /
// "Vencidas" / "Clientes asignados") — same one-click-per-cara rationale as
// dashboard/tasks/export and dashboard/clients-activity/export. None of these
// three lists has a widget cap in GET my-summary, so EXPORT_MAX_ROWS (PRD
// §8.4) is the first cap they get, applied defensively for consistency with
// the other 3 export endpoints.
//
// Every export writes an `auditoria` row with `accion: "exportar"` and
// `entidad: "dashboard"` (best-effort, PR 6 pattern).

import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { OPEN_TASK_STATES } from "@/lib/api/crm";
import { startOfLocalDay } from "@/lib/alerts";
import {
  ESTADO_CLIENTE_LABELS,
  ESTADO_TAREA_LABELS,
  ORIGEN_TAREA_LABELS,
  PRIORIDAD_CLIENTE_LABELS,
} from "@/lib/catalogs";
import { parseDashboardFilters, rangoDeFechasNullable, tareaScopeWhere } from "@/lib/dashboard";
import { logAudit } from "@/lib/api/audit";

export const dynamic = "force-dynamic";

const EXPORT_MAX_ROWS = 500; // PRD §8.4 cap para exportaciones.

export const GET = withApiErrorHandling(
  "dashboard/my-summary/export",
  "No pudimos generar el archivo. Inténtalo de nuevo.",
  async (request: Request) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const parsed = parseDashboardFilters(url);
    if (!parsed.ok) return parsed.response;
    const filters = parsed.filters;

    const inicioHoy = startOfLocalDay();

    const rango = rangoDeFechasNullable(filters);
    const where = tareaScopeWhere("own", auth.usuario, filters, {
      estado: OPEN_TASK_STATES,
      ...(rango && { fecha_entrega: rango }),
    });

    const [tareas, clientes] = await Promise.all([
      db.tarea.findMany({
        where,
        select: { id: true, titulo: true, estado: true, fecha_entrega: true, origen: true },
        orderBy: { fecha_entrega: "asc" },
      }),
      db.cliente.findMany({
        where: { deleted_at: null, responsable_id: auth.usuario.id },
        select: { id: true, nombre: true, estado: true, prioridad: true },
        orderBy: { nombre: "asc" },
      }),
    ]);

    const itemCon = (t: (typeof tareas)[number]) => ({
      id: t.id,
      titulo: t.titulo,
      estado: t.estado,
      fecha_entrega: t.fecha_entrega,
      origen: t.origen,
    });
    const vencida = (t: (typeof tareas)[number]) =>
      t.fecha_entrega !== null && t.fecha_entrega.getTime() < inicioHoy.getTime();

    const activas = tareas.map(itemCon).slice(0, EXPORT_MAX_ROWS);
    const vencidas = tareas.filter(vencida).map(itemCon).slice(0, EXPORT_MAX_ROWS);
    const clientes_asignados = clientes
      .map((c) => ({
        cliente_id: c.id,
        nombre: c.nombre,
        estado: c.estado,
        prioridad: c.prioridad,
      }))
      .slice(0, EXPORT_MAX_ROWS);

    try {
      await logAudit({
        entidad: "dashboard",
        entidad_id: null,
        accion: "exportar",
        usuario_id: auth.usuario.id,
        cambios: {
          rows: activas.length + vencidas.length + clientes_asignados.length,
          cara: "my-summary",
          sheets: {
            activas: activas.length,
            vencidas: vencidas.length,
            clientes_asignados: clientes_asignados.length,
          },
          filters: filters as unknown as Record<string, unknown>,
        },
      });
    } catch (err) {
      console.error("[dashboard/my-summary] export audit failed:", err);
    }

    const workbook = new ExcelJS.Workbook();

    const tareaColumns = [
      { header: "Título", key: "titulo", width: 32 },
      { header: "Estado", key: "estado", width: 16 },
      { header: "Fecha entrega", key: "fecha_entrega", width: 14 },
      { header: "Origen", key: "origen", width: 12 },
    ];
    const addTareaRow = (
      sheet: ExcelJS.Worksheet,
      t: { titulo: string; estado: (typeof tareas)[number]["estado"]; fecha_entrega: Date | null; origen: (typeof tareas)[number]["origen"] },
    ) => {
      sheet.addRow({
        titulo: t.titulo,
        estado: ESTADO_TAREA_LABELS[t.estado].label,
        fecha_entrega: t.fecha_entrega ? t.fecha_entrega.toISOString().slice(0, 10) : "—",
        origen: ORIGEN_TAREA_LABELS[t.origen].label,
      });
    };

    const activasSheet = workbook.addWorksheet("Activas");
    activasSheet.columns = tareaColumns;
    activasSheet.getRow(1).font = { bold: true };
    activasSheet.autoFilter = { from: "A1", to: "D1" };
    for (const t of activas) addTareaRow(activasSheet, t);

    const vencidasSheet = workbook.addWorksheet("Vencidas");
    vencidasSheet.columns = tareaColumns;
    vencidasSheet.getRow(1).font = { bold: true };
    vencidasSheet.autoFilter = { from: "A1", to: "D1" };
    for (const t of vencidas) addTareaRow(vencidasSheet, t);

    const clientesSheet = workbook.addWorksheet("Clientes asignados");
    clientesSheet.columns = [
      { header: "Cliente", key: "nombre", width: 28 },
      { header: "Estado", key: "estado", width: 18 },
      { header: "Prioridad", key: "prioridad", width: 12 },
    ];
    clientesSheet.getRow(1).font = { bold: true };
    clientesSheet.autoFilter = { from: "A1", to: "C1" };
    for (const c of clientes_asignados) {
      clientesSheet.addRow({
        nombre: c.nombre,
        estado: ESTADO_CLIENTE_LABELS[c.estado].label,
        prioridad: c.prioridad ? PRIORIDAD_CLIENTE_LABELS[c.prioridad].label : "",
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="mi-resumen.xlsx"',
      },
    });
  },
);
