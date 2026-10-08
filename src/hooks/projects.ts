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
import { apiDelete, apiGet, apiPatch, apiPost, ApiError } from "@/lib/api/http";
import type {
  AccionAuditoria,
  EstadoProyecto,
  OrigenProyecto,
  RolUsuario,
} from "@prisma/client";

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

/* ── DTO: equipo del proyecto (E-07) ────────────────────────────────────── */

/** Fila de `{ miembros: ProjectMember[] }` y de `{ miembro }` (`toProyectoMiembroItemV2`). */
export type ProjectMember = {
  id: string;
  usuario: { id: string; nombre: string; rol: RolUsuario };
  agregado_por_id: string;
  created_at: string;
  removed_at: string | null;
};

/* ── DTOs: estructura técnica (S3: objetivos, actividades, entregables, indicadores) ── */

/** Fila de `{ objetivos }` y de `{ objetivo }` (`toObjetivoView`). */
export type ProjectObjective = {
  id: string;
  proyecto_id: string;
  codigo: string;
  descripcion: string;
  orden: number;
  created_at: string;
  updated_at: string;
};

/**
 * Fila de `{ actividades }` (`toActividadV2View`). Las fechas son DERIVADAS de
 * las semanas y la fecha de inicio del proyecto (nunca se envían); `peso` es
 * número y `peso_manual` indica que lo escribió una persona.
 */
export type ProjectActivity = {
  id: string;
  proyecto_id: string;
  objetivo_id: string;
  codigo: string;
  nombre: string;
  semana_inicio: number;
  semana_fin: number;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  peso: number;
  peso_manual: boolean;
  responsable_id: string | null;
  /** Las semanas superan la duración actual del proyecto (el proyecto se acortó). */
  fuera_de_duracion: boolean;
  created_at: string;
  updated_at: string;
};

/** Fila de `{ entregables }`. `cantidad_meta` es `Decimal(15,2)`: viaja como STRING. */
export type ProjectDeliverable = {
  id: string;
  proyecto_id: string;
  actividad_id: string;
  codigo: string;
  descripcion: string;
  cantidad_meta: string;
  unidad: string;
  tipo_medio_exigido: string;
  created_at: string;
  updated_at: string;
};

/** Fila de `{ indicadores }`. `meta` y `linea_base` son `Decimal(15,2)`: viajan como STRING. */
export type ProjectIndicator = {
  id: string;
  proyecto_id: string;
  objetivo_id: string;
  codigo: string;
  nombre: string;
  meta: string;
  unidad: string;
  linea_base: string | null;
  created_at: string;
  updated_at: string;
};

/** Cuerpos de escritura: los códigos son texto libre del cliente (máx. 50). */
export type ProjectObjectiveInput = { codigo: string; descripcion: string; orden?: number };

export type ProjectActivityInput = {
  objetivo_id: string;
  codigo: string;
  nombre: string;
  semana_inicio: number;
  semana_fin: number;
  /** Número = peso manual; `null` = volver al peso por defecto (duración en semanas). */
  peso?: number | null;
  responsable_id?: string | null;
};

export type ProjectDeliverableInput = {
  actividad_id: string;
  codigo: string;
  descripcion: string;
  cantidad_meta: number;
  unidad: string;
  tipo_medio_exigido: string;
};

export type ProjectIndicatorInput = {
  objetivo_id: string;
  codigo: string;
  nombre: string;
  meta: number;
  unidad: string;
  linea_base?: number | null;
};

/** Variables de una edición: el id de la fila y el parche parcial. */
export type ProjectStructureUpdate<TInput> = { id: string; data: Partial<TInput> };

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
  members: (id: string) => ["projects", "members", id] as const,
  objectives: (id: string) => ["projects", "objectives", id] as const,
  activities: (id: string) => ["projects", "activities", id] as const,
  deliverables: (id: string) => ["projects", "deliverables", id] as const,
  indicators: (id: string) => ["projects", "indicators", id] as const,
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

/**
 * E-07: integrantes ACTIVOS del equipo. Cuelga del prefijo `projects`, así que
 * invalidar `projectQueryKeys.all` también lo refresca. `enabled` repite el
 * guard de `useProject`.
 */
export function useProjectMembers(id: string): UseQueryResult<ProjectMember[]> {
  return useQuery({
    queryKey: projectQueryKeys.members(id),
    enabled: id !== "",
    queryFn: async () => {
      const res = await apiGet<{ miembros: ProjectMember[] }>(`/api/v1/projects/${id}/members`);
      return res.miembros;
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

/**
 * E-07: agrega un COORDINADOR al equipo. El error (409 ya es integrante, 400 no
 * es un Coordinador activo) se re-lanza como `ApiError` sin toast: quien llama
 * lo muestra en línea junto al control, con el mensaje del servidor.
 */
export function useAddProjectMember(
  projectId: string,
): UseMutationResult<{ miembro: ProjectMember }, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (usuarioId) =>
      apiPost<{ miembro: ProjectMember }>(`/api/v1/projects/${projectId}/members`, {
        usuario_id: usuarioId,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: projectQueryKeys.members(projectId) });
    },
  });
}

/** E-07: baja lógica (`removed_at`) del integrante; la fila se conserva. */
export function useRemoveProjectMember(
  projectId: string,
): UseMutationResult<{ miembro: ProjectMember }, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (usuarioId) =>
      apiDelete<{ miembro: ProjectMember }>(
        `/api/v1/projects/${projectId}/members/${usuarioId}`,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: projectQueryKeys.members(projectId) });
    },
  });
}

/* ── Estructura técnica (S3 U4) ─────────────────────────────────────────── */
//
// Las cuatro colecciones comparten el mismo contrato que el equipo: la query
// cuelga del prefijo `projects`, las mutaciones invalidan SU lista y relanzan
// el `ApiError` sin toast (el 400/409 del servidor se muestra en línea).

function useStructureList<TRow>(
  projectId: string,
  key: readonly unknown[],
  path: string,
  field: string,
): UseQueryResult<TRow[]> {
  return useQuery({
    queryKey: key,
    enabled: projectId !== "",
    queryFn: async () => {
      const res = await apiGet<Record<string, TRow[]>>(`/api/v1/projects/${projectId}/${path}`);
      return res[field];
    },
  });
}

function useStructureMutations<TRow, TInput>(
  projectId: string,
  key: readonly unknown[],
  path: string,
  field: string,
) {
  const qc = useQueryClient();
  const base = `/api/v1/projects/${projectId}/${path}`;
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: key });
  };
  return {
    create: {
      mutationFn: async (input: TInput) => (await apiPost<Record<string, TRow>>(base, input))[field],
      onSuccess: refresh,
    },
    update: {
      mutationFn: async ({ id, data }: ProjectStructureUpdate<TInput>) =>
        (await apiPatch<Record<string, TRow>>(`${base}/${id}`, data))[field],
      onSuccess: refresh,
    },
    remove: {
      mutationFn: async (id: string) => (await apiDelete<Record<string, TRow>>(`${base}/${id}`))[field],
      onSuccess: refresh,
    },
  };
}

export function useProjectObjectives(id: string): UseQueryResult<ProjectObjective[]> {
  return useStructureList(id, projectQueryKeys.objectives(id), "objectives", "objetivos");
}

export function useCreateObjective(
  projectId: string,
): UseMutationResult<ProjectObjective, Error, ProjectObjectiveInput> {
  return useMutation(
    useStructureMutations<ProjectObjective, ProjectObjectiveInput>(
      projectId, projectQueryKeys.objectives(projectId), "objectives", "objetivo",
    ).create,
  );
}

export function useUpdateObjective(
  projectId: string,
): UseMutationResult<ProjectObjective, Error, ProjectStructureUpdate<ProjectObjectiveInput>> {
  return useMutation(
    useStructureMutations<ProjectObjective, ProjectObjectiveInput>(
      projectId, projectQueryKeys.objectives(projectId), "objectives", "objetivo",
    ).update,
  );
}

export function useDeleteObjective(
  projectId: string,
): UseMutationResult<ProjectObjective, Error, string> {
  return useMutation(
    useStructureMutations<ProjectObjective, ProjectObjectiveInput>(
      projectId, projectQueryKeys.objectives(projectId), "objectives", "objetivo",
    ).remove,
  );
}

export function useProjectActivities(id: string): UseQueryResult<ProjectActivity[]> {
  return useStructureList(id, projectQueryKeys.activities(id), "activities", "actividades");
}

export function useCreateActivity(
  projectId: string,
): UseMutationResult<ProjectActivity, Error, ProjectActivityInput> {
  return useMutation(
    useStructureMutations<ProjectActivity, ProjectActivityInput>(
      projectId, projectQueryKeys.activities(projectId), "activities", "actividad",
    ).create,
  );
}

export function useUpdateActivity(
  projectId: string,
): UseMutationResult<ProjectActivity, Error, ProjectStructureUpdate<ProjectActivityInput>> {
  return useMutation(
    useStructureMutations<ProjectActivity, ProjectActivityInput>(
      projectId, projectQueryKeys.activities(projectId), "activities", "actividad",
    ).update,
  );
}

export function useDeleteActivity(
  projectId: string,
): UseMutationResult<ProjectActivity, Error, string> {
  return useMutation(
    useStructureMutations<ProjectActivity, ProjectActivityInput>(
      projectId, projectQueryKeys.activities(projectId), "activities", "actividad",
    ).remove,
  );
}

export function useProjectDeliverables(id: string): UseQueryResult<ProjectDeliverable[]> {
  return useStructureList(id, projectQueryKeys.deliverables(id), "deliverables", "entregables");
}

export function useCreateDeliverable(
  projectId: string,
): UseMutationResult<ProjectDeliverable, Error, ProjectDeliverableInput> {
  return useMutation(
    useStructureMutations<ProjectDeliverable, ProjectDeliverableInput>(
      projectId, projectQueryKeys.deliverables(projectId), "deliverables", "entregable",
    ).create,
  );
}

export function useUpdateDeliverable(
  projectId: string,
): UseMutationResult<ProjectDeliverable, Error, ProjectStructureUpdate<ProjectDeliverableInput>> {
  return useMutation(
    useStructureMutations<ProjectDeliverable, ProjectDeliverableInput>(
      projectId, projectQueryKeys.deliverables(projectId), "deliverables", "entregable",
    ).update,
  );
}

export function useDeleteDeliverable(
  projectId: string,
): UseMutationResult<ProjectDeliverable, Error, string> {
  return useMutation(
    useStructureMutations<ProjectDeliverable, ProjectDeliverableInput>(
      projectId, projectQueryKeys.deliverables(projectId), "deliverables", "entregable",
    ).remove,
  );
}

export function useProjectIndicators(id: string): UseQueryResult<ProjectIndicator[]> {
  return useStructureList(id, projectQueryKeys.indicators(id), "indicators", "indicadores");
}

export function useCreateIndicator(
  projectId: string,
): UseMutationResult<ProjectIndicator, Error, ProjectIndicatorInput> {
  return useMutation(
    useStructureMutations<ProjectIndicator, ProjectIndicatorInput>(
      projectId, projectQueryKeys.indicators(projectId), "indicators", "indicador",
    ).create,
  );
}

export function useUpdateIndicator(
  projectId: string,
): UseMutationResult<ProjectIndicator, Error, ProjectStructureUpdate<ProjectIndicatorInput>> {
  return useMutation(
    useStructureMutations<ProjectIndicator, ProjectIndicatorInput>(
      projectId, projectQueryKeys.indicators(projectId), "indicators", "indicador",
    ).update,
  );
}

export function useDeleteIndicator(
  projectId: string,
): UseMutationResult<ProjectIndicator, Error, string> {
  return useMutation(
    useStructureMutations<ProjectIndicator, ProjectIndicatorInput>(
      projectId, projectQueryKeys.indicators(projectId), "indicators", "indicador",
    ).remove,
  );
}

function toastError(err: unknown, fallback: string): never {
  if (err instanceof ApiError) {
    toast.error(err.message);
  } else {
    toast.error(fallback);
  }
  throw err;
}
