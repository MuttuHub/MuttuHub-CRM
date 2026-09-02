// GET /api/v1/tasks/report — reporte de equipo (PRD §5.4, vista de reporte).
// NOT in the §8.2 contract (that lists tasks CRUD, status, comments,
// attachments and export, but no report endpoint): added for the Kanban
// milestone, following §5.4 por persona / por estado / por cliente.
//
// Parámetros: rango=week|month|quarter|all (default month) sobre updated_at
// (7/30/90 días), responsable y cliente (mismos filtros que la lista).
// La lectura es global: cualquier rol ve el reporte de todo el equipo.
//
// IMPORTANTE (proxy documentado): Tarea no tiene columna completed_at, así
// que "completada recientemente" y "a tiempo/tarde" usan updated_at como
// proxy: "a tiempo" ≈ updated_at <= fecha_entrega para tareas COMPLETADA con
// fecha de entrega (las completadas sin fecha no cuentan ni como a tiempo ni
// como tarde). Mismo criterio en README y en el reporte xlsx.
//
// Sin N+1: una sola query de tareas (select liviano) + una pasada de
// agregación en JS; los nombres de personas y clientes se resuelven con una
// sola query agrupada por id cada uno.

import { NextResponse } from "next/server";
import type { EstadoTarea } from "@prisma/client";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { ENUM_VALUES } from "@/lib/catalogs";
import { buildTaskWhere, parseTaskFilters } from "@/app/api/v1/tasks/route";

export const dynamic = "force-dynamic";

type Rango = "week" | "month" | "quarter" | "all";

const RANGOS: readonly Rango[] = ["week", "month", "quarter", "all"];
const RANGO_DAYS: Partial<Record<Rango, number>> = {
  week: 7,
  month: 30,
  quarter: 90,
};

export const GET = withApiErrorHandling(
  "tasks",
  "No pudimos generar el reporte. Inténtalo de nuevo.",
  async (request: Request) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const rangoRaw = url.searchParams.get("rango") ?? "month";
    if (!RANGOS.includes(rangoRaw as Rango)) {
      return apiError("Rango no válido (week | month | quarter | all).", 400, "VALIDATION_ERROR");
    }
    const rango = rangoRaw as Rango;

    const filters = parseTaskFilters(url);
    if (!filters.ok) return filters.response;

    const where = buildTaskWhere(filters.filters, auth.usuario);
    const days = rango === "all" ? undefined : RANGO_DAYS[rango];
    if (days) {
      where.updated_at = { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) };
    }

    const [rows, personas] = await Promise.all([
      db.tarea.findMany({
        where,
        select: {
          id: true,
          responsable_id: true,
          cliente_id: true,
          estado: true,
          fecha_entrega: true,
          updated_at: true,
        },
      }),
      db.usuario.findMany({
        where: { activo: true },
        select: { id: true, nombre: true },
        orderBy: { nombre: "asc" },
      }),
    ]);

    const porPersona = new Map<
      string,
      {
        id: string;
        nombre: string;
        asignadas: number;
        en_curso: number;
        vencidas: number;
        completadas: number;
        a_tiempo: number;
        tarde: number;
      }
    >();
    for (const p of personas) {
      porPersona.set(p.id, {
        id: p.id,
        nombre: p.nombre,
        asignadas: 0,
        en_curso: 0,
        vencidas: 0,
        completadas: 0,
        a_tiempo: 0,
        tarde: 0,
      });
    }

    const now = new Date();
    const porEstado: Record<string, number> = {};
    const porCliente = new Map<string, number>();
    let totalAsignadas = 0;
    let completadas = 0;
    let vencidasActivas = 0;
    let aTiempo = 0;
    let tarde = 0;

    for (const t of rows) {
      // Resumen y distribución por estado / cliente.
      totalAsignadas += 1;
      porEstado[t.estado] = (porEstado[t.estado] ?? 0) + 1;
      if (t.cliente_id) {
        porCliente.set(t.cliente_id, (porCliente.get(t.cliente_id) ?? 0) + 1);
      }

      const abierta = t.estado !== "COMPLETADA" && t.estado !== "CANCELADA";
      if (abierta) {
        if (t.fecha_entrega && t.fecha_entrega < now) vencidasActivas += 1;
      }
      if (t.estado === "COMPLETADA") {
        completadas += 1;
        if (t.fecha_entrega) {
          if (t.updated_at <= t.fecha_entrega) aTiempo += 1;
          else tarde += 1;
        }
      }

      // Desglose por persona (mismas reglas que el resumen).
      const persona = porPersona.get(t.responsable_id);
      if (!persona) continue; // responsable sin fila de usuario (debería ser imposible)
      persona.asignadas += 1;
      if (abierta) {
        persona.en_curso += 1;
        if (t.fecha_entrega && t.fecha_entrega < now) persona.vencidas += 1;
      }
      if (t.estado === "COMPLETADA") {
        persona.completadas += 1;
        if (t.fecha_entrega) {
          if (t.updated_at <= t.fecha_entrega) persona.a_tiempo += 1;
          else persona.tarde += 1;
        }
      }
    }

    const resumen = {
      total_asignadas: totalAsignadas,
      vencidas_activas: vencidasActivas,
      completadas,
      // Tasa de cumplimiento = completadas / asignadas, redondeada.
      tasa_cumplimiento: totalAsignadas === 0
        ? 0
        : Math.round((completadas / totalAsignadas) * 100),
      a_tiempo: aTiempo,
      tarde,
    };

    // Distribución por estado: todos los estados del catálogo, con ceros
    // (el CANCELADA queda visible en reportes, PRD §5.1).
    const porEstadoArr = (ENUM_VALUES.EstadoTarea as readonly EstadoTarea[]).map((estado) => ({
      estado,
      cantidad: porEstado[estado] ?? 0,
    }));

    // Clientes del set filtrado: una sola query para los nombres.
    const clienteIds = [...porCliente.keys()];
    const clientes = clienteIds.length > 0
      ? await db.cliente.findMany({
          where: { id: { in: clienteIds } },
          select: { id: true, nombre: true },
        })
      : [];
    const nombreByCliente = new Map(clientes.map((c) => [c.id, c.nombre]));
    const porClienteArr = [...porCliente.entries()]
      .map(([id, cantidad]) => ({ id, nombre: nombreByCliente.get(id) ?? "", cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad || a.id.localeCompare(b.id));

    return NextResponse.json({
      rango,
      resumen,
      por_persona: [...porPersona.values()],
      por_estado: porEstadoArr,
      por_cliente: porClienteArr,
    });
  },
);