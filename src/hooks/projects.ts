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
  keepPreviousData,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import type { TipoModificacion } from "@/lib/proyectos/modificaciones";
import { toast } from "sonner";
import { clientQueryKeys } from "@/hooks/crm";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut, ApiError } from "@/lib/api/http";
import type { EstadoActividad, Tendencia } from "@/lib/proyectos/avance";
import type { ReportePlantilla } from "@/lib/proyectos/plantilla-reporte";
import type {
  AccionAuditoria,
  EstadoProyecto,
  OrigenProyecto,
  RolUsuario,
} from "@prisma/client";

/** Re-exported so the execution UI can name the derived activity states/trends. */
export type { EstadoActividad, Tendencia };

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

/** Aviso no bloqueante de `toProjectItemV2` (S2.4). */
export type ProjectAlert = {
  codigo: "DIFERENCIA_VALOR";
  mensaje: string;
  /** Decimal serializado: string, nunca número. */
  diferencia: string;
};

/** Fila de `{ proyectos: ProjectListRow[] }` según `toProjectItemV2`. */
export type ProjectListRow = {
  id: string;
  codigo: string;
  nombre: string;
  /** M3: texto libre opcional; `null` si no se capturó. Opcional en el tipo para no obligar a todos los fixtures. */
  descripcion?: string | null;
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
  /** Avisos no bloqueantes derivados de la diferencia (S2.4). */
  alertas: ProjectAlert[];
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
  /** Sin `base` es el prefijo de las dos bases (para invalidar); con `base`, la clave de una consulta. */
  technicalStatus: (id: string, base?: string) =>
    (base === undefined
      ? ["projects", "technical-status", id]
      : ["projects", "technical-status", id, base]) as readonly string[],
  deliverableProgress: (id: string, deliverableId: string) =>
    ["projects", "deliverable-progress", id, deliverableId] as const,
  indicatorMeasurements: (id: string, indicatorId: string) =>
    ["projects", "indicator-measurements", id, indicatorId] as const,
  beneficiaries: (id: string) => ["projects", "beneficiaries", id] as const,
  supports: (id: string) => ["projects", "supports", id] as const,
  budget: (id: string) => ["projects", "budget", id] as const,
  programming: (id: string) => ["projects", "programming", id] as const,
  financialSheet: (id: string, corte: string | null, base: string = "vigente") =>
    ["projects", "financial-sheet", id, corte, base] as const,
  kpis: (id: string, corte: string | null, base: string = "vigente") => ["projects", "kpis", id, corte, base] as const,
  attention: (id: string, corte: string | null) => ["projects", "attention", id, corte] as const,
  curve: (id: string, base: string = "vigente") => ["projects", "curve", id, base] as const,
  portfolio: (filters: PortfolioFilters) => ["projects", "portfolio", filters] as const,
  expenses: (id: string) => ["projects", "expenses", id] as const,
  versions: (id: string) => ["projects", "versions", id] as const,
  versionCompare: (id: string, from: string, to: string) => ["projects", "version-compare", id, from, to] as const,
  modifications: (id: string) => ["projects", "modifications", id] as const,
  expenseQueue: ["projects", "expense-validations"] as const,
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
 * Los reintentos vienen de la política global (`shouldRetryQuery`): un 4xx no
 * se reintenta, así que el mensaje de acceso aparece de inmediato (D1).
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
export function useEligibleOpportunities(options?: {
  /** `false` evita la petición (p. ej. un rol sin permiso, que recibiría 403). */
  enabled?: boolean;
}): UseQueryResult<EligibleOpportunity[]> {
  return useQuery({
    queryKey: projectQueryKeys.eligibleOpportunities,
    enabled: options?.enabled ?? true,
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
  /** M3: opcional, máx. 2000 caracteres. */
  descripcion?: string;
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
      // The conversion also moves the opportunity to EJECUCION: refresh the client's list.
      void qc.invalidateQueries({ queryKey: clientQueryKeys.opportunities(clientId) });
      toast.success("Proyecto creado desde la oportunidad.");
    },
  });
}

/**
 * UX-3: edita los datos generales (PATCH E-06). El cuerpo trae solo lo que cambió; en ejecución el servidor
 * acepta únicamente `descripcion` y `beneficiarios_meta`. Al guardar invalida todo el namespace `projects`
 * (ficha, encabezado, listado, auditoría). El error del servidor se re-lanza sin toast: el diálogo lo muestra en línea.
 */
export type ProjectUpdateInput = {
  nombre?: string;
  descripcion?: string;
  responsable_id?: string;
  valor_total?: number;
  fecha_inicio?: string;
  fecha_fin?: string;
  beneficiarios_meta?: number | null;
  lineas?: ProjectLineaInput[];
  municipio_ids?: string[];
};

export function useUpdateProject(
  projectId: string,
): UseMutationResult<{ proyecto: ProjectListRow }, Error, ProjectUpdateInput> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input) =>
      apiPatch<{ proyecto: ProjectListRow }>(`/api/v1/projects/${projectId}`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: projectQueryKeys.all });
      toast.success("Datos generales guardados.");
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

/* ── Ejecución técnica (S4 U6): lecturas ───────────────────────────────── */
//
// Todo lo que la sección "Ejecución técnica" lee. El color del semáforo llega
// del servidor: se declara y se pinta tal cual, nunca se recalcula aquí.

export type ColorSemaforo = "verde" | "amarillo" | "rojo";

/** Fila de `actividades[]` en `GET /api/v1/projects/:id/technical-status` (S4). */
export type ProjectTechnicalActivity = {
  id: string;
  codigo: string;
  peso: number;
  /** Porcentaje 0..100 con un decimal, ya derivado por el servidor. */
  progreso: number;
  estado: EstadoActividad;
  fecha_cumplimiento: string | null;
};

/** Fila enriquecida de `actividades[]` (S14 P6): lo que leen el Cronograma y las Metas. */
export type ProjectTechnicalActivityV6 = ProjectTechnicalActivity & {
  nombre: string;
  /** Código del objetivo al que pertenece (la agrupación del Cronograma). */
  objetivo_codigo: string;
  /** Porcentaje 0..100 planeado al corte (la columna «% plan»). */
  programado: number;
  /** Duración en días calendario (la columna «Días»). */
  dias: number;
  /** Días transcurridos al corte, con tope en `dias` (la columna «Al corte»). */
  al_corte: number;
  /** Semáforo de la actividad: llega calculado por el servidor, nunca se recalcula (D11). */
  color: ColorSemaforo;
  /** true cuando ningún avance de la actividad tiene un soporte vivo. */
  sin_soporte: boolean;
};

/** Fila de `objetivos[]`: el acumulado planeado vs ejecutado de un objetivo (S14 P6). */
export type ProjectTechnicalObjective = {
  codigo: string;
  /** Media ponderada del % planeado de sus actividades. */
  programado: number;
  /** Media ponderada del % real de sus actividades. */
  ejecutado: number;
  /** `(programado - ejecutado)` en puntos porcentuales. */
  desviacion_pp: number;
  /** Semáforo del objetivo: llega calculado por el servidor, nunca se recalcula (D11). */
  color: ColorSemaforo;
};

/** Respuesta de `GET /api/v1/projects/:id/technical-status?corte=AAAA-MM-DD` (S4). */
export type ProjectTechnicalStatus = {
  /** La base que respondió el servidor: "vigente" u "original" (versión 0). */
  base: ProjectBase;
  corte: string;
  estado: EstadoProyecto;
  avance_real: number;
  avance_programado: number;
  desviacion_pp: number;
  color: ColorSemaforo;
  actividades: ProjectTechnicalActivity[];
  umbrales: { umbral1: number; umbral2: number; confirmado: boolean };
};

/**
 * La misma respuesta enriquecida por la S14 P6: cada actividad trae su planeación,
 * su semáforo y su soporte, y la respuesta agrega el acumulado por objetivo. Es la
 * que devuelve el hook; `ProjectTechnicalStatus` sigue siendo la forma base que
 * consumen el chip del semáforo y la ejecución por actividad.
 */
export type ProjectTechnicalStatusV6 = Omit<ProjectTechnicalStatus, "actividades"> & {
  actividades: ProjectTechnicalActivityV6[];
  /** Acumulado por objetivo (S14 P6): planeado vs ejecutado y su semáforo. */
  objetivos: ProjectTechnicalObjective[];
};

/** Fila de `avances[]` (`toAvanceView`): `cantidad` es `Decimal` y viaja STRING. */
export type ProjectAvance = {
  id: string;
  proyecto_id: string;
  entregable_id: string;
  fecha: string;
  cantidad: string;
  observacion: string | null;
  justificacion_exceso: string | null;
  registrado_por_id: string;
  created_at: string;
  anulado_at: string | null;
  anulado_por_id: string | null;
  motivo_anulacion: string | null;
  /** Medios vivos adjuntos. */
  medios: number;
  /** Cuenta hacia la meta (no anulado y, cuando se exige, con medio vivo). */
  cuenta: boolean;
};

/** Respuesta de `GET .../deliverables/:deliverableId/progress`. */
export type ProjectDeliverableProgress = {
  estado: EstadoProyecto;
  /** Decimal serializado: string, nunca número. */
  meta: string;
  avances: ProjectAvance[];
};

/** Fila de `mediciones[]` (`toMedicionView`): `valor` es `Decimal` y viaja STRING. */
export type ProjectMedicion = {
  id: string;
  proyecto_id: string;
  indicador_id: string;
  fecha: string;
  valor: string;
  observacion: string | null;
  registrado_por_id: string;
  created_at: string;
  anulado_at: string | null;
  anulado_por_id: string | null;
  motivo_anulacion: string | null;
};

/** Respuesta de `GET .../indicators/:indicatorId/measurements`. */
export type ProjectIndicatorMeasurements = {
  estado: EstadoProyecto;
  indicador: { id: string; codigo: string; nombre: string; meta: string; unidad: string };
  mediciones: ProjectMedicion[];
  ultima: ProjectMedicion | null;
  tendencia: Tendencia | null;
};

/** Fila de `registros[]` (`toBeneficiarioView`); `cantidad` es un entero. */
export type ProjectBeneficiario = {
  id: string;
  proyecto_id: string;
  actividad_id: string | null;
  fecha: string;
  cantidad: number;
  observacion: string | null;
  registrado_por_id: string;
  created_at: string;
  anulado_at: string | null;
  anulado_por_id: string | null;
  motivo_anulacion: string | null;
};

/** Respuesta de `GET .../beneficiaries`: `total` es la suma viva (sin anulados). */
export type ProjectBeneficiaries = {
  estado: EstadoProyecto;
  registros: ProjectBeneficiario[];
  total: number;
};

/** Base de la ficha financiera y del semáforo: las tablas vivas o la versión 0 congelada (S8). */
export type ProjectBase = "vigente" | "original";

/** Semáforo técnico del proyecto (color incluido: se pinta, no se recalcula). */
export function useProjectTechnicalStatus(
  id: string,
  base: ProjectBase = "vigente",
): UseQueryResult<ProjectTechnicalStatusV6> {
  return useQuery({
    queryKey: projectQueryKeys.technicalStatus(id, base),
    enabled: id !== "",
    // Switching the base keeps the previous semáforo on screen instead of flashing a skeleton.
    placeholderData: keepPreviousData,
    queryFn: () =>
      apiGet<ProjectTechnicalStatusV6>(
        `/api/v1/projects/${id}/technical-status${base === "original" ? "?base=original" : ""}`,
      ),
  });
}

/**
 * Avances por entregable (S4 U6, decisión 2): los entregables se leen UNA vez
 * con `useProjectDeliverables` y aquí se abren con `useQueries`, una consulta
 * por entregable y solo mientras la sección está montada. El orden de la lista
 * sigue al de `deliverableIds`.
 */
export function useDeliverableProgress(
  projectId: string,
  deliverableIds: string[],
): UseQueryResult<ProjectDeliverableProgress>[] {
  return useQueries({
    queries: deliverableIds.map((deliverableId) => ({
      queryKey: projectQueryKeys.deliverableProgress(projectId, deliverableId),
      enabled: projectId !== "" && deliverableId !== "",
      queryFn: () =>
        apiGet<ProjectDeliverableProgress>(
          `/api/v1/projects/${projectId}/deliverables/${deliverableId}/progress`,
        ),
    })),
  });
}

/** Mediciones de un indicador con su última lectura y tendencia. */
export function useIndicatorMeasurements(
  projectId: string,
  indicatorId: string,
): UseQueryResult<ProjectIndicatorMeasurements> {
  return useQuery({
    queryKey: projectQueryKeys.indicatorMeasurements(projectId, indicatorId),
    enabled: projectId !== "" && indicatorId !== "",
    queryFn: () =>
      apiGet<ProjectIndicatorMeasurements>(
        `/api/v1/projects/${projectId}/indicators/${indicatorId}/measurements`,
      ),
  });
}

/** Registros de beneficiarios y su total vivo. */
export function useProjectBeneficiaries(id: string): UseQueryResult<ProjectBeneficiaries> {
  return useQuery({
    queryKey: projectQueryKeys.beneficiaries(id),
    enabled: id !== "",
    queryFn: () => apiGet<ProjectBeneficiaries>(`/api/v1/projects/${id}/beneficiaries`),
  });
}

/* ── Ejecución técnica (S4 U7): escrituras ─────────────────────────────── */
//
// Crear avance (con su medio opcional), anular avance, registrar/medir/anular.
// Todas relanzan el `ApiError` del servidor SIN toast: el formulario lo muestra
// en línea. El permiso real lo decide la API; el gate del cliente es comodidad.

/** Respuesta de `POST .../attachments/sign` (ADR-13), igual que en tareas. */
type SignedUploadResponse = {
  storage_path: string;
  token: string;
  signed_url: string;
  max_bytes: number;
  allowed_extensions: string[];
};

/** Datos de confirmación de un archivo ya subido (cuerpo de `attachments`/`expenses`). */
type SoporteArchivoPayload = {
  storage_path: string;
  nombre: string;
  tamano_bytes: number;
  tipo_mime?: string;
};

/**
 * ADR-13: firmar -> subir directo a Storage. Devuelve los metadatos que la API
 * espera al confirmar. Los bytes nunca pasan por el route handler.
 */
async function uploadSoporteFile(signPath: string, file: File): Promise<SoporteArchivoPayload> {
  const signed = await apiPost<SignedUploadResponse>(signPath, {
    nombre: file.name,
    tamano_bytes: file.size,
    ...(file.type ? { tipo_mime: file.type } : {}),
  });

  const res = await fetch(signed.signed_url, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "x-upsert": "false",
    },
    body: file,
  });
  if (!res.ok) throw new ApiError("No pudimos subir el archivo al almacenamiento.", res.status);

  return {
    storage_path: signed.storage_path,
    nombre: file.name,
    tamano_bytes: file.size,
    ...(file.type ? { tipo_mime: file.type } : {}),
  };
}

/** Medio de un avance: firmar -> subir -> confirmar. */
async function uploadAvanceMedioFile(
  projectId: string,
  progressId: string,
  file: File,
): Promise<void> {
  const payload = await uploadSoporteFile(
    `/api/v1/projects/${projectId}/progress/${progressId}/attachments/sign`,
    file,
  );
  await apiPost(`/api/v1/projects/${projectId}/progress/${progressId}/attachments`, payload);
}

/** Un medio por avance: o un archivo (firma/subida/confirmación) o un enlace https. */
export type AvanceMedioInput =
  | { tipo: "archivo"; file: File }
  | { tipo: "enlace"; url_externa: string; nombre: string };

export type ProjectAvanceInput = {
  /** Calendario `YYYY-MM-DD`, nunca posterior a hoy. */
  fecha: string;
  cantidad: number;
  observacion?: string;
  justificacion_exceso?: string;
  medio?: AvanceMedioInput;
};

/**
 * Registra un avance y, si viene, adjunta su único medio. Ambas escrituras
 * refrescan la lista de avances del entregable y el semáforo del proyecto.
 */
export function useCreateAvance(
  projectId: string,
  deliverableId: string,
): UseMutationResult<ProjectAvance, Error, ProjectAvanceInput> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input) => {
      const { avance } = await apiPost<{ avance: ProjectAvance; cuenta: boolean }>(
        `/api/v1/projects/${projectId}/deliverables/${deliverableId}/progress`,
        {
          fecha: input.fecha,
          cantidad: input.cantidad,
          ...(input.observacion ? { observacion: input.observacion } : {}),
          ...(input.justificacion_exceso
            ? { justificacion_exceso: input.justificacion_exceso }
            : {}),
        },
      );

      if (input.medio?.tipo === "archivo") {
        await uploadAvanceMedioFile(projectId, avance.id, input.medio.file);
      } else if (input.medio?.tipo === "enlace") {
        await apiPost(`/api/v1/projects/${projectId}/progress/${avance.id}/attachments`, {
          url_externa: input.medio.url_externa,
          nombre: input.medio.nombre,
        });
      }
      return avance;
    },
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: projectQueryKeys.deliverableProgress(projectId, deliverableId),
      });
      void qc.invalidateQueries({ queryKey: projectQueryKeys.technicalStatus(projectId) });
    },
  });
}

/** Anula un avance (conserva la fila); solo gestores, lo decide la API. */
export function useVoidAvance(
  projectId: string,
  deliverableId: string,
): UseMutationResult<{ avance: ProjectAvance }, Error, { id: string; motivo: string }> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, motivo }) =>
      apiPost<{ avance: ProjectAvance }>(
        `/api/v1/projects/${projectId}/deliverables/${deliverableId}/progress/${id}/void`,
        { motivo },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: projectQueryKeys.deliverableProgress(projectId, deliverableId),
      });
      void qc.invalidateQueries({ queryKey: projectQueryKeys.technicalStatus(projectId) });
    },
  });
}

export type ProjectMedicionInput = {
  fecha: string;
  valor: number;
  observacion?: string;
};

/** Registra una medición de indicador (`valor >= 0`). */
export function useCreateMedicion(
  projectId: string,
  indicatorId: string,
): UseMutationResult<{ medicion: ProjectMedicion }, Error, ProjectMedicionInput> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input) =>
      apiPost<{ medicion: ProjectMedicion }>(
        `/api/v1/projects/${projectId}/indicators/${indicatorId}/measurements`,
        input,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: projectQueryKeys.indicatorMeasurements(projectId, indicatorId),
      });
    },
  });
}

/** Anula una medición (conserva la fila); solo gestores. */
export function useVoidMedicion(
  projectId: string,
  indicatorId: string,
): UseMutationResult<{ medicion: ProjectMedicion }, Error, { id: string; motivo: string }> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, motivo }) =>
      apiPost<{ medicion: ProjectMedicion }>(
        `/api/v1/projects/${projectId}/indicators/${indicatorId}/measurements/${id}/void`,
        { motivo },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: projectQueryKeys.indicatorMeasurements(projectId, indicatorId),
      });
    },
  });
}

export type ProjectBeneficiarioInput = {
  fecha: string;
  cantidad: number;
  actividad_id?: string;
  observacion?: string;
};

/** Registra un conteo de beneficiarios (`cantidad` entero > 0). */
export function useCreateBeneficiario(
  projectId: string,
): UseMutationResult<{ registro: ProjectBeneficiario }, Error, ProjectBeneficiarioInput> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input) =>
      apiPost<{ registro: ProjectBeneficiario }>(`/api/v1/projects/${projectId}/beneficiaries`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: projectQueryKeys.beneficiaries(projectId) });
    },
  });
}

/** Anula un registro de beneficiarios (conserva la fila); solo gestores. */
export function useVoidBeneficiario(
  projectId: string,
): UseMutationResult<{ registro: ProjectBeneficiario }, Error, { id: string; motivo: string }> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, motivo }) =>
      apiPost<{ registro: ProjectBeneficiario }>(
        `/api/v1/projects/${projectId}/beneficiaries/${id}/void`,
        { motivo },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: projectQueryKeys.beneficiaries(projectId) });
    },
  });
}

/* ── Presupuesto, programación y ficha financiera (S5 U5/U6) ───────────── */
//
// Los montos viajan como STRING decimal ("59500000.00") en ambos sentidos y
// nunca pasan por Number(). El color financiero llega del servidor: se pinta,
// no se recalcula.

export type ProjectBudgetRubro = {
  rubro_id: string;
  /** Nulo en rubros heredados sin código. */
  codigo: string | null;
  nombre: string;
  activo: boolean;
  /** Nulo mientras el rubro no tiene línea (fila virtual en $0). */
  linea_id: string | null;
  asignado: string;
  /** Rubro suspendido con monto pendiente de reasignación. */
  heredado_pendiente: boolean;
};

/** `GET/PUT /api/v1/projects/:id/budget`. */
export type ProjectBudget = {
  estado: EstadoProyecto;
  rubros: ProjectBudgetRubro[];
  suma: string;
  valor_total: string | null;
  /** Σ A − valor_total; nulo sin valor total. */
  diferencia: string | null;
};

export type ProjectBudgetInput = { rubros: { rubro_id: string; asignado: string }[] };

export type ProjectProgramming = {
  estado: EstadoProyecto;
  periodos: string[];
  filas: { rubro_id: string; periodo: string; valor: string }[];
  control_por_rubro: {
    rubro_id: string;
    codigo: string | null;
    nombre: string;
    asignado: string;
    programado: string;
    /** Σ celdas − A; informativo en Borrador. */
    control: string;
  }[];
  programacion_pendiente: boolean;
};

export type ProjectProgrammingInput = { filas: { rubro_id: string; periodo: string; valor: string }[] };

export function useProjectBudget(id: string): UseQueryResult<ProjectBudget> {
  return useQuery({
    queryKey: projectQueryKeys.budget(id),
    enabled: id !== "",
    queryFn: () => apiGet<ProjectBudget>(`/api/v1/projects/${id}/budget`),
  });
}

export function useProjectProgramming(id: string): UseQueryResult<ProjectProgramming> {
  return useQuery({
    queryKey: projectQueryKeys.programming(id),
    enabled: id !== "",
    queryFn: () => apiGet<ProjectProgramming>(`/api/v1/projects/${id}/programming`),
  });
}

/** Refreshes everything a budget or programming write can change. */
function useRefreshPresupuesto(projectId: string) {
  const qc = useQueryClient();
  return () => {
    for (const key of [
      projectQueryKeys.budget(projectId),
      projectQueryKeys.programming(projectId),
      projectQueryKeys.detail(projectId),
      ["projects", "financial-sheet", projectId],
    ]) {
      void qc.invalidateQueries({ queryKey: key });
    }
  };
}

/** Reemplaza el presupuesto (cubre todos los rubros activos). El 400/409 se muestra en línea. */
export function useUpdateBudget(
  projectId: string,
): UseMutationResult<ProjectBudget, Error, ProjectBudgetInput> {
  const refresh = useRefreshPresupuesto(projectId);
  return useMutation({
    mutationFn: (input) => apiPut<ProjectBudget>(`/api/v1/projects/${projectId}/budget`, input),
    onSuccess: refresh,
  });
}

export function useUpdateProgramming(
  projectId: string,
): UseMutationResult<ProjectProgramming, Error, ProjectProgrammingInput> {
  const refresh = useRefreshPresupuesto(projectId);
  return useMutation({
    mutationFn: (input) => apiPut<ProjectProgramming>(`/api/v1/projects/${projectId}/programming`, input),
    onSuccess: refresh,
  });
}

/**
 * "Igualar valor total a Σ A": reutiliza el PATCH existente del proyecto (que
 * ya recalcula la diferencia con la oportunidad y audita). El PATCH recibe el
 * valor como número JSON; la cadena de la suma ya es exacta a dos decimales.
 */
export function useSetValorTotal(projectId: string): UseMutationResult<unknown, Error, string> {
  const refresh = useRefreshPresupuesto(projectId);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (valorTotal) =>
      apiPatch<unknown>(`/api/v1/projects/${projectId}`, { valor_total: Number(valorTotal) }),
    onSuccess: () => {
      refresh();
      void qc.invalidateQueries({ queryKey: ["projects", "list"] });
    },
  });
}

/** Fila (por rubro o total) de `GET /api/v1/projects/:id/financial-sheet`. */
export type ProjectFinancialRow = {
  /** Nulo en la fila de total. */
  rubro_id: string | null;
  codigo: string | null;
  nombre: string;
  asignado: string;
  programado: string;
  ejecutado: string;
  diferencia: string;
  /** E/P en décimas de punto porcentual (908 = 90,8 %); nulo si P = 0 o sin gastos. */
  ep_decimas: number | null;
  ea_decimas: number | null;
  umbral_rojo: string;
  /** Nulo mientras `ejecucion_disponible` es false. */
  color: ColorSemaforo | null;
};

export type ProjectFinancialSheet = {
  base: ProjectBase;
  /** Periodo AAAA-MM. */
  corte: string;
  estado: EstadoProyecto;
  ejecucion_disponible: boolean;
  rubros: ProjectFinancialRow[];
  total: ProjectFinancialRow;
  alerta_retraso: boolean;
  parametros: { tolerancia: number; retraso: number; confirmado: boolean };
};

/** Ficha financiera al corte (`null` = el corte por defecto del servidor). */
export function useProjectFinancialSheet(
  id: string,
  corte: string | null,
  base: ProjectBase = "vigente",
): UseQueryResult<ProjectFinancialSheet> {
  return useQuery({
    queryKey: projectQueryKeys.financialSheet(id, corte, base),
    enabled: id !== "",
    queryFn: () => {
      const query = [
        ...(corte ? [`corte=${encodeURIComponent(corte)}`] : []),
        ...(base === "original" ? ["base=original"] : []),
      ].join("&");
      return apiGet<ProjectFinancialSheet>(`/api/v1/projects/${id}/financial-sheet${query ? `?${query}` : ""}`);
    },
  });
}

/* ── Gastos (S6 U6) ────────────────────────────────────────────────────── */
//
// Lectura de gastos, registro (con su soporte), validación, rechazo y anulación, y la cola
// de validación entre proyectos. Todas relanzan el `ApiError` del servidor SIN toast: la
// sección lo muestra en línea (el 409 OVERSPEND_BLOCKED incluido). El permiso real lo decide
// la API; el gate del cliente es comodidad. Los valores viajan como string, nunca como número.

export type ProjectExpenseEstado = "REGISTRADO" | "VALIDADO" | "RECHAZADO" | "ANULADO";

export type ProjectExpenseSoporte = {
  id: string;
  nombre: string;
  tipo: "archivo" | "enlace";
  url_externa: string | null;
  tipo_mime: string | null;
  tamano_bytes: number | null;
  subido_por_id: string;
  created_at: string;
};

export type ProjectExpense = {
  id: string;
  proyecto_id: string;
  rubro: { id: string; codigo: string | null; nombre: string };
  fecha_documento: string;
  periodo: string;
  tipo_soporte: "FACTURA_PROVEEDOR" | "CUENTA_COBRO_PERSONA_NATURAL" | "OTRO";
  tercero_nombre: string;
  tercero_tipo_id: "NIT" | "CC" | "CE" | null;
  /** Ausente sin acceso a soportes financieros (RNF-03). */
  tercero_numero_id?: string | null;
  numero_documento: string;
  descripcion: string;
  valor: string;
  estado: ProjectExpenseEstado;
  alerta_sobregasto: boolean;
  datos_incompletos: boolean;
  registrado_por_id: string;
  created_at: string;
  validado_por_id: string | null;
  validado_at: string | null;
  rechazado_por_id: string | null;
  rechazado_at: string | null;
  motivo_rechazo: string | null;
  anulado_por_id: string | null;
  anulado_at: string | null;
  motivo_anulacion: string | null;
  /** Ausente sin acceso a soportes financieros (RNF-03). */
  soportes?: ProjectExpenseSoporte[];
  /** Soportes vigentes; ausente sin acceso a soportes financieros (RNF-03). */
  soportes_count?: number;
};

export type ProjectExpensesResumen = {
  /** REGISTRADO y VALIDADO. */
  vigentes: number;
  /** Vigentes con soporte; ausente sin acceso a soportes financieros (RNF-03). */
  con_soporte?: number;
  /** D5: REGISTRADO con alerta de sobregasto o con datos incompletos. */
  observados: { cantidad: number; valor: string };
};

export type ProjectExpenses = {
  gastos: ProjectExpense[];
  totales: Record<ProjectExpenseEstado, { cantidad: number; valor: string }>;
  resumen: ProjectExpensesResumen;
};

export type ExpenseAlert =
  | { tipo: "SOBREGASTO"; mensaje: string }
  | { tipo: "DUPLICADO"; gasto_id: string | null; proyecto_codigo: string | null; mensaje: string };

export type ProjectExpenseInput = {
  rubro_id: string;
  fecha_documento: string;
  periodo?: string;
  tipo_soporte: ProjectExpense["tipo_soporte"];
  tercero_nombre: string;
  tercero_tipo_id: "NIT" | "CC" | "CE" | null;
  tercero_numero_id: string | null;
  numero_documento: string;
  descripcion: string;
  /** Decimal como string ("1500000.50"). */
  valor: string;
  /** Un soporte: archivo (firma -> subida -> confirmación) o enlace https. */
  soporte: AvanceMedioInput;
};

export type ExpenseQueueRow = {
  id: string;
  proyecto_id: string;
  proyecto_codigo: string;
  proyecto_nombre: string;
  rubro: { id: string; codigo: string | null; nombre: string };
  fecha_documento: string;
  periodo: string;
  tercero_nombre: string;
  tercero_tipo_id: "NIT" | "CC" | "CE" | null;
  numero_documento: string;
  descripcion: string;
  valor: string;
  estado: ProjectExpenseEstado;
  alerta_sobregasto: boolean;
  datos_incompletos: boolean;
  registrado_por_id: string;
  registrado_por_nombre: string | null;
  propio: boolean;
  created_at: string;
};

export function useProjectExpenses(id: string): UseQueryResult<ProjectExpenses> {
  return useQuery({
    queryKey: projectQueryKeys.expenses(id),
    enabled: id !== "",
    queryFn: () => apiGet<ProjectExpenses>(`/api/v1/projects/${id}/expenses`),
  });
}

/** Cola de validación entre proyectos (ADM/GER; el resto recibe 403). */
export function useExpenseValidationQueue(): UseQueryResult<{ gastos: ExpenseQueueRow[] }> {
  return useQuery({
    queryKey: projectQueryKeys.expenseQueue,
    retry: false,
    queryFn: () =>
      apiGet<{ gastos: ExpenseQueueRow[] }>("/api/v1/expense-validations?estado=REGISTRADO&limit=50"),
  });
}

/** Refresca lo que un gasto puede cambiar: su lista, la cola y E de la ficha financiera. */
function useRefreshGastos() {
  const qc = useQueryClient();
  return () => {
    for (const key of [["projects", "expenses"], ["projects", "expense-validations"], ["projects", "financial-sheet"]]) {
      void qc.invalidateQueries({ queryKey: key });
    }
  };
}

/** Registra un gasto: sube su soporte (si es archivo) y confirma todo en un solo POST. */
export function useCreateExpense(
  projectId: string,
): UseMutationResult<{ gasto: ProjectExpense; alertas: ExpenseAlert[] }, Error, ProjectExpenseInput> {
  const refresh = useRefreshGastos();
  return useMutation({
    mutationFn: async ({ soporte, ...datos }) => {
      const confirmado =
        soporte.tipo === "archivo"
          ? await uploadSoporteFile(`/api/v1/projects/${projectId}/expenses/sign`, soporte.file)
          : { url_externa: soporte.url_externa, nombre: soporte.nombre };
      return apiPost<{ gasto: ProjectExpense; alertas: ExpenseAlert[] }>(
        `/api/v1/projects/${projectId}/expenses`,
        { ...datos, soportes: [confirmado] },
      );
    },
    onSuccess: refresh,
  });
}

/**
 * Adjunta un soporte a un gasto que ya existe (los importados nacen sin soporte, B8): archivo
 * (firma -> subida -> confirmación en `attachments`) o enlace https. El error del servidor se
 * relanza sin toast: el control lo muestra en línea.
 */
export function useAttachExpenseSupport(
  projectId: string,
): UseMutationResult<{ gasto: ProjectExpense }, Error, { id: string; soporte: AvanceMedioInput }> {
  const refresh = useRefreshGastos();
  return useMutation({
    mutationFn: async ({ id, soporte }) => {
      const confirmado =
        soporte.tipo === "archivo"
          ? await uploadSoporteFile(`/api/v1/projects/${projectId}/expenses/sign`, soporte.file)
          : { url_externa: soporte.url_externa, nombre: soporte.nombre };
      return apiPost<{ gasto: ProjectExpense }>(`/api/v1/projects/${projectId}/expenses/${id}/attachments`, confirmado);
    },
    onSuccess: refresh,
  });
}

type ExpenseTarget = { projectId: string; id: string };

/** Valida un gasto (ADM/GER distinto de quien lo registró). 409 OVERSPEND_BLOCKED refresca la bandera. */
export function useValidateExpense(): UseMutationResult<{ gasto: ProjectExpense }, Error, ExpenseTarget> {
  const refresh = useRefreshGastos();
  return useMutation({
    mutationFn: ({ projectId, id }) =>
      apiPost<{ gasto: ProjectExpense }>(`/api/v1/projects/${projectId}/expenses/${id}/validate`),
    onSettled: refresh,
  });
}

export function useRejectExpense(): UseMutationResult<
  { gasto: ProjectExpense },
  Error,
  ExpenseTarget & { motivo: string }
> {
  const refresh = useRefreshGastos();
  return useMutation({
    mutationFn: ({ projectId, id, motivo }) =>
      apiPost<{ gasto: ProjectExpense }>(`/api/v1/projects/${projectId}/expenses/${id}/reject`, { motivo }),
    onSettled: refresh,
  });
}

/** Anula un gasto validado (solo gestores); deja de contar en E. */
export function useVoidExpense(): UseMutationResult<
  { gasto: ProjectExpense },
  Error,
  ExpenseTarget & { motivo: string }
> {
  const refresh = useRefreshGastos();
  return useMutation({
    mutationFn: ({ projectId, id, motivo }) =>
      apiPost<{ gasto: ProjectExpense }>(`/api/v1/projects/${projectId}/expenses/${id}/void`, { motivo }),
    onSettled: refresh,
  });
}

/**
 * Pide la URL firmada (60 s) o el enlace de un soporte y la abre en otra pestaña. La API registra
 * cada emisión en la bitácora de accesos (RNF-04), así que NO se cachea ni se reutiliza la URL.
 */
export async function downloadExpenseSoporte(
  projectId: string,
  expenseId: string,
  soporteId: string,
): Promise<void> {
  const res = await apiGet<{ tipo: "archivo" | "enlace"; url: string | null }>(
    `/api/v1/projects/${projectId}/expenses/${expenseId}/attachments/${soporteId}/download`,
  );
  if (!res.url) throw new ApiError("El soporte no tiene un enlace disponible.", 404);
  window.open(res.url, "_blank", "noopener,noreferrer");
}

/**
 * Opens the support of an avance (file via a 60 s signed URL, or its external link) in another tab.
 * Same contract as `downloadExpenseSoporte`: never cache the URL, the API logs every issuance.
 */
export async function downloadAvanceSoporte(projectId: string, avanceId: string, soporteId: string): Promise<void> {
  const res = await apiGet<{ tipo: "archivo" | "enlace"; url: string | null }>(
    `/api/v1/projects/${projectId}/progress/${avanceId}/attachments/${soporteId}/download`,
  );
  if (!res.url) throw new ApiError("El soporte no tiene un enlace disponible.", 404);
  window.open(res.url, "_blank", "noopener,noreferrer");
}

/* ── Soportes del proyecto (pestaña Soportes, solo lectura) ─────────────── */

export type ProjectSupport = {
  id: string;
  nombre: string;
  tipo: "archivo" | "enlace";
  tipo_mime: string | null;
  tamano_bytes: number | null;
  origen: "avance" | "indicador" | "gasto" | "proyecto";
  origen_id: string | null;
  vinculo: string | null;
  url_externa: string | null;
  subido_por: string | null;
  /** Uploader id: the ficha uses it to decide who may delete their own project documents. */
  subido_por_id: string;
  created_at: string;
};

export function useProjectSupports(id: string): UseQueryResult<ProjectSupport[]> {
  return useQuery({
    queryKey: projectQueryKeys.supports(id),
    enabled: id !== "",
    queryFn: async () => (await apiGet<{ soportes: ProjectSupport[] }>(`/api/v1/projects/${id}/supports`)).soportes,
  });
}

/* ── Documentos generales del proyecto (DOC1) ───────────────────────────── */

/** Un documento general: o un archivo (firma/subida/confirmación) o un enlace https con nombre. */
export type ProjectDocumentoInput =
  | { tipo: "archivo"; file: File }
  | { tipo: "enlace"; url_externa: string; nombre: string };

/** Crea un documento del proyecto y refresca la lista de soportes. */
export function useCreateProjectDocument(
  projectId: string,
): UseMutationResult<{ soporte: ProjectSupport }, Error, ProjectDocumentoInput> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input) => {
      if (input.tipo === "archivo") {
        const payload = await uploadSoporteFile(`/api/v1/projects/${projectId}/supports/sign`, input.file);
        return apiPost<{ soporte: ProjectSupport }>(`/api/v1/projects/${projectId}/supports`, payload);
      }
      return apiPost<{ soporte: ProjectSupport }>(`/api/v1/projects/${projectId}/supports`, {
        url_externa: input.url_externa,
        nombre: input.nombre,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: projectQueryKeys.supports(projectId) });
    },
  });
}

/** Baja lógica de un documento del proyecto (gestores, o el COORDINADOR dueño; lo decide la API). */
export function useDeleteProjectDocument(
  projectId: string,
): UseMutationResult<{ soporte: { id: string } }, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (supportId) =>
      apiDelete<{ soporte: { id: string } }>(`/api/v1/projects/${projectId}/supports/${supportId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: projectQueryKeys.supports(projectId) });
    },
  });
}

/**
 * Pide la URL firmada (60 s) o el enlace de un documento del proyecto y lo abre en otra pestaña. La API
 * registra cada emisión en la bitácora de accesos (RNF-04), así que NO se cachea ni se reutiliza la URL.
 */
export async function downloadProjectDocument(projectId: string, supportId: string): Promise<void> {
  const res = await apiGet<{ tipo: "archivo" | "enlace"; url: string | null }>(
    `/api/v1/projects/${projectId}/supports/${supportId}/download`,
  );
  if (!res.url) throw new ApiError("El documento no tiene un enlace disponible.", 404);
  window.open(res.url, "_blank", "noopener,noreferrer");
}

/* ── Plantilla Excel (S7 U6) ───────────────────────────────────────────── */
//
// La descarga y la importación hablan multipart/binario, así que no usan
// `apiPost` (solo JSON). El reporte de errores viaja en el 400 como `reporte`;
// `ImportReportError` lo conserva para que el diálogo lo pinte por hoja.

export type ImportResumen = {
  objetivos: number;
  actividades: number;
  entregables: number;
  indicadores: number;
  rubros: number;
  celdas_programacion: number;
};

export type ImportReemplaza = Pick<ImportResumen, "objetivos" | "actividades" | "entregables" | "indicadores">;

/** `POST /import` con `modo=validar`: nada se escribió. */
export type ImportValidacion = {
  importado: false;
  valido: true;
  resumen: ImportResumen;
  reemplaza: ImportReemplaza;
  advertencias: ReportePlantilla["advertencias"];
};

/** `POST /import` aplicado: un solo lote de auditoría. */
export type ImportAplicada = {
  importado: true;
  lote_id: string;
  resumen: ImportResumen;
  advertencias: ReportePlantilla["advertencias"];
};

export type ImportTemplateInput = { archivo: File; validar: boolean };

/** El 400 de validación con el reporte por regla/hoja/fila. */
export class ImportReportError extends ApiError {
  readonly reporte: ReportePlantilla;

  constructor(message: string, reporte: ReportePlantilla) {
    super(message, 400, "VALIDATION_ERROR");
    this.name = "ImportReportError";
    this.reporte = reporte;
  }
}

async function readJsonBody(res: Response): Promise<Record<string, unknown>> {
  try {
    return ((await res.json()) as Record<string, unknown> | null) ?? {};
  } catch {
    return {};
  }
}

function failureOf(res: Response, body: Record<string, unknown>, fallback: string): ApiError {
  const message = typeof body.error === "string" ? body.error : fallback;
  const reporte = body.reporte as ReportePlantilla | undefined;
  if (reporte && Array.isArray(reporte.errores)) return new ImportReportError(message, reporte);
  return new ApiError(message, res.status, typeof body.code === "string" ? body.code : undefined);
}

/** Guarda un blob como descarga del navegador (revoca la URL al terminar). */
export function saveBlobAs(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

/** E-23: baja la plantilla del proyecto, precargada con su estado actual. */
export async function downloadProjectTemplate(projectId: string): Promise<void> {
  const res = await fetch(`/api/v1/projects/${projectId}/template`, { method: "GET" });
  if (!res.ok) {
    throw failureOf(res, await readJsonBody(res), "No pudimos descargar la plantilla. Inténtalo de nuevo.");
  }
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "plantilla.xlsx";
  saveBlobAs(await res.blob(), filename);
}

/** Todo lo que un import aplicado puede haber cambiado. */
function useRefreshAfterImport(projectId: string) {
  const qc = useQueryClient();
  return () => {
    for (const key of [
      projectQueryKeys.objectives(projectId),
      projectQueryKeys.activities(projectId),
      projectQueryKeys.deliverables(projectId),
      projectQueryKeys.indicators(projectId),
      projectQueryKeys.budget(projectId),
      projectQueryKeys.programming(projectId),
      projectQueryKeys.detail(projectId),
      projectQueryKeys.technicalStatus(projectId),
      ["projects", "financial-sheet", projectId],
      ["projects", "list"],
    ]) {
      void qc.invalidateQueries({ queryKey: key });
    }
  };
}

/**
 * E-24: valida (`validar: true`, no escribe) o aplica la plantilla. El 400 con
 * reporte llega como `ImportReportError`; los demás errores, como `ApiError`.
 */
export function useImportTemplate(
  projectId: string,
): UseMutationResult<ImportValidacion | ImportAplicada, Error, ImportTemplateInput> {
  const refresh = useRefreshAfterImport(projectId);
  return useMutation({
    mutationFn: async ({ archivo, validar }) => {
      const form = new FormData();
      form.set("archivo", archivo);
      if (validar) form.set("modo", "validar");
      // Sin Content-Type: el navegador pone el boundary del multipart.
      const res = await fetch(`/api/v1/projects/${projectId}/import`, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: form,
      });
      const body = await readJsonBody(res);
      if (!res.ok) throw failureOf(res, body, "No pudimos importar la plantilla. Inténtalo de nuevo.");
      return body as ImportValidacion | ImportAplicada;
    },
    onSuccess: (data) => {
      if (!data.importado) return;
      refresh();
      toast.success("Plantilla importada.");
    },
  });
}

/* ── Presupuesto desde el Excel simple de la PO (importar-presupuesto-po) ── */

/** Error por fila (`fila` nula si es del archivo) del 400 de `POST /budget/import`. */
export type BudgetImportError = { fila: number | null; rubro: string | null; mensaje: string };

/** `POST /budget/import` con `modo=validar`: nada se escribió. */
export type BudgetImportPreview = {
  importado: false;
  valido: true;
  rubros: {
    rubro_id: string;
    codigo: string | null;
    nombre: string;
    actual: string;
    nuevo: string;
    diferencia: string;
    en_archivo: boolean;
  }[];
  suma_actual: string;
  suma_nueva: string;
  valor_total: string | null;
  /** Σ nuevo − valor_total; nulo sin valor total. */
  diferencia: string | null;
  cambios: number;
};

/** `POST /budget/import` aplicado. */
export type BudgetImportApplied = { importado: true; cambios: number; presupuesto: ProjectBudget };

export type BudgetImportInput = { archivo: File; validar: boolean };

/** El 400 con los errores por fila del archivo. */
export class BudgetImportReportError extends ApiError {
  readonly errores: BudgetImportError[];

  constructor(message: string, errores: BudgetImportError[]) {
    super(message, 400, "VALIDATION_ERROR");
    this.name = "BudgetImportReportError";
    this.errores = errores;
  }
}

function budgetImportFailure(res: Response, body: Record<string, unknown>, fallback: string): ApiError {
  const errores = (body.reporte as { errores?: unknown } | undefined)?.errores;
  if (Array.isArray(errores)) {
    return new BudgetImportReportError(typeof body.error === "string" ? body.error : fallback, errores as BudgetImportError[]);
  }
  return new ApiError(typeof body.error === "string" ? body.error : fallback, res.status, typeof body.code === "string" ? body.code : undefined);
}

/** Baja la plantilla vacía del presupuesto en el formato de la PO. */
export async function downloadBudgetTemplate(projectId: string): Promise<void> {
  const res = await fetch(`/api/v1/projects/${projectId}/budget/template`, { method: "GET" });
  if (!res.ok) {
    throw budgetImportFailure(res, await readJsonBody(res), "No pudimos descargar la plantilla. Inténtalo de nuevo.");
  }
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "plantilla-presupuesto.xlsx";
  saveBlobAs(await res.blob(), filename);
}

/**
 * Valida (`validar: true`, no escribe) o aplica el presupuesto del Excel de la PO.
 * El 400 con errores por fila llega como `BudgetImportReportError`.
 */
export function useImportBudget(
  projectId: string,
): UseMutationResult<BudgetImportPreview | BudgetImportApplied, Error, BudgetImportInput> {
  const refresh = useRefreshPresupuesto(projectId);
  return useMutation({
    mutationFn: async ({ archivo, validar }) => {
      const form = new FormData();
      form.set("archivo", archivo);
      if (validar) form.set("modo", "validar");
      // Sin Content-Type: el navegador pone el boundary del multipart.
      const res = await fetch(`/api/v1/projects/${projectId}/budget/import`, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: form,
      });
      const body = await readJsonBody(res);
      if (!res.ok) throw budgetImportFailure(res, body, "No pudimos importar el presupuesto. Inténtalo de nuevo.");
      return body as BudgetImportPreview | BudgetImportApplied;
    },
    onSuccess: (data) => {
      if (!data.importado) return;
      refresh();
      toast.success("Presupuesto importado.");
    },
  });
}

// ── S8: aprobación de la línea base (E-25) ─────────────────────────────

export type BaselinePrecondicion = { codigo: string; mensaje: string; rubroId?: string };

export type BaselineAprobada = {
  version: { id: string; numero: number; aprobado_at: string };
  proyecto: { id: string; estado: string };
};

/** El 409 de la aprobación con la lista completa de requisitos que faltan. */
export class BaselinePrecondicionesError extends ApiError {
  readonly precondiciones: BaselinePrecondicion[];

  constructor(message: string, precondiciones: BaselinePrecondicion[]) {
    super(message, 409, "INVALID_STATE");
    this.name = "BaselinePrecondicionesError";
    this.precondiciones = precondiciones;
  }
}

/**
 * E-25: aprueba la línea base (versión 0) y pasa el proyecto a En ejecución. Los requisitos
 * pendientes llegan como `BaselinePrecondicionesError` y los demás errores como `ApiError`, ambos
 * SIN toast: el diálogo los muestra en línea. Al aprobar cambia casi todo lo que la ficha muestra.
 */
export function useApproveBaseline(projectId: string): UseMutationResult<BaselineAprobada, Error, void> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/projects/${projectId}/baseline/approve`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const body = await readJsonBody(res);
      if (!res.ok) {
        const message =
          typeof body.error === "string" ? body.error : "No pudimos aprobar la línea base. Inténtalo de nuevo.";
        if (Array.isArray(body.precondiciones)) {
          throw new BaselinePrecondicionesError(message, body.precondiciones as BaselinePrecondicion[]);
        }
        throw new ApiError(message, res.status, typeof body.code === "string" ? body.code : undefined);
      }
      return body as BaselineAprobada;
    },
    onSuccess: () => {
      for (const key of [
        projectQueryKeys.detail(projectId),
        projectQueryKeys.objectives(projectId),
        projectQueryKeys.activities(projectId),
        projectQueryKeys.deliverables(projectId),
        projectQueryKeys.indicators(projectId),
        projectQueryKeys.budget(projectId),
        projectQueryKeys.programming(projectId),
        projectQueryKeys.technicalStatus(projectId),
        projectQueryKeys.versions(projectId),
        ["projects", "financial-sheet", projectId],
        ["projects", "audit", projectId],
        ["projects", "list"],
      ]) {
        void qc.invalidateQueries({ queryKey: key });
      }
      toast.success("Línea base aprobada.");
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

// ── S8: versiones, comparación y solicitudes de modificación (E-26, E-27) ──────────────────────────

export type ProjectVersion = {
  /** 0 es la línea base; cada modificación aprobada suma uno. */
  numero: number;
  tipo: "LINEA_BASE" | "MODIFICACION";
  aprobado_at: string;
  aprobado_por: { id: string; nombre: string | null };
  motivo: string | null;
  solicitud_id: string | null;
};

export type ProjectDiferencia = {
  elemento: "proyecto" | "presupuesto" | "programacion" | "actividad" | "entregable" | "indicador";
  clave: string;
  /** `existencia` cuando el elemento aparece o desaparece. */
  campo: string;
  desde: string | null;
  hasta: string | null;
};

export type ProjectVersionComparison = { desde: string; hasta: string; diferencias: ProjectDiferencia[] };

export type { TipoModificacion };

export type ModificacionDetalleItem = {
  elemento: "presupuesto" | "programacion" | "proyecto" | "actividad" | "entregable" | "indicador";
  clave: string;
  campo?: string;
  antes: string;
  despues: string;
};

export type ProjectModificacion = {
  id: string;
  tipo: TipoModificacion;
  motivo: string;
  detalle: ModificacionDetalleItem[];
  version_base_numero: number;
  estado: "PENDIENTE" | "APROBADA" | "RECHAZADA";
  solicitado_por: { id: string; nombre: string | null };
  solicitado_at: string;
  decidido_por: { id: string; nombre: string | null } | null;
  decidido_at: string | null;
  comentario_decision: string | null;
  /** Versión que creó la aprobación; nulo mientras está pendiente o si se rechazó. */
  version_numero: number | null;
};

export type ModificacionBody = { tipo: TipoModificacion; motivo: string; detalle: ModificacionDetalleItem[] };

export type ModificacionRegla = { codigo: string; mensaje: string; clave?: string };

/** El 400 con TODAS las reglas de modificación incumplidas (RF-28, REQ-GAS-06). */
export class ModificacionReglasError extends ApiError {
  readonly reglas: ModificacionRegla[];

  constructor(message: string, reglas: ModificacionRegla[]) {
    super(message, 400, "VALIDATION_ERROR");
    this.name = "ModificacionReglasError";
    this.reglas = reglas;
  }
}

export function useProjectVersions(id: string): UseQueryResult<ProjectVersion[]> {
  return useQuery({
    queryKey: projectQueryKeys.versions(id),
    enabled: id !== "",
    queryFn: async () => (await apiGet<{ versiones: ProjectVersion[] }>(`/api/v1/projects/${id}/versions`)).versiones,
  });
}

/** E-27: diferencias entre dos versiones (`from`/`to` = número o `vigente`). */
export function useProjectVersionCompare(
  id: string,
  from: string,
  to: string,
  enabled = true,
): UseQueryResult<ProjectVersionComparison> {
  return useQuery({
    queryKey: projectQueryKeys.versionCompare(id, from, to),
    enabled: id !== "" && enabled,
    queryFn: () =>
      apiGet<ProjectVersionComparison>(
        `/api/v1/projects/${id}/versions/compare?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ),
  });
}

export function useProjectModifications(id: string): UseQueryResult<ProjectModificacion[]> {
  return useQuery({
    queryKey: projectQueryKeys.modifications(id),
    enabled: id !== "",
    queryFn: async () =>
      (await apiGet<{ solicitudes: ProjectModificacion[] }>(`/api/v1/projects/${id}/modifications`)).solicitudes,
  });
}

/** POST de una decisión o solicitud: el 400 con reglas llega tipado y NUNCA con toast (se muestra en línea). */
async function postModificacion(url: string, body: unknown, fallback: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await readJsonBody(res);
  if (!res.ok) {
    const message = typeof json.error === "string" ? json.error : fallback;
    if (Array.isArray(json.reglas)) throw new ModificacionReglasError(message, json.reglas as ModificacionRegla[]);
    throw new ApiError(message, res.status, typeof json.code === "string" ? json.code : undefined);
  }
  return json;
}

/** E-26: solicita una modificación. Las reglas incumplidas llegan en `ModificacionReglasError`. */
export function useRequestModification(projectId: string): UseMutationResult<ProjectModificacion, Error, ModificacionBody> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) =>
      (await postModificacion(`/api/v1/projects/${projectId}/modifications`, body, "No pudimos registrar la solicitud. Inténtalo de nuevo."))
        .solicitud as ProjectModificacion,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: projectQueryKeys.modifications(projectId) });
      void qc.invalidateQueries({ queryKey: ["projects", "audit", projectId] });
      toast.success("Solicitud de modificación enviada.");
    },
  });
}

/** Aprueba una solicitud: crea la versión N y cambia presupuesto, programación y estructura. */
export function useApproveModification(projectId: string): UseMutationResult<unknown, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (solicitudId) =>
      postModificacion(
        `/api/v1/projects/${projectId}/modifications/${solicitudId}/approve`,
        undefined,
        "No pudimos aprobar la modificación. Inténtalo de nuevo.",
      ),
    onSuccess: () => {
      for (const key of [
        projectQueryKeys.modifications(projectId),
        projectQueryKeys.versions(projectId),
        ["projects", "version-compare", projectId],
        projectQueryKeys.detail(projectId),
        projectQueryKeys.activities(projectId),
        projectQueryKeys.deliverables(projectId),
        projectQueryKeys.indicators(projectId),
        projectQueryKeys.budget(projectId),
        projectQueryKeys.programming(projectId),
        projectQueryKeys.technicalStatus(projectId),
        ["projects", "financial-sheet", projectId],
        ["projects", "expenses", projectId],
        ["projects", "audit", projectId],
        ["projects", "list"],
      ]) {
        void qc.invalidateQueries({ queryKey: key });
      }
      toast.success("Modificación aprobada.");
    },
  });
}

export function useRejectModification(
  projectId: string,
): UseMutationResult<unknown, Error, { solicitudId: string; comentario: string }> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ solicitudId, comentario }) =>
      postModificacion(
        `/api/v1/projects/${projectId}/modifications/${solicitudId}/reject`,
        { comentario },
        "No pudimos rechazar la solicitud. Inténtalo de nuevo.",
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: projectQueryKeys.modifications(projectId) });
      void qc.invalidateQueries({ queryKey: ["projects", "audit", projectId] });
      toast.success("Solicitud rechazada.");
    },
  });
}

/* ── Tablero y KPIs (S9 U6) ────────────────────────────────────────────── */
//
// Los colores, porcentajes y alertas llegan calculados por el servidor (`kpisProyecto`): aquí solo se
// declaran y se pintan, NUNCA se recalculan. Los montos viajan como string decimal.

export type KpiTecnico = {
  corte: string;
  avance_real: number;
  avance_programado: number;
  desviacion_pp: number;
  color: ColorSemaforo;
};

export type ProjectKpis = {
  corte: string;
  estado: EstadoProyecto;
  /** false para BORRADOR / PLANIFICACION / CANCELADO: todos los bloques vienen null. */
  medible: boolean;
  /** true solo si el PO confirmó umbrales, tolerancia y retraso. */
  confirmado: boolean;
  tecnico: KpiTecnico | null;
  cronograma: { corte: string; vencidas: number; a_tiempo: number; atrasadas: number; valor: number | null } | null;
  entregables: { corte: string; programados: number; logrados: number; valor: number | null } | null;
  indicadores: { corte: string; valor: number | null; medidos: number; en_meta: number; sin_medir: number; sin_medir_ids: string[] } | null;
  beneficiarios: { corte: string; total: number; meta: number | null; valor: number | null } | null;
  financiero: {
    corte: string;
    asignado: string;
    programado: string;
    ejecutado: string;
    ea: number | null;
    ep: number | null;
    color: ColorSemaforo;
    alerta_retraso: boolean;
  } | null;
};

/** Respuesta de `GET /api/v1/projects/:id/kpis`. */
export type ProjectKpisResponse = ProjectKpis & { base: ProjectBase };

/** Discriminador estable de un aviso de "Requiere atención"; el servidor es dueño del texto. */
export type AtencionTipo =
  | "alerta_retraso"
  | "rubro_sobreejecucion"
  | "actividad_atrasada"
  | "avance_sin_soporte"
  | "indicador_bajo_meta"
  | "gasto_observado";

export type AtencionItem = {
  tipo: AtencionTipo;
  titulo: string;
  detalle: string;
  rubro_id?: string;
  actividad_id?: string;
  avance_id?: string;
  indicador_id?: string;
  gasto_id?: string;
};

/** Respuesta de `GET /api/v1/projects/:id/attention`. */
export type ProjectAttention = {
  corte: string;
  /** false para BORRADOR / PLANIFICACION / CANCELADO: la lista viene vacía. */
  medible: boolean;
  items: AtencionItem[];
};

/** Una fila de la curva S: el periodo y las dos curvas (técnica y financiera), separadas. */
export type ProjectCurvePoint = {
  periodo: string;
  tecnico: { planeado: number; ejecutado: number | null };
  financiero: { planeado: number; ejecutado: number | null };
};

/** Respuesta de `GET /api/v1/projects/:id/curve` (S14 P7). */
export type ProjectCurve = {
  base: ProjectBase;
  corte: string;
  periodos: ProjectCurvePoint[];
};

export type PortfolioFilters = {
  corte?: string;
  estado?: string;
  cliente_id?: string;
  linea_id?: string;
  municipio_id?: string;
  responsable_id?: string;
};

export type PortfolioProject = {
  id: string;
  codigo: string;
  nombre: string;
  estado: EstadoProyecto;
  cliente: { id: string; nombre: string };
  responsable: { id: string; nombre: string } | null;
  linea_principal: { id: string; codigo: string; nombre: string } | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  semaforo_tecnico: ColorSemaforo | null;
  semaforo_financiero: ColorSemaforo | null;
  alerta_retraso: boolean | null;
  /** Actividades atrasadas (D3); null si el proyecto no es medible. */
  atrasadas: number | null;
  kpis: ProjectKpis;
};

/** Respuesta de `GET /api/v1/dashboard/portfolio`. */
export type ProjectsPortfolio = {
  base: "vigente";
  corte: string;
  confirmado: boolean;
  proyectos: PortfolioProject[];
  agregado: {
    corte: string;
    tecnico: { proyectos: number; avance_real: number | null; avance_programado: number | null };
    financiero: {
      proyectos: number;
      asignado: string;
      programado: string;
      ejecutado: string;
      ea: number | null;
      ep: number | null;
    };
    /** Σ de actividades atrasadas (D3) de los proyectos medibles. */
    atrasadas: number;
    /** Σ del número «Beneficiarios» de los proyectos medibles (M5). */
    beneficiarios: { total: number };
    /** Agregado por línea estratégica principal (S14 P9, D7): el radar del Tablero gerencial. */
    por_linea: {
      linea: { id: string; codigo: string; nombre: string } | null;
      proyectos: number;
      tecnico: { avance_real: number | null; avance_programado: number | null };
      indicadores: { valor: number | null; medidos: number; en_meta: number };
    }[];
    por_color_tecnico: Record<ColorSemaforo, number>;
    por_color_financiero: Record<ColorSemaforo, number>;
  };
  por_estado: Record<string, number>;
};

function queryString(entries: Record<string, string | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) {
    if (value !== undefined && value !== null && value !== "") sp.set(key, value);
  }
  const text = sp.toString();
  return text ? `?${text}` : "";
}

/** KPIs de un proyecto. Sin `corte` el servidor usa hoy (Bogotá); `base=original` lee la versión 0. */
export function useProjectKpis(
  id: string,
  corte: string | null,
  base: ProjectBase = "vigente",
): UseQueryResult<ProjectKpisResponse> {
  return useQuery({
    queryKey: projectQueryKeys.kpis(id, corte, base),
    enabled: id !== "",
    placeholderData: keepPreviousData,
    queryFn: () =>
      apiGet<ProjectKpisResponse>(
        `/api/v1/projects/${id}/kpis${queryString({ corte, base: base === "original" ? "original" : null })}`,
      ),
  });
}

/** "Requiere atención" de un proyecto (S14 P5): el servidor deriva la lista; el cliente solo pinta. */
export function useProjectAttention(
  id: string,
  corte: string | null = null,
): UseQueryResult<ProjectAttention> {
  return useQuery({
    queryKey: projectQueryKeys.attention(id, corte),
    enabled: id !== "",
    placeholderData: keepPreviousData,
    queryFn: () =>
      apiGet<ProjectAttention>(`/api/v1/projects/${id}/attention${queryString({ corte })}`),
  });
}

/** Curva S de un proyecto (S14 P7): el servidor devuelve las dos curvas ya calculadas; el cliente solo pinta. */
export function useProjectCurve(id: string, base: ProjectBase = "vigente"): UseQueryResult<ProjectCurve> {
  return useQuery({
    queryKey: projectQueryKeys.curve(id, base),
    enabled: id !== "",
    // Cambiar la base mantiene la curva anterior en pantalla en vez de parpadear a un esqueleto.
    placeholderData: keepPreviousData,
    queryFn: () =>
      apiGet<ProjectCurve>(`/api/v1/projects/${id}/curve${base === "original" ? "?base=original" : ""}`),
  });
}

/** Tablero del portafolio: cada filtro entra en la clave, así que cambiarlo refetchea. */
export function useProjectsPortfolio(
  filters: PortfolioFilters,
  options: { enabled?: boolean } = {},
): UseQueryResult<ProjectsPortfolio> {
  return useQuery({
    queryKey: projectQueryKeys.portfolio(filters),
    enabled: options.enabled ?? true,
    placeholderData: keepPreviousData,
    queryFn: () => apiGet<ProjectsPortfolio>(`/api/v1/dashboard/portfolio${queryString({ ...filters })}`),
  });
}

async function descargarExcel(url: string, fallbackName: string): Promise<void> {
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    throw failureOf(res, await readJsonBody(res), "No pudimos generar el archivo. Inténtalo de nuevo.");
  }
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName;
  saveBlobAs(await res.blob(), filename);
}

/** E-29: baja la ficha del proyecto o la financiera en Excel. */
export async function downloadProjectExport(
  projectId: string,
  options: { ficha: "proyecto" | "financiera"; corte?: string | null; base?: ProjectBase },
): Promise<void> {
  const query = queryString({
    ficha: options.ficha,
    corte: options.corte,
    base: options.base === "original" ? "original" : null,
  });
  await descargarExcel(`/api/v1/projects/${projectId}/export${query}`, `${options.ficha}.xlsx`);
}

/** Baja el tablero del portafolio (mismos filtros que la consulta) en Excel. */
export async function downloadPortfolioExport(filters: PortfolioFilters): Promise<void> {
  await descargarExcel(`/api/v1/dashboard/portfolio/export${queryString({ ...filters })}`, "portafolio.xlsx");
}
