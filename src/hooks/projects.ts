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
  useQueries,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut, ApiError } from "@/lib/api/http";
import type { EstadoActividad, Tendencia } from "@/lib/proyectos/avance";
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
  technicalStatus: (id: string) => ["projects", "technical-status", id] as const,
  deliverableProgress: (id: string, deliverableId: string) =>
    ["projects", "deliverable-progress", id, deliverableId] as const,
  indicatorMeasurements: (id: string, indicatorId: string) =>
    ["projects", "indicator-measurements", id, indicatorId] as const,
  beneficiaries: (id: string) => ["projects", "beneficiaries", id] as const,
  budget: (id: string) => ["projects", "budget", id] as const,
  programming: (id: string) => ["projects", "programming", id] as const,
  financialSheet: (id: string, corte: string | null) => ["projects", "financial-sheet", id, corte] as const,
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

/* ── Ejecución técnica (S4 U6): lecturas ───────────────────────────────── */
//
// Todo lo que la sección "Ejecución técnica" lee. El color del semáforo llega
// del servidor: se declara y se pinta tal cual, nunca se recalcula aquí.

export type ColorSemaforo = "verde" | "amarillo" | "rojo";

/** Fila de `actividades[]` en `GET /api/v1/projects/:id/technical-status`. */
export type ProjectTechnicalActivity = {
  id: string;
  codigo: string;
  peso: number;
  /** Porcentaje 0..100 con un decimal, ya derivado por el servidor. */
  progreso: number;
  estado: EstadoActividad;
  fecha_cumplimiento: string | null;
};

/** Respuesta de `GET /api/v1/projects/:id/technical-status?corte=AAAA-MM-DD`. */
export type ProjectTechnicalStatus = {
  /** "vigente" hasta que existan líneas base (S8). */
  base: string;
  corte: string;
  estado: EstadoProyecto;
  avance_real: number;
  avance_programado: number;
  desviacion_pp: number;
  color: ColorSemaforo;
  actividades: ProjectTechnicalActivity[];
  umbrales: { umbral1: number; umbral2: number; confirmado: boolean };
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

/** Semáforo técnico del proyecto (color incluido: se pinta, no se recalcula). */
export function useProjectTechnicalStatus(id: string): UseQueryResult<ProjectTechnicalStatus> {
  return useQuery({
    queryKey: projectQueryKeys.technicalStatus(id),
    enabled: id !== "",
    queryFn: () => apiGet<ProjectTechnicalStatus>(`/api/v1/projects/${id}/technical-status`),
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

/**
 * ADR-13 para el medio de un avance: firmar -> subir directo a Storage -> confirmar
 * con metadatos. Los bytes nunca pasan por el route handler.
 */
async function uploadAvanceMedioFile(
  projectId: string,
  progressId: string,
  file: File,
): Promise<void> {
  const signed = await apiPost<SignedUploadResponse>(
    `/api/v1/projects/${projectId}/progress/${progressId}/attachments/sign`,
    {
      nombre: file.name,
      tamano_bytes: file.size,
      ...(file.type ? { tipo_mime: file.type } : {}),
    },
  );

  const res = await fetch(signed.signed_url, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "x-upsert": "false",
    },
    body: file,
  });
  if (!res.ok) throw new ApiError("No pudimos subir el archivo al almacenamiento.", res.status);

  await apiPost(`/api/v1/projects/${projectId}/progress/${progressId}/attachments`, {
    storage_path: signed.storage_path,
    nombre: file.name,
    tamano_bytes: file.size,
    ...(file.type ? { tipo_mime: file.type } : {}),
  });
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
  base: string;
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
): UseQueryResult<ProjectFinancialSheet> {
  return useQuery({
    queryKey: projectQueryKeys.financialSheet(id, corte),
    enabled: id !== "",
    queryFn: () =>
      apiGet<ProjectFinancialSheet>(
        `/api/v1/projects/${id}/financial-sheet${corte ? `?corte=${encodeURIComponent(corte)}` : ""}`,
      ),
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
