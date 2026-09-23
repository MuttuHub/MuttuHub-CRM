// GET /api/v1/dashboard/clients-activity/export — xlsx export of the
// "Actividad de Clientes" dashboard face (PRD §7.1) with the same filters as
// GET /api/v1/dashboard/clients-activity (reuses parseDashboardFilters +
// clienteScopeWhere + rangoDeFechas from src/lib/dashboard.ts).
//
// dashboard-export-excel: two datasets (sin_gestion.clientes,
// actividad_por_responsable) live in ONE workbook as two sheets ("Sin
// gestión" / "Actividad por responsable") — same one-click-per-cara rationale
// as dashboard/tasks/export.
//
// The "sin gestión" widget preview caps at 25 rows (MAX_SIN_GESTION in
// dashboard/clients-activity/route.ts); the export is NOT capped there — it
// exports up to EXPORT_MAX_ROWS (PRD §8.4), same rationale as pipeline/export
// and tasks/export. `actividad_por_responsable` has no widget cap at all but
// gets the same defensive EXPORT_MAX_ROWS slice for consistency.
//
// Every export writes an `auditoria` row with `accion: "exportar"` and
// `entidad: "dashboard"` (best-effort, PR 6 pattern).

import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { ESTADO_CLIENTE_LABELS, PRIORIDAD_CLIENTE_LABELS } from "@/lib/catalogs";
import { clienteScopeWhere, parseDashboardFilters, rangoDeFechas } from "@/lib/dashboard";
import { logAudit } from "@/lib/api/audit";

export const dynamic = "force-dynamic";

const EXPORT_MAX_ROWS = 500; // PRD §8.4 cap para exportaciones.

const DIAS_DEFAULT = 14;
const DIAS_MIN = 1;
const DIAS_MAX = 90;
const MS_DIA = 24 * 60 * 60 * 1000;

export const GET = withApiErrorHandling(
  "dashboard/clients-activity/export",
  "No pudimos generar el archivo. Inténtalo de nuevo.",
  async (request: Request) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const parsed = parseDashboardFilters(url);
    if (!parsed.ok) return parsed.response;
    const filters = parsed.filters;

    const sp = url.searchParams;
    const diasRaw = sp.get("dias_sin_gestion");
    const dias = diasRaw === null ? DIAS_DEFAULT : Number(diasRaw);
    if (diasRaw !== null && (!Number.isInteger(dias) || dias < DIAS_MIN || dias > DIAS_MAX)) {
      return apiError(`dias_sin_gestion no válido (${DIAS_MIN}-${DIAS_MAX}).`, 400, "VALIDATION_ERROR");
    }

    // PR 3 (close-phase-1): read scope is global, same as GET dashboard/clients-activity.
    const scope = "all" as const;

    const clienteWhere = clienteScopeWhere(scope, auth.usuario, filters);
    const rango = rangoDeFechas(filters);
    const corte = new Date(Date.now() - dias * MS_DIA);

    const [clientes, gestiones, tareas] = await Promise.all([
      db.cliente.findMany({
        where: clienteWhere,
        select: {
          id: true,
          nombre: true,
          tipo_cliente: true,
          estado: true,
          prioridad: true,
          responsable_id: true,
          responsable: { select: { nombre: true } },
          bitacora: {
            orderBy: { created_at: "desc" },
            take: 1,
            select: { created_at: true },
          },
        },
      }),
      db.bitacoraEntrada.findMany({
        where: { cliente: clienteWhere, ...(rango && { created_at: rango }) },
        select: { cliente_id: true },
      }),
      db.tarea.findMany({
        where: {
          deleted_at: null,
          cliente: clienteWhere,
          ...(rango && { created_at: rango }),
        },
        select: { cliente_id: true },
      }),
    ]);

    type ClienteGestion = {
      cliente_id: string;
      nombre: string;
      estado: (typeof clientes)[number]["estado"];
      prioridad: (typeof clientes)[number]["prioridad"];
      responsable_nombre: string;
      ultima_gestion: Date | null;
    };
    const conUltima: ClienteGestion[] = clientes.map((c) => ({
      cliente_id: c.id,
      nombre: c.nombre,
      estado: c.estado,
      prioridad: c.prioridad,
      responsable_nombre: c.responsable.nombre,
      ultima_gestion: c.bitacora[0]?.created_at ?? null,
    }));

    const sinGestion = conUltima
      .filter(
        (c) => c.ultima_gestion === null || c.ultima_gestion.getTime() < corte.getTime(),
      )
      .sort((a, b) => (a.ultima_gestion?.getTime() ?? 0) - (b.ultima_gestion?.getTime() ?? 0))
      .slice(0, EXPORT_MAX_ROWS);

    const responsableDelCliente = new Map(clientes.map((c) => [c.id, c.responsable_id]));
    const nombreDelResponsable = new Map(
      clientes.map((c) => [c.responsable_id, c.responsable.nombre]),
    );
    const actividad = new Map<
      string,
      { responsable_id: string; nombre: string; gestiones: number; tareas_count: number }
    >();
    for (const [id, nombre] of nombreDelResponsable) {
      actividad.set(id, { responsable_id: id, nombre, gestiones: 0, tareas_count: 0 });
    }
    const agregar = (cliente_id: string, campo: "gestiones" | "tareas_count") => {
      const responsable_id = responsableDelCliente.get(cliente_id);
      if (!responsable_id) return;
      const row = actividad.get(responsable_id) ?? {
        responsable_id,
        nombre: nombreDelResponsable.get(responsable_id) ?? "Sin responsable",
        gestiones: 0,
        tareas_count: 0,
      };
      row[campo] += 1;
      actividad.set(responsable_id, row);
    };
    for (const g of gestiones) agregar(g.cliente_id, "gestiones");
    for (const t of tareas) if (t.cliente_id) agregar(t.cliente_id, "tareas_count");
    const actividad_por_responsable = [...actividad.values()]
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
      .slice(0, EXPORT_MAX_ROWS);

    try {
      await logAudit({
        entidad: "dashboard",
        entidad_id: null,
        accion: "exportar",
        usuario_id: auth.usuario.id,
        cambios: {
          rows: sinGestion.length + actividad_por_responsable.length,
          cara: "clients-activity",
          sheets: {
            sin_gestion: sinGestion.length,
            actividad_por_responsable: actividad_por_responsable.length,
          },
          filters: { ...filters, dias_sin_gestion: dias } as unknown as Record<string, unknown>,
        },
      });
    } catch (err) {
      console.error("[dashboard/clients-activity] export audit failed:", err);
    }

    const workbook = new ExcelJS.Workbook();

    const sinGestionSheet = workbook.addWorksheet("Sin gestión");
    sinGestionSheet.columns = [
      { header: "Cliente", key: "nombre", width: 28 },
      { header: "Estado", key: "estado", width: 18 },
      { header: "Prioridad", key: "prioridad", width: 12 },
      { header: "Responsable", key: "responsable_nombre", width: 22 },
      { header: "Última gestión", key: "ultima_gestion", width: 16 },
    ];
    sinGestionSheet.getRow(1).font = { bold: true };
    sinGestionSheet.autoFilter = { from: "A1", to: "E1" };
    for (const c of sinGestion) {
      sinGestionSheet.addRow({
        nombre: c.nombre,
        estado: ESTADO_CLIENTE_LABELS[c.estado].label,
        prioridad: c.prioridad ? PRIORIDAD_CLIENTE_LABELS[c.prioridad].label : "",
        responsable_nombre: c.responsable_nombre,
        ultima_gestion: c.ultima_gestion ? c.ultima_gestion.toISOString().slice(0, 10) : "—",
      });
    }

    const actividadSheet = workbook.addWorksheet("Actividad por responsable");
    actividadSheet.columns = [
      { header: "Responsable", key: "nombre", width: 28 },
      { header: "Gestiones", key: "gestiones", width: 12 },
      { header: "Tareas", key: "tareas_count", width: 12 },
    ];
    actividadSheet.getRow(1).font = { bold: true };
    actividadSheet.autoFilter = { from: "A1", to: "C1" };
    for (const a of actividad_por_responsable) {
      actividadSheet.addRow({
        nombre: a.nombre,
        gestiones: a.gestiones,
        tareas_count: a.tareas_count,
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="actividad-clientes.xlsx"',
      },
    });
  },
);
