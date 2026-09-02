// GET /api/v1/dashboard/tasks — cara "Gestión de Tareas" (PRD §7.1): estado
// del tablero, cumplimiento por persona y tareas vencidas activas.
//
// Filtros comunes (PRD §7.2): `desde`/`hasta` aplican sobre
// Tarea.fecha_entrega (las tareas sin fecha quedan fuera solo cuando hay
// rango); `responsable_id` (scope "all" filtra; "own" lo ignora en silencio);
// `tipo_cliente` vía cliente. Solo tareas sin borrar (deleted_at = null).
//
// Definiciones (documentadas):
// - "completada" = estado COMPLETADA (schema).
// - "cumplida (a tiempo)" = COMPLETADA con updated_at <= fecha_entrega — la
//   tarea se cerró antes o el mismo día del límite. Una COMPLETADA sin
//   fecha_entrega cuenta como completada pero no como cumplidas.
// - `vencidas` = tareas abiertas (OPEN_TASK_STATES) con fecha_entrega <
//   inicio del día local actual (misma regla del motor de alertas
//   src/lib/alerts.ts); SIEMPRE "ahora", independiente del rango de fechas
//   (documentado). Lista máxima 20, ordenada asc por fecha_entrega.
// - `por_columna` usa los estados visibles del tablero (CANCELADA queda
//   fuera, oculto en tablero según schema) con label de catálogos.

import { NextResponse } from "next/server";
import type { EstadoTarea } from "@prisma/client";
import { db } from "@/lib/db";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { OPEN_TASK_STATES } from "@/lib/api/crm";
import { startOfLocalDay } from "@/lib/alerts";
import { ESTADO_TAREA_LABELS } from "@/lib/catalogs";
import {
  parseDashboardFilters,
  rangoDeFechasNullable,
  tareaScopeWhere,
} from "@/lib/dashboard";

export const dynamic = "force-dynamic";

/** Columnas visibles del tablero (schema): CANCELADA queda fuera y solo
 * aparece en reportes. */
const BOARD_STATES: readonly EstadoTarea[] = [
  "POR_HACER",
  "EN_CURSO",
  "EN_REVISION",
  "BLOQUEADA",
  "EN_ESPERA",
  "COMPLETADA",
];

/** Top de vencidas devueltas (PRD §7.1 "con acceso directo"). */
const MAX_VENCIDAS_LISTA = 20;

export const GET = withApiErrorHandling(
  "dashboard/tasks",
  "No pudimos cargar la gestión de tareas. Inténtalo de nuevo.",
  async (request: Request) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const parsed = parseDashboardFilters(url);
    if (!parsed.ok) return parsed.response;
    const filters = parsed.filters;

    // PR 3 (close-phase-1): read scope is global — the board face sees every
    // task for every role, including COLABORADOR.
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

    const por_columna = BOARD_STATES.map((estado) => ({
      estado,
      label: ESTADO_TAREA_LABELS[estado].label,
      count: tareas.filter((t) => t.estado === estado).length,
    }));

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
        // Plan Fase 3 (3B): la marca real de cierre, no el proxy updated_at.
        const cierre = t.completed_at ?? t.updated_at;
        if (t.fecha_entrega && cierre <= t.fecha_entrega) {
          persona.cumplidas += 1;
        }
      }
      porPersona.set(t.responsable_id, persona);
    }
    const cumplimiento_por_persona = [...porPersona.values()]
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
      .map((p) => ({
        ...p,
        porc: Math.round((p.cumplidas / p.total) * 100),
      }));

    const lista = vencidas.slice(0, MAX_VENCIDAS_LISTA).map((v) => ({
      id: v.id,
      titulo: v.titulo,
      responsable_nombre: v.responsable.nombre,
      fecha_entrega: v.fecha_entrega,
      cliente_nombre: v.cliente?.nombre ?? null,
    }));

    return NextResponse.json({
      scope,
      por_columna,
      cumplimiento_por_persona,
      vencidas: { count: vencidas.length, lista },
    });
  },
);
