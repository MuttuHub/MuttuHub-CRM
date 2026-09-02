// Helpers compartidos del módulo Dashboard (Hito 6, PRD §7): parseo de los
// filtros comunes (§7.2) y constructores de `where` base para las cuatro
// caras (pipeline, tasks, clients-activity, my-summary).
//
// PR 3 (close-phase-1): las lecturas del dashboard son GLOBALES para todos
// los roles. Las cuatro caras (`pipeline`, `tasks`, `clients-activity`) y
// `nav/counts` pasan el literal `"all"` en el call site — ya no hay helper
// `resolveScope` (borrado en este PR). `my-summary` sigue con `"own"` por
// definición (siempre devuelve los datos de quien llama). Los helpers
// `clienteScopeWhere` / `tareaScopeWhere` permanecen porque `my-summary` los
// usa todavía; en cualquier otro call site hoy se invocan con `"all"`.
//
// Volumen pequeño (SMALL, PRD §8.4): las caras agregan con findMany + JS en
// lugar de groupBy (patrón fijado del repo en Prisma 7).

import type { Prisma, TipoCliente, Usuario } from "@prisma/client";
import { apiError } from "@/lib/api/errors";
import { endOfDay } from "@/lib/api/crm";
import { ENUM_VALUES } from "@/lib/catalogs";

export type DashboardScope = "own" | "all";

export type DashboardFilters = {
  desde?: string;
  hasta?: string;
  responsable_id?: string;
  tipo_cliente?: string;
};

/**
 * Parseo de los filtros comunes del dashboard (PRD §7.2):
 * - `desde`/`hasta` en formato estricto YYYY-MM-DD (inclusivos); malformados
 *   → 400 VALIDATION_ERROR. Ausentes → todo el histórico.
 * - `responsable_id`: cualquier uuid; en scope "own" se ignora downstream.
 * - `tipo_cliente`: enum TipoCliente del schema (ENUM_VALUES).
 */
export function parseDashboardFilters(
  url: URL,
):
  | { ok: true; filters: DashboardFilters }
  | { ok: false; response: Response } {
  const sp = url.searchParams;

  const desde = sp.get("desde") ?? undefined;
  const hasta = sp.get("hasta") ?? undefined;
  if (desde && !/^\d{4}-\d{2}-\d{2}$/.test(desde)) {
    return { ok: false, response: apiError("Fecha 'desde' no válida (YYYY-MM-DD).", 400, "VALIDATION_ERROR") };
  }
  if (hasta && !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
    return { ok: false, response: apiError("Fecha 'hasta' no válida (YYYY-MM-DD).", 400, "VALIDATION_ERROR") };
  }
  if (desde && hasta && desde > hasta) {
    return { ok: false, response: apiError("El rango de fechas no es válido (desde > hasta).", 400, "VALIDATION_ERROR") };
  }

  const tipoCliente = sp.get("tipo_cliente") ?? undefined;
  if (tipoCliente && !ENUM_VALUES.TipoCliente.includes(tipoCliente as TipoCliente)) {
    return { ok: false, response: apiError("Tipo de cliente no válido.", 400, "VALIDATION_ERROR") };
  }

  return {
    ok: true,
    filters: {
      desde,
      hasta,
      responsable_id: sp.get("responsable_id") ?? undefined,
      tipo_cliente: tipoCliente,
    },
  };
}

/** Rango de fechas inclusivo para campos DateTime (desde a fin de `hasta`). */
export function rangoDeFechas(
  filters: DashboardFilters,
): Prisma.DateTimeFilter | undefined {
  const gte = filters.desde ? new Date(filters.desde) : undefined;
  const lte = filters.hasta ? endOfDay(new Date(filters.hasta)) : undefined;
  return gte || lte ? { ...(gte && { gte }), ...(lte && { lte }) } : undefined;
}

/** Rango de fechas inclusivo para campos DateTime anulables (ej. fecha_entrega). */
export function rangoDeFechasNullable(
  filters: DashboardFilters,
): Prisma.DateTimeNullableFilter | undefined {
  return rangoDeFechas(filters);
}

/**
 * `where` base de clientes con el alcance aplicado: "own" fuerza
 * responsable_id = self (el filtro `responsable_id` del query se ignora en
 * silencio); "all" respeta el filtro cuando viene. `tipo_cliente` aplica
 * siempre.
 */
export function clienteScopeWhere(
  scope: DashboardScope,
  usuario: Pick<Usuario, "id">,
  filters: DashboardFilters,
): Prisma.ClienteWhereInput {
  return {
    deleted_at: null,
    ...(scope === "own"
      ? { responsable_id: usuario.id }
      : filters.responsable_id
        ? { responsable_id: filters.responsable_id }
        : {}),
    ...(filters.tipo_cliente
      ? { tipo_cliente: filters.tipo_cliente as TipoCliente }
      : {}),
  };
}

/**
 * `where` base de tareas del dashboard: scope (COLABORADOR → propias, filtro
 * responsable_id ignorado; roles completos → filtro respetado) + tipo_cliente
 * vía cliente + extras (rango de fecha_entrega, estados, etc.).
 */
export function tareaScopeWhere(
  scope: DashboardScope,
  usuario: Pick<Usuario, "id">,
  filters: DashboardFilters,
  extra: Prisma.TareaWhereInput = {},
): Prisma.TareaWhereInput {
  return {
    deleted_at: null,
    ...(scope === "own"
      ? { responsable_id: usuario.id }
      : filters.responsable_id
        ? { responsable_id: filters.responsable_id }
        : {}),
    ...(filters.tipo_cliente
      ? {
          cliente: {
            is: { tipo_cliente: filters.tipo_cliente as TipoCliente },
          },
        }
      : {}),
    ...extra,
  };
}