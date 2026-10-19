// TanStack Query data layer for the Dashboard module (Hito 6, PRD §7).
// DTOs mirror the EXACT server response shapes from src/app/api/v1/dashboard
// (pipeline, tasks, clients-activity, my-summary) and the common filters
// (§7.2) parsed by src/lib/dashboard.ts. Hooks refetch whenever the filter
// object changes (the query key includes it); the four "faces" consume them
// in their own components under src/components/dashboard.

"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/http";
import type {
  EstadoCliente,
  EstadoOportunidad,
  EstadoTarea,
  OrigenTarea,
  PrioridadCliente,
  TipoCliente,
} from "@prisma/client";

/* ── DTOs (server response shapes) ─────────────────────────────────────── */

/** Filtros comunes del dashboard (PRD §7.2), espejo de DashboardFilters en src/lib/dashboard.ts. */
export type DashboardFilters = {
  desde?: string;
  hasta?: string;
  responsable_id?: string;
  tipo_cliente?: string;
};

/**
 * Fechas (YYYY-MM-DD, zona local) del mes calendario en curso: primer día del
 * mes hasta hoy. Es el rango que aplica el preset "Este mes" (compartido por
 * el header y el dashboard via src/store/filters.ts). Vive acá (espejo client
 * de los filtros) y no en src/lib/dashboard.ts — ese módulo es server-only
 * (importa Prisma y no puede entrar al bundle del cliente).
 */
export function rangoMesActual(ahora: Date = new Date()): { desde: string; hasta: string } {
  const anio = ahora.getFullYear();
  const mes = String(ahora.getMonth() + 1).padStart(2, "0");
  const dia = String(ahora.getDate()).padStart(2, "0");
  return { desde: `${anio}-${mes}-01`, hasta: `${anio}-${mes}-${dia}` };
}

/** Serializa los filtros en la query string del API (solo valores presentes). */
export function buildDashboardQuery(
  filters: DashboardFilters,
  extra?: { dias_sin_gestion?: number },
): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "") sp.set(key, value);
  }
  if (extra?.dias_sin_gestion) sp.set("dias_sin_gestion", String(extra.dias_sin_gestion));
  return sp.toString();
}

/* ── GET /api/v1/dashboard/pipeline ─────────────────────────────────────── */

export type PipelineEmbudo = { estado: EstadoOportunidad; count: number };
export type TopCliente = {
  cliente_id: string;
  nombre: string;
  valor_potencial: number;
};

export type DashboardPipeline = {
  scope: "own" | "all";
  total_activas: number;
  valor_activo: number;
  embudo: PipelineEmbudo[];
  top_clientes: TopCliente[];
  comparativo: { potencial_activo: number; ganado_historico: number; ratio: number };
};

/* ── GET /api/v1/dashboard/tasks ────────────────────────────────────────── */

export type ColumnaTareas = { estado: EstadoTarea; label: string; count: number };
export type CumplimientoPersona = {
  responsable_id: string;
  nombre: string;
  total: number;
  completadas: number;
  cumplidas: number;
  porc: number;
};
export type VencidaTarea = {
  id: string;
  titulo: string;
  responsable_nombre: string;
  fecha_entrega: string;
  cliente_nombre: string | null;
};

export type DashboardTasks = {
  scope: "own" | "all";
  por_columna: ColumnaTareas[];
  cumplimiento_por_persona: CumplimientoPersona[];
  vencidas: { count: number; lista: VencidaTarea[] };
};

/* ── GET /api/v1/dashboard/clients-activity ─────────────────────────────── */

export type ClienteSinGestion = {
  cliente_id: string;
  nombre: string;
  estado: EstadoCliente;
  prioridad: PrioridadCliente | null;
  responsable_nombre: string;
  ultima_gestion: string | null;
};

export type DashboardClientsActivity = {
  scope: "own" | "all";
  sin_gestion: { dias: number; clientes: ClienteSinGestion[] };
  distribucion: {
    por_tipo: { tipo: TipoCliente; count: number }[];
    por_estado: { estado: EstadoCliente; count: number }[];
    por_prioridad: { prioridad: PrioridadCliente; count: number }[];
  };
  actividad_por_responsable: {
    responsable_id: string;
    nombre: string;
    gestiones: number;
    tareas_count: number;
  }[];
};

/* ── GET /api/v1/dashboard/my-summary ───────────────────────────────────── */

export type TareaResumen = {
  id: string;
  titulo: string;
  estado: EstadoTarea;
  fecha_entrega: string | null;
  origen: OrigenTarea;
};

export type ClienteAsignado = {
  cliente_id: string;
  nombre: string;
  estado: EstadoCliente;
  prioridad: PrioridadCliente | null;
};

export type DashboardMySummary = {
  scope: "own";
  activas: { count: number; items: TareaResumen[] };
  vencidas: { count: number; items: TareaResumen[] };
  hoy: { count: number };
  compromisos_pendientes: { count: number; vencidos: number };
  clientes_asignados: { count: number; items: ClienteAsignado[] };
};

/* ── Query keys (filters included → refetch per change) ─────────────────── */

export const dashboardQueryKeys = {
  pipeline: (filters: DashboardFilters) => ["dashboard", "pipeline", filters] as const,
  tasks: (filters: DashboardFilters) => ["dashboard", "tasks", filters] as const,
  clientsActivity: (filters: DashboardFilters, dias: number) =>
    ["dashboard", "clients-activity", filters, dias] as const,
  mySummary: (filters: DashboardFilters) => ["dashboard", "my-summary", filters] as const,
};

/* ── Queries ────────────────────────────────────────────────────────────── */

export function useDashboardPipeline(
  filters: DashboardFilters,
): UseQueryResult<DashboardPipeline> {
  return useQuery({
    queryKey: dashboardQueryKeys.pipeline(filters),
    queryFn: () =>
      apiGet<DashboardPipeline>(`/api/v1/dashboard/pipeline?${buildDashboardQuery(filters)}`),
  });
}

export function useDashboardTasks(filters: DashboardFilters): UseQueryResult<DashboardTasks> {
  return useQuery({
    queryKey: dashboardQueryKeys.tasks(filters),
    queryFn: () =>
      apiGet<DashboardTasks>(`/api/v1/dashboard/tasks?${buildDashboardQuery(filters)}`),
  });
}

export function useDashboardClientsActivity(
  filters: DashboardFilters,
  dias: number,
): UseQueryResult<DashboardClientsActivity> {
  return useQuery({
    queryKey: dashboardQueryKeys.clientsActivity(filters, dias),
    queryFn: () =>
      apiGet<DashboardClientsActivity>(
        `/api/v1/dashboard/clients-activity?${buildDashboardQuery(filters, { dias_sin_gestion: dias })}`,
      ),
  });
}

export function useDashboardMySummary(
  filters: DashboardFilters,
): UseQueryResult<DashboardMySummary> {
  return useQuery({
    queryKey: dashboardQueryKeys.mySummary(filters),
    queryFn: () =>
      apiGet<DashboardMySummary>(`/api/v1/dashboard/my-summary?${buildDashboardQuery(filters)}`),
  });
}