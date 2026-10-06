// TanStack Query data layer for the v2 projects module (S2.4, unidad 1:
// listado de solo lectura). El DTO declara la forma HTTP de
// GET /api/v1/projects (contrato E-02) — NO importa `ProjectItemV2` de
// src/lib/api/projects.ts, que arrastra `@/lib/db` y `next/server` y no puede
// entrar al bundle del cliente.
//
// Trampa documentada por la OpenAPI: `valor_total` y
// `diferencia_valor_oportunidad` son columnas `numeric` y viajan como STRING
// decimal ("180000000.00"). Se declaran `string | null` y se formatean para
// mostrar; nunca pasan por Number() en el DTO.

"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { apiGet, apiPost, ApiError } from "@/lib/api/http";
import type { AccionAuditoria, EstadoProyecto, OrigenProyecto } from "@prisma/client";

/* ── DTOs (forma real de la respuesta del servidor) ────────────────────── */

export type ProjectLinea = {
  id: string;
  codigo: string;
  nombre: string;
  principal: boolean;
};

export type ProjectMunicipio = {
  id: string;
  nombre: string;
  departamento: string;
};

/** Fila de `{ proyectos: ProjectListRow[] }` según `toProjectItemV2`. */
export type ProjectListRow = {
  id: string;
  codigo: string;
  nombre: string;
  estado: EstadoProyecto;
  origen: OrigenProyecto | null;
  cliente: { id: string; nombre: string };
  responsable: { id: string; nombre: string } | null;
  /** Columnas `@db.Date`: calendario `YYYY-MM-DD`, no instante ISO. */
  fecha_inicio: string | null;
  fecha_fin: string | null;
  /** Derivada en cada lectura por el servidor (`duracionProyecto`). */
  duracion_semanas: number | null;
  /** Decimal serializado: string, nunca número. */
  valor_total: string | null;
  /** Decimal serializado: string, nunca número. */
  diferencia_valor_oportunidad: string | null;
  beneficiarios_meta: number | null;
  lineas: ProjectLinea[];
  municipios: ProjectMunicipio[];
};

export type ProjectListResponse = {
  proyectos: ProjectListRow[];
};

/* ── DTO: historial de cambios (REQ-AUD-04) ─────────────────────────────── */

/**
 * Fila de `{ historial: ProjectAuditEntry[] }` de `GET /api/v1/projects/:id/audit`.
 * `valor_anterior`/`valor_nuevo` son el JSON del libro tal cual: el cliente lo
 * formatea para mostrar, nunca asume su forma. `usuario_nombre` es `null`
 * cuando el usuario ya no existe (el libro no lleva FK a propósito).
 */
export type ProjectAuditEntry = {
  id: string;
  created_at: string;
  usuario_id: string;
  usuario_nombre: string | null;
  accion: AccionAuditoria;
  entidad: string;
  entidad_id: string;
  campo: string | null;
  valor_anterior: unknown;
  valor_nuevo: unknown;
  lote_id: string | null;
};

export type ProjectAuditResponse = {
  historial: ProjectAuditEntry[];
};

/* ── DTOs: elegibles y catálogos (unidad 2: creación) ──────────────────── */

/** Fila de la respuesta de `GET /api/v1/projects/eligible-opportunities`. */
export type EligibleOpportunity = {
  id: string;
  nombre: string;
  cliente_id: string;
  cliente_nombre: string;
  /** Decimal serializado: string, nunca número. */
  valor_estimado_cop: string | null;
};

/** Fila de `GET /api/v1/strategic-lines` (`LINEA_SELECT`). */
export type StrategicLine = {
  id: string;
  codigo: string;
  nombre: string;
  activo: boolean;
  fecha_suspension: string | null;
  orden: number;
  created_at: string;
  updated_at: string;
};

/** Fila de `GET /api/v1/municipalities` (`MUNICIPIO_SELECT`). */
export type Municipality = {
  id: string;
  nombre: string;
  departamento: string;
  codigo_dane: string | null;
  activo: boolean;
  fecha_suspension: string | null;
  orden: number;
  created_at: string;
  updated_at: string;
};

/* ── Filtros (mismos query params que parsea el route) ─────────────────── */

export type ProjectFilters = {
  estado?: string;
  cliente_id?: string;
  linea_id?: string;
  municipio_id?: string;
  responsable_id?: string;
};

/* ── Query keys ────────────────────────────────────────────────────────── */

export const projectQueryKeys = {
  all: ["projects"] as const,
  list: (filters: ProjectFilters) => ["projects", "list", filters] as const,
  detail: (id: string) => ["projects", "detail", id] as const,
  audit: (id: string) => ["projects", "audit", id] as const,
  eligibleOpportunities: ["projects", "eligible-opportunities"] as const,
  // Los catálogos viven fuera de `projects` para que invalidar la lista de
  // proyectos no refetchee catálogos que no cambiaron.
  strategicLines: ["catalogs", "strategic-lines"] as const,
  municipalities: ["catalogs", "municipalities"] as const,
};

/* ── Queries ───────────────────────────────────────────────────────────── */

/** E-02: sin paginación — el server devuelve todo lo que el alcance permita. */
export function useProjects(filters: ProjectFilters): UseQueryResult<ProjectListResponse> {
  return useQuery({
    queryKey: projectQueryKeys.list(filters),
    queryFn: () => {
      const sp = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== "") sp.set(key, String(value));
      }
      return apiGet<ProjectListResponse>(`/api/v1/projects?${sp.toString()}`);
    },
  });
}

/**
 * E-06: ficha de un solo proyecto. La respuesta es el mismo `ProjectItemV2`
 * que la lista (`GET /api/v1/projects/:id` → `{ proyecto }`), así que el DTO
 * reutilizado es `ProjectListRow` y no se declara una copia. `enabled` evita
 * disparar la petición con un id vacío (409/404 evitables desde el cliente).
 */
export function useProject(id: string): UseQueryResult<ProjectListRow> {
  return useQuery({
    queryKey: projectQueryKeys.detail(id),
    enabled: id !== "",
    queryFn: async () => {
      const res = await apiGet<{ proyecto: ProjectListRow }>(`/api/v1/projects/${id}`);
      return res.proyecto;
    },
  });
}

/**
 * REQ-AUD-04: historial del proyecto. Cuelga del mismo prefijo `projects` que
 * la ficha, así que la invalidación de `projectQueryKeys.all` (["projects"])
 * tras crear o convertir un proyecto también lo refresca. `enabled` repite el
 * guard de `useProject`: con un id vacío no se dispara la petición.
 */
export function useProjectAudit(id: string): UseQueryResult<ProjectAuditEntry[]> {
  return useQuery({
    queryKey: projectQueryKeys.audit(id),
    enabled: id !== "",
    queryFn: async () => {
      const res = await apiGet<ProjectAuditResponse>(`/api/v1/projects/${id}/audit`);
      return res.historial;
    },
  });
}

/* ── Queries: elegibles y catálogos ────────────────────────────────────── */

/** E-04: oportunidades GANADA sin proyecto, para el paso de origen del form. */
export function useEligibleOpportunities(): UseQueryResult<EligibleOpportunity[]> {
  return useQuery({
    queryKey: projectQueryKeys.eligibleOpportunities,
    queryFn: async () => {
      const res = await apiGet<{ oportunidades: EligibleOpportunity[] }>(
        "/api/v1/projects/eligible-opportunities",
      );
      return res.oportunidades;
    },
  });
}

/** REQ-CAT-03: líneas activas ordenadas por código. */
export function useStrategicLines(): UseQueryResult<StrategicLine[]> {
  return useQuery({
    queryKey: projectQueryKeys.strategicLines,
    queryFn: async () => {
      const res = await apiGet<{ lineas: StrategicLine[] }>("/api/v1/strategic-lines");
      return res.lineas;
    },
  });
}

/** REQ-CAT-04: municipios activos. */
export function useMunicipalities(): UseQueryResult<Municipality[]> {
  return useQuery({
    queryKey: projectQueryKeys.municipalities,
    queryFn: async () => {
      const res = await apiGet<{ municipios: Municipality[] }>("/api/v1/municipalities");
      return res.municipios;
    },
  });
}

/* ── Mutations: creación (E-03 independiente / E-05 desde oportunidad) ─── */

export type ProjectLineaInput = { id: string; principal: boolean };

/** Campos compartidos por ambos endpoints de creación (`PROJECT_CREATE_BASE`). */
export type ProjectCreateBaseInput = {
  responsable_id: string;
  lineas: ProjectLineaInput[];
  municipio_ids: string[];
  /** Calendario `YYYY-MM-DD`, nunca instante ISO. */
  fecha_inicio: string;
  fecha_fin: string;
  valor_total?: number;
  beneficiarios_meta?: number;
};

/** E-03: proyecto INDEPENDIENTE con `cliente_id` en el cuerpo. */
export type ProjectCreateInput = ProjectCreateBaseInput & {
  nombre: string;
  cliente_id: string;
};

/**
 * E-05: el `cliente_id` viaja en la URL y `nombre` es opcional (el servidor
 * lo deriva de la oportunidad cuando se omite).
 */
export type ProjectCreateFromOpportunityInput = ProjectCreateBaseInput & {
  nombre?: string;
};

/**
 * Crea un proyecto independiente. `onSuccess` invalida TODO el namespace
 * `projects` (lista + detalle + elegibles) para que el nuevo proyecto aparezca
 * en `/proyectos` sin recargar (cierra el WARNING R3-stale-data).
 */
export function useCreateProject(): UseMutationResult<
  { proyecto: ProjectListRow },
  string,
  ProjectCreateInput
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input) => {
      try {
        return await apiPost<{ proyecto: ProjectListRow }>("/api/v1/projects", input);
      } catch (err) {
        return toastError(err, "No pudimos crear el proyecto. Inténtalo de nuevo.");
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: projectQueryKeys.all });
      toast.success("Proyecto creado.");
    },
  });
}

/**
 * E-05: convierte una oportunidad GANADA en proyecto. El `cliente_id` va en la
 * URL; el cuerpo lleva los mismos campos que E-03 menos `cliente_id`.
 */
export function useCreateProjectFromOpportunity(
  clientId: string,
  opportunityId: string,
): UseMutationResult<
  { proyecto: ProjectListRow },
  string,
  ProjectCreateFromOpportunityInput
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input) => {
      try {
        return await apiPost<{ proyecto: ProjectListRow }>(
          `/api/v1/clients/${clientId}/opportunities/${opportunityId}/project`,
          input,
        );
      } catch (err) {
        return toastError(err, "No pudimos crear el proyecto. Inténtalo de nuevo.");
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: projectQueryKeys.all });
      toast.success("Proyecto creado desde la oportunidad.");
    },
  });
}

function toastError(err: unknown, fallback: string): never {
  if (err instanceof ApiError) {
    toast.error(err.message);
  } else {
    toast.error(fallback);
  }
  throw err;
}
