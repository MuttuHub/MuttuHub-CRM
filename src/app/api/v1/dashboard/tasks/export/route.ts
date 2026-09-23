// GET /api/v1/dashboard/tasks/export — xlsx export of the "Gestión de
// Tareas" dashboard face (PRD §7.1) with the same filters as GET
// /api/v1/dashboard/tasks (reuses parseDashboardFilters + tareaScopeWhere +
// rangoDeFechasNullable from src/lib/dashboard.ts).
//
// dashboard-export-excel: two datasets (cumplimiento_por_persona, vencidas)
// live in ONE workbook as two sheets ("Cumplimiento" / "Vencidas") instead of
// two separate export endpoints — one click on the dashboard downloads the
// whole face, matching how src/app/api/v1/tasks/export already puts every
// column of a single dataset in one sheet; splitting into two endpoints
// would need two buttons for what the UI treats as a single "cara".
//
// The "vencidas" widget preview caps at 20 rows (MAX_VENCIDAS_LISTA in
// dashboard/tasks/route.ts); the export is NOT capped there — it exports up
// to EXPORT_MAX_ROWS (PRD §8.4), same rationale as pipeline/export.
//
// Every export writes an `auditoria` row with `accion: "exportar"` and
// `entidad: "dashboard"` (best-effort, PR 6 pattern).

import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { OPEN_TASK_STATES } from "@/lib/api/crm";
import { startOfLocalDay } from "@/lib/alerts";
import { parseDashboardFilters, rangoDeFechasNullable, tareaScopeWhere } from "@/lib/dashboard";
import { logAudit } from "@/lib/api/audit";

export const dynamic = "force-dynamic";

const EXPORT_MAX_ROWS = 500; // PRD §8.4 cap para exportaciones.

export const GET = withApiErrorHandling(
  "dashboard/tasks/export",
  "No pudimos generar el archivo. Inténtalo de nuevo.",
  async (request: Request) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const parsed = parseDashboardFilters(url);
    if (!parsed.ok) return parsed.response;
    const filters = parsed.filters;

    // PR 3 (close-phase-1): read scope is global, same as GET dashboard/tasks.
    const scope = "all" as const;
    const hoy = startOfLocalDay();

    const rango = rangoDeFechasNullable(filters);
    const enRango = tareaScopeWhere(scope, auth.usuario, filters, {
      ...(rango && { fecha_entrega: rango }),
    });

    const [tareas, vencidas] = await Promise.all([
      db.tarea.findMany({
        where: enRango,
        select: {
          id: true,
          estado: true,
          fecha_entrega: true,
          updated_at: true,
          completed_at: true,
          responsable_id: true,
          responsable: { select: { nombre: true } },
        },
      }),
      db.tarea.findMany({
        where: tareaScopeWhere(scope, auth.usuario, filters, {
          estado: OPEN_TASK_STATES,
          fecha_entrega: { lt: hoy },
        }),
        select: {
          id: true,
          titulo: true,
          fecha_entrega: true,
          responsable: { select: { nombre: true } },
          cliente: { select: { nombre: true } },
        },
        orderBy: { fecha_entrega: "asc" },
      }),
    ]);

    const porPersona = new Map<
      string,
      {
        responsable_id: string;
        nombre: string;
        total: number;
        completadas: number;
        cumplidas: number;
      }
    >();
    for (const t of tareas) {
      const persona = porPersona.get(t.responsable_id) ?? {
        responsable_id: t.responsable_id,
        nombre: t.responsable.nombre,
        total: 0,
        completadas: 0,
        cumplidas: 0,
      };
      persona.total += 1;
      if (t.estado === "COMPLETADA") {
        persona.completadas += 1;
        const cierre = t.completed_at ?? t.updated_at;
        if (t.fecha_entrega && cierre <= t.fecha_entrega) {
          persona.cumplidas += 1;
        }
      }
      porPersona.set(t.responsable_id, persona);
    }
    const cumplimiento_por_persona = [...porPersona.values()]
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
      .slice(0, EXPORT_MAX_ROWS)
      .map((p) => ({
        ...p,
        porc: Math.round((p.cumplidas / p.total) * 100),
      }));

    const lista = vencidas.slice(0, EXPORT_MAX_ROWS).map((v) => ({
      id: v.id,
      titulo: v.titulo,
      responsable_nombre: v.responsable.nombre,
      fecha_entrega: v.fecha_entrega,
      cliente_nombre: v.cliente?.nombre ?? null,
    }));

    try {
      await logAudit({
        entidad: "dashboard",
        entidad_id: null,
        accion: "exportar",
        usuario_id: auth.usuario.id,
        cambios: {
          rows: cumplimiento_por_persona.length + lista.length,
          cara: "tasks",
          sheets: { cumplimiento: cumplimiento_por_persona.length, vencidas: lista.length },
          filters: filters as unknown as Record<string, unknown>,
        },
      });
    } catch (err) {
      console.error("[dashboard/tasks] export audit failed:", err);
    }

    const workbook = new ExcelJS.Workbook();

    const cumplimientoSheet = workbook.addWorksheet("Cumplimiento");
    cumplimientoSheet.columns = [
      { header: "Responsable", key: "nombre", width: 28 },
      { header: "Total", key: "total", width: 10 },
      { header: "Completadas", key: "completadas", width: 14 },
      { header: "Cumplidas", key: "cumplidas", width: 12 },
      { header: "% cumplimiento", key: "porc", width: 16 },
    ];
    cumplimientoSheet.getRow(1).font = { bold: true };
    cumplimientoSheet.autoFilter = { from: "A1", to: "E1" };
    for (const p of cumplimiento_por_persona) {
      cumplimientoSheet.addRow({
        nombre: p.nombre,
        total: p.total,
        completadas: p.completadas,
        cumplidas: p.cumplidas,
        porc: p.porc,
      });
    }

    const vencidasSheet = workbook.addWorksheet("Vencidas");
    vencidasSheet.columns = [
      { header: "Título", key: "titulo", width: 32 },
      { header: "Responsable", key: "responsable_nombre", width: 22 },
      { header: "Cliente", key: "cliente_nombre", width: 22 },
      { header: "Fecha entrega", key: "fecha_entrega", width: 14 },
    ];
    vencidasSheet.getRow(1).font = { bold: true };
    vencidasSheet.autoFilter = { from: "A1", to: "D1" };
    for (const v of lista) {
      vencidasSheet.addRow({
        titulo: v.titulo,
        responsable_nombre: v.responsable_nombre,
        cliente_nombre: v.cliente_nombre ?? "",
        // `v.fecha_entrega` is typed nullable (schema-level), but this row
        // only exists because the query filtered on `fecha_entrega: { lt: hoy }`.
        fecha_entrega: v.fecha_entrega ? v.fecha_entrega.toISOString().slice(0, 10) : "—",
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="tareas-dashboard.xlsx"',
      },
    });
  },
);
