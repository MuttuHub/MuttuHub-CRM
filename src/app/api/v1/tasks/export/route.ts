// GET /api/v1/tasks/export — xlsx de tareas (PRD §8.4) con los mismos filtros
// y alcance de roles que GET /tasks (reusa parseTaskFilters + buildTaskWhere).
// Columnas en español; estados/origenes/prioridades con etiqueta del catálogo.
// Subtareas como "completadas/total" (dos groupBy sobre el conjunto filtrado).
// Cap: primeras 500 filas del conjunto filtrado (PRD §8.4).
// "A tiempo/tarde" comparte el proxy del reporte de equipo (updated_at <=
// fecha_entrega para COMPLETADA) — el xlsx no los expone como columnas, pero
// el criterio queda documentado en el README (Hito 3).

import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import {
  ESTADO_TAREA_LABELS,
  ORIGEN_TAREA_LABELS,
  PRIORIDAD_TAREA_LABELS,
} from "@/lib/catalogs";
import { buildTaskWhere, parseTaskFilters } from "@/app/api/v1/tasks/route";

export const dynamic = "force-dynamic";

const EXPORT_MAX_ROWS = 500; // PRD §8.4 cap para exportaciones.

export const GET = withApiErrorHandling(
  "tasks",
  "No pudimos generar el archivo. Inténtalo de nuevo.",
  async (request: Request) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const filters = parseTaskFilters(url, auth.usuario.rol);
    if (!filters.ok) return filters.response;

    const where = buildTaskWhere(filters.filters, auth.usuario);
    const rows = await db.tarea.findMany({
      where,
      select: {
        id: true,
        titulo: true,
        descripcion: true,
        estado: true,
        origen: true,
        prioridad: true,
        fecha_entrega: true,
        etiquetas: true,
        motivo_bloqueo: true,
        created_at: true,
        responsable: { select: { nombre: true } },
        cliente: { select: { nombre: true } },
      },
      orderBy: { updated_at: "desc" },
      take: EXPORT_MAX_ROWS,
    });
    const ids = rows.map((r) => r.id);

    // Conteos de subtareas del conjunto exportado: dos groupBy (totales y
    // completadas) en lugar de N+1.
    const [totalesRaw, completadasRaw] = await Promise.all([
      db.subtarea.groupBy({
        by: ["tarea_id"],
        where: { tarea_id: { in: ids } },
        _count: { _all: true },
      }),
      db.subtarea.groupBy({
        by: ["tarea_id"],
        where: { tarea_id: { in: ids }, completada: true },
        _count: { _all: true },
      }),
    ]);

    // Defensivo contra la forma del _count en Prisma 7 (objeto o número).
    const totalesBy = new Map<string, number>(
      totalesRaw.map((g) => {
        const n = typeof g._count === "object" ? (g._count._all ?? 0) : 0;
        return [g.tarea_id, n] as const;
      }),
    );
    const completadasBy = new Map<string, number>(
      completadasRaw.map((g) => {
        const n = typeof g._count === "object" ? (g._count._all ?? 0) : 0;
        return [g.tarea_id, n] as const;
      }),
    );

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Tareas");
    sheet.columns = [
      { header: "Título", key: "titulo", width: 32 },
      { header: "Descripción", key: "descripcion", width: 40 },
      { header: "Responsable", key: "responsable", width: 22 },
      { header: "Cliente", key: "cliente", width: 22 },
      { header: "Estado", key: "estado", width: 16 },
      { header: "Origen", key: "origen", width: 10 },
      { header: "Prioridad", key: "prioridad", width: 10 },
      { header: "Fecha entrega", key: "fecha_entrega", width: 14 },
      { header: "Etiquetas", key: "etiquetas", width: 24 },
      { header: "Bloqueada (motivo)", key: "motivo_bloqueo", width: 32 },
      { header: "Subtareas", key: "subtareas", width: 10 },
      { header: "Creada", key: "created_at", width: 14 },
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.autoFilter = { from: "A1", to: "L1" };

    for (const r of rows) {
      const totales = totalesBy.get(r.id) ?? 0;
      const completadas = completadasBy.get(r.id) ?? 0;
      sheet.addRow({
        titulo: r.titulo,
        descripcion: r.descripcion ?? "",
        responsable: r.responsable.nombre,
        cliente: r.cliente?.nombre ?? "",
        estado: ESTADO_TAREA_LABELS[r.estado].label,
        origen: ORIGEN_TAREA_LABELS[r.origen].label,
        prioridad: r.prioridad ? PRIORIDAD_TAREA_LABELS[r.prioridad].label : "",
        fecha_entrega: r.fecha_entrega ? r.fecha_entrega.toISOString().slice(0, 10) : "—",
        etiquetas: r.etiquetas.join(", "),
        // Solo tareas BLOQUEADA llevan motivo (validado en el POST/PATCH).
        motivo_bloqueo: r.estado === "BLOQUEADA" ? (r.motivo_bloqueo ?? "") : "",
        subtareas: `${completadas}/${totales}`,
        created_at: r.created_at.toISOString().slice(0, 10),
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="tareas.xlsx"',
      },
    });
  },
);