// GET /api/v1/tasks/report — reporte de equipo (PRD §5.4, vista de reporte).
// NOT in the §8.2 contract (that lists tasks CRUD, status, comments,
// attachments and export, but no report endpoint): added for the Kanban
// milestone, following §5.4 por persona / por estado / por cliente.
//
// Parámetros: rango=week|month|quarter|all (default month) sobre updated_at
// (7/30/90 días), responsable y cliente (mismos filtros que la lista).
// La lectura es global: cualquier rol ve el reporte de todo el equipo.
//
// "A tiempo / tarde" usa completed_at (plan Fase 3, 3B): la marca REAL de
// cierre, no el proxy updated_at que se movía al renombrar/comentar una tarea
// ya completada (el reporte pasaba retroactivamente de "a tiempo" a "tarde").
// COALESCE(completed_at, updated_at) cubre las tareas pre-migración por
// seguridad, aunque el backfill ya congeló el proxy en completed_at.
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

const MS_DIA = 24 * 60 * 60 * 1000;

/** Lunes (UTC) de la semana de una fecha — etiqueta del bucket semanal.
 *  Operar en UTC hace el cálculo determinista sin importar la zona horaria de
 *  la máquina (Prisma lee los timestamps de Postgres como UTC). */
function inicioSemana(fecha: Date): string {
  const d = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));
  const dia = (d.getUTCDay() + 6) % 7; // 0 = lunes
  d.setUTCDate(d.getUTCDate() - dia);
  return d.toISOString().slice(0, 10);
}

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
      const desde = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      // PR 23 (plan 3B): el rango NO corre sobre updated_at para todo. Para
      // las COMPLETADA usa completed_at (la marca real de cierre) y para las
      // abiertas updated_at (su actividad). Antes "Semana" significaba
      // "tareas tocadas en 7 días" — renombrar una tarea completada hace un
      // año la traía al reporte de la semana. Ahora una COMPLETADA solo
      // aparece si se cerró en el período. Cambia TODOS los números de la
      // pantalla (nota de release) y la UI declara el criterio en `meta`.
      const rangoOr = [
        { estado: { not: "COMPLETADA" as EstadoTarea }, updated_at: { gte: desde } },
        { estado: "COMPLETADA" as EstadoTarea, completed_at: { gte: desde } },
      ];
      // buildTaskWhere puede ya haber puesto un OR (con q): en vez de
      // pisarlo, se combinan — `(q OR ...) AND (rango)`.
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: rangoOr }];
        delete where.OR;
      } else {
        where.OR = rangoOr;
      }
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
          completed_at: true,
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

    // PR 20 (plan 3B): vencimientos por antigüedad — convierte "Vencidas
    // activas: 23" (un número con el que no podés hacer nada) en "17 de las 23
    // llevan más de un mes". El bucket "Sin fecha de entrega" además saca a la
    // luz la población que el cálculo actual descarta en silencio. Cero
    // queries extra: se acumula en este mismo bucle.
    let vencidasMenosSemana = 0;
    let vencidas1a4Semanas = 0;
    let vencidasMasDeMes = 0;
    let abiertasSinFecha = 0;

    // PR 20: carga por semana de entrega (histograma exacto sobre
    // fecha_entrega, no un proxy), alimenta el Sparkline existente.
    const cargaSemanal = new Map<string, number>();

    // PR 22 (plan 3B): tendencia de cierre — cierres por semana sobre
    // completed_at (la marca real, no updated_at). No se envía una línea
    // rotulada "cierres por semana" que en realidad grafica "tareas editadas
    // por semana": la columna completed_at (PR 21) hace la serie honesta.
    const cierresSemanal = new Map<string, number>();

    for (const t of rows) {
      // Resumen y distribución por estado / cliente.
      totalAsignadas += 1;
      porEstado[t.estado] = (porEstado[t.estado] ?? 0) + 1;
      if (t.cliente_id) {
        porCliente.set(t.cliente_id, (porCliente.get(t.cliente_id) ?? 0) + 1);
      }

      const abierta = t.estado !== "COMPLETADA" && t.estado !== "CANCELADA";
      if (abierta) {
        if (t.fecha_entrega) {
          if (t.fecha_entrega < now) {
            vencidasActivas += 1;
            const dias = Math.floor((now.getTime() - t.fecha_entrega.getTime()) / MS_DIA);
            if (dias < 7) vencidasMenosSemana += 1;
            else if (dias < 30) vencidas1a4Semanas += 1;
            else vencidasMasDeMes += 1;
          }
          // Carga semanal: todas las tareas abiertas con fecha de entrega
          // (vencidas o futuras) agrupan por la semana de esa fecha.
          const semana = inicioSemana(t.fecha_entrega);
          cargaSemanal.set(semana, (cargaSemanal.get(semana) ?? 0) + 1);
        } else {
          abiertasSinFecha += 1;
        }
      }
      if (t.estado === "COMPLETADA") {
        completadas += 1;
        if (t.fecha_entrega) {
          // completed_at es la marca real (3B); COALESCE cubre pre-backfill.
          const cierre = t.completed_at ?? t.updated_at;
          if (cierre <= t.fecha_entrega) aTiempo += 1;
          else tarde += 1;
        }
        // Tendencia de cierre: la semana del completed_at REAL (COALESCE
        // cubre las COMPLETADA previas al backfill de PR 21).
        const semanaCierre = inicioSemana(t.completed_at ?? t.updated_at);
        cierresSemanal.set(semanaCierre, (cierresSemanal.get(semanaCierre) ?? 0) + 1);
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
          const cierre = t.completed_at ?? t.updated_at;
          if (cierre <= t.fecha_entrega) persona.a_tiempo += 1;
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

    // PR 20 (plan 3B): vencimientos por antigüedad — el bucket "sin fecha de
    // entrega" saca a la luz la población que el resumen descarta en silencio.
    const vencimientosPorAntiguedad = [
      { bucket: "menos de 1 semana", cantidad: vencidasMenosSemana },
      { bucket: "1 a 4 semanas", cantidad: vencidas1a4Semanas },
      { bucket: "más de 1 mes", cantidad: vencidasMasDeMes },
      { bucket: "sin fecha de entrega", cantidad: abiertasSinFecha },
    ];

    // Carga por semana de entrega: histograma exacto sobre fecha_entrega de
    // las tareas abiertas, ordenado ascendente (para el Sparkline).
    const cargaSemanalArr = [...cargaSemanal.entries()]
      .map(([semana, cantidad]) => ({ semana, cantidad }))
      .sort((a, b) => a.semana.localeCompare(b.semana));

    // PR 22: tendencia de cierre — misma forma, serie sobre completed_at.
    const tendenciaCierreArr = [...cierresSemanal.entries()]
      .map(([semana, cantidad]) => ({ semana, cantidad }))
      .sort((a, b) => a.semana.localeCompare(b.semana));

    return NextResponse.json({
      rango,
      resumen,
      por_persona: [...porPersona.values()],
      por_estado: porEstadoArr,
      por_cliente: porClienteArr,
      vencimientos_por_antiguedad: vencimientosPorAntiguedad,
      carga_semanal: cargaSemanalArr,
      tendencia_cierre: tendenciaCierreArr,
      // PR 23 (plan 3B): la UI y el PDF declaran el criterio del rango desde
      // el payload (no hardcodeado), para que un cambio futuro de criterio
      // desaparezca de pantalla y PDF sin editar UI.
      meta: {
        criterio_rango:
          "completadas por completed_at, abiertas por updated_at",
      },
    });
  },
);