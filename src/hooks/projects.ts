// TanStack Query data layer for the Proyecto "ficha" (detail), cronograma
// and soportes UI (tablero-seguimiento-social, Fase 3b, design.md
// `src/hooks/projects.ts`). Mirrors the exact conventions of
// `src/hooks/kanban.ts` (query keys object, multipart upload via raw
// `fetch` with the envelope error handling of `apiFetch`, toast on error).
//
// Named `projectDetailQueryKeys` (not `projectQueryKeys`) to avoid any
// ambiguity with the pre-existing `projectQueryKeys.byOportunidad` in
// `src/hooks/crm.ts` (Fase 2b.6) — that one stays untouched, it serves a
// different call site (the "Crear proyecto" CTA's existing-project lookup).

"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPatch, apiPost, ApiError, type ApiVoid } from "@/lib/api/http";
import type { EstadoProyecto, LineaEstrategica, TipoSoporte } from "@prisma/client";

/* ── DTOs (server response shapes) ─────────────────────────────────────── */

/** Row shape returned by `GET /api/v1/projects` — same aggregate as
 * `ProjectDetail` (via `toProjectItem`) plus `umbrales_override`, needed by
 * the Gantt/Resumen semáforo resolution added later in this change. */
export type ProjectListRow = ProjectDetail & { umbrales_override: unknown };

export type ProjectDetail = {
  id: string;
  codigo: string;
  nombre: string;
  cliente_id: string;
  cliente_nombre: string;
  oportunidad_id: string | null;
  territorio: string;
  linea_estrategica: LineaEstrategica;
  fecha_inicio: string;
  fecha_fin: string;
  estado: EstadoProyecto;
  beneficiarios_meta: number;
  responsable_id: string;
  responsable_nombre: string;
  puede_editar_proyecto: boolean;
  created_at: string;
  updated_at: string;
};

export type Meta = {
  id: string;
  proyecto_id: string;
  nombre: string;
  descripcion: string | null;
  created_at: string;
  updated_at: string;
};

export type Actividad = {
  id: string;
  proyecto_id: string;
  meta_id: string;
  nombre: string;
  descripcion: string | null;
  peso: number;
  fecha_planificada: string;
  fecha_real: string | null;
  porcentaje_avance: number;
  created_at: string;
  updated_at: string;
};

export type Indicador = {
  id: string;
  proyecto_id: string;
  meta_id: string | null;
  nombre: string;
  unidad: string;
  meta_valor: number;
  valor_actual: number | null;
  cuenta_beneficiarios: boolean;
  created_at: string;
  updated_at: string;
  /** proyecto-metas-tab (D4, KPI 3): computed server-side from
   * `valor_actual / meta_valor` against `UmbralesSemaforo.indicador` —
   * rendered verbatim by the client, never recomputed. */
  color_indicador: "verde" | "amarillo" | "rojo";
};

export type Soporte = {
  id: string;
  proyecto_id: string;
  actividad_id: string | null;
  gasto_id: string | null;
  tipo: TipoSoporte;
  nombre: string;
  storage_path: string | null;
  url_externa: string | null;
  tamano_bytes: number | null;
  // Already returned by `SUPPORT_SELECT` (attachments/route.ts) — the client
  // type just never declared it until proyecto-soportes-tab needed to
  // resolve the author's name for the Soportes tab (design.md D2).
  subido_por_id: string;
  download_url: string | null;
  created_at: string;
};

/* ── Query keys ────────────────────────────────────────────────────────── */

export const projectDetailQueryKeys = {
  list: () => ["projects", "list"] as const,
  detail: (id: string) => ["projects", "detail", id] as const,
  goals: (id: string) => ["projects", id, "goals"] as const,
  activities: (id: string) => ["projects", id, "activities"] as const,
  indicators: (id: string) => ["projects", id, "indicators"] as const,
  attachments: (id: string) => ["projects", id, "attachments"] as const,
  budget: (id: string) => ["projects", id, "budget"] as const,
  expenses: (id: string) => ["projects", id, "expenses"] as const,
  dashboard: (projectId: string | null) => ["dashboard", "projects", projectId ?? "org-wide"] as const,
};

/** Shape of `GET /api/v1/projects/:id/budget` — no envelope key, the body
 * itself is the payload (see `src/app/api/v1/projects/[id]/budget/route.ts`,
 * `round2()`: amounts are plain JS numbers, never Decimal-as-string). Zero
 * semáforo logic lives on the client — `color_financiero`/
 * `color_financiero_total` are rendered verbatim from this response. */
export type RubroBudget = {
  rubro_id: string;
  rubro_nombre: string;
  rubro_activo: boolean;
  monto_proyectado_cop: number;
  monto_ejecutado_cop: number;
  color_financiero: "verde" | "amarillo" | "rojo";
};

export type Budget = {
  rubros: RubroBudget[];
  proyectado_total: number;
  ejecutado_total: number;
  color_financiero_total: "verde" | "amarillo" | "rojo";
};

/** RF-06 (proyecto-legalizacion-tab), design.md D1 — derivado UNA sola vez,
 * server-side (`estadoLegalizacion()` in `expenses/route.ts`); nunca
 * recalculado aquí. */
export type EstadoLegalizacion = "observado" | "con_soporte" | "falta_soporte";

/** Shape of one row in `GET .../expenses`' `gastos` array. NOTE: `monto_cop`
 * arrives as a STRING, not a number — `EXPENSE_SELECT` returns the raw
 * Prisma `Decimal` and `Decimal.toJSON()` serializes to a decimal STRING
 * (verified: `JSON.stringify({ m: new Prisma.Decimal(123.45) })` ->
 * `{"m":"123.45"}`), same pre-existing characteristic as this route's
 * original T3 implementation — never "fixed" here, out of this change's
 * scope. Callers MUST `Number(gasto.monto_cop)` before formatting/summing. */
export type Gasto = {
  id: string;
  proyecto_id: string;
  linea_id: string;
  concepto: string;
  monto_cop: string;
  fecha_gasto: string;
  registrado_por_id: string;
  created_at: string;
  updated_at: string;
  tercero: string | null;
  numero_comprobante: string | null;
  observado: boolean;
  observacion: string | null;
  estado_legalizacion: EstadoLegalizacion;
  linea: { rubro_id: string; rubro: { nombre: string } };
};

/** A project's líneas presupuestales, for the "Registrar gasto" dialog's
 * Rubro selector. Sourced from `expenses/route.ts`'s GET response
 * (deviation from design.md's File Changes table, documented in apply
 * evidence: `budget/route.ts` is explicitly out of scope for this change,
 * and its own `rubros` aggregate doesn't carry `linea_id` anyway). */
export type LineaOption = { id: string; rubro_id: string; rubro_nombre: string };

export type ExpensesResponse = { gastos: Gasto[]; lineas: LineaOption[] };

/** Shape of `GET /api/v1/dashboard/projects` — no envelope key, the body
 * itself is the payload (see `src/app/api/v1/dashboard/projects/route.ts`).
 * `?proyecto_id=` scopes it to one project (design.md T6); without it the
 * response is the org-wide aggregate consumed by `/tablero-gerencial`. */
export type ProjectDashboard = {
  avance_tecnico: number;
  avance_financiero: number;
  cumplimiento_indicadores: number;
  cumplimiento_cronograma: number;
  productos_entregados: number;
  productos_programados: number;
  beneficiarios_atendidos: number;
  beneficiarios_meta: number;
  indicadores_beneficiarios_count: number;
  color_tecnico: string;
  color_financiero: string;
  curva_s: {
    meses: string[];
    planificado: number[];
    ejecutado: number[];
  };
  /** F1.6 (tablero-gerencial-unificado, slice B): desglose por proyecto de
   * cronograma/entregables — alimenta las barras por-proyecto de la 5.ª
   * cara. Opcional y aditivo: `KpiCards`/`CurveSChartContainer` (Resumen de
   * un proyecto, `projectId` presente) lo ignoran sin cambios, y fixtures de
   * tests existentes que no lo declaran siguen siendo válidas. */
  por_proyecto?: {
    proyecto_id: string;
    nombre: string;
    cumplimiento_cronograma: number;
    productos_entregados: number;
    productos_programados: number;
  }[];
  /** F1.6 (slice B): semaforización territorial — conteo de proyectos y
   * semáforo técnico/financiero por territorio, SIEMPRE contra el umbral de
   * organización (design.md D6). Opcional por el mismo motivo que
   * `por_proyecto`. */
  por_territorio?: {
    territorio: string;
    proyectos_count: number;
    color_tecnico: string;
    color_financiero: string;
  }[];
};

/* ── Queries ───────────────────────────────────────────────────────────── */

export function useProjectDetail(projectId: string | null): UseQueryResult<ProjectDetail> {
  return useQuery({
    queryKey: projectDetailQueryKeys.detail(projectId ?? "none"),
    enabled: projectId !== null,
    queryFn: async () => {
      const res = await apiGet<{ proyecto: ProjectDetail }>(`/api/v1/projects/${projectId}`);
      return res.proyecto;
    },
  });
}

export function useGoals(projectId: string | null): UseQueryResult<Meta[]> {
  return useQuery({
    queryKey: projectDetailQueryKeys.goals(projectId ?? "none"),
    enabled: projectId !== null,
    queryFn: async () => {
      const res = await apiGet<{ metas: Meta[] }>(`/api/v1/projects/${projectId}/goals`);
      return res.metas;
    },
  });
}

export function useActivities(projectId: string | null): UseQueryResult<Actividad[]> {
  return useQuery({
    queryKey: projectDetailQueryKeys.activities(projectId ?? "none"),
    enabled: projectId !== null,
    queryFn: async () => {
      const res = await apiGet<{ actividades: Actividad[] }>(`/api/v1/projects/${projectId}/activities`);
      return res.actividades;
    },
  });
}

export function useIndicators(projectId: string | null): UseQueryResult<Indicador[]> {
  return useQuery({
    queryKey: projectDetailQueryKeys.indicators(projectId ?? "none"),
    enabled: projectId !== null,
    queryFn: async () => {
      const res = await apiGet<{ indicadores: Indicador[] }>(`/api/v1/projects/${projectId}/indicators`);
      return res.indicadores;
    },
  });
}

export function useAttachments(projectId: string | null): UseQueryResult<Soporte[]> {
  return useQuery({
    queryKey: projectDetailQueryKeys.attachments(projectId ?? "none"),
    enabled: projectId !== null,
    queryFn: async () => {
      const res = await apiGet<{ soportes: Soporte[] }>(`/api/v1/projects/${projectId}/attachments`);
      return res.soportes;
    },
  });
}

export function useProjects(): UseQueryResult<ProjectListRow[]> {
  return useQuery({
    queryKey: projectDetailQueryKeys.list(),
    queryFn: async () => {
      const res = await apiGet<{ proyectos: ProjectListRow[] }>("/api/v1/projects");
      return res.proyectos;
    },
  });
}

/** `projectId === null` fetches the org-wide aggregate (Tablero Gerencial);
 * a project id scopes it via `?proyecto_id=` (Resumen tab, design.md T6).
 * Both scopes share this one hook so `KpiCards`/`CurveSChartContainer` stop
 * self-fetching and instead read/write the same TanStack Query cache. */
export function useProjectDashboard(projectId: string | null): UseQueryResult<ProjectDashboard> {
  return useQuery({
    queryKey: projectDetailQueryKeys.dashboard(projectId),
    queryFn: () => {
      const path = projectId
        ? `/api/v1/dashboard/projects?proyecto_id=${projectId}`
        : "/api/v1/dashboard/projects";
      return apiGet<ProjectDashboard>(path);
    },
  });
}

export function useBudget(projectId: string | null): UseQueryResult<Budget> {
  return useQuery({
    queryKey: projectDetailQueryKeys.budget(projectId ?? "none"),
    enabled: projectId !== null,
    queryFn: () => apiGet<Budget>(`/api/v1/projects/${projectId}/budget`),
  });
}

/** RF-06: `gastos` + `lineas` share one query/cache entry — both come from
 * the same GET response and are always consumed together by the
 * Legalización tab (ledger) and its "Registrar gasto" dialog (Rubro
 * selector). No envelope key beyond `gastos`/`lineas` themselves. */
export function useExpenses(projectId: string | null): UseQueryResult<ExpensesResponse> {
  return useQuery({
    queryKey: projectDetailQueryKeys.expenses(projectId ?? "none"),
    enabled: projectId !== null,
    queryFn: () => apiGet<ExpensesResponse>(`/api/v1/projects/${projectId}/expenses`),
  });
}

/* ── Mutations ─────────────────────────────────────────────────────────── */

function toastError(err: unknown, fallback: string): never {
  if (err instanceof ApiError) toast.error(err.message);
  else toast.error(fallback);
  throw err;
}

export type ProjectInput = {
  codigo: string;
  nombre: string;
  cliente_id: string;
  territorio: string;
  linea_estrategica: LineaEstrategica;
  fecha_inicio: string;
  fecha_fin: string;
  estado?: EstadoProyecto;
  beneficiarios_meta?: number;
  responsable_id?: string;
};

export function useCreateProject(): UseMutationResult<{ proyecto: ProjectListRow }, Error, ProjectInput> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProjectInput) => {
      try {
        return await apiPost<{ proyecto: ProjectListRow }>("/api/v1/projects", input);
      } catch (err) {
        return toastError(err, "No pudimos crear el proyecto.");
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: projectDetailQueryKeys.list() });
      toast.success("Proyecto guardado.");
    },
  });
}

export function useUpdateProject(
  projectId: string,
): UseMutationResult<{ proyecto: ProjectListRow }, Error, Partial<ProjectInput>> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<ProjectInput>) => {
      try {
        return await apiPatch<{ proyecto: ProjectListRow }>(`/api/v1/projects/${projectId}`, input);
      } catch (err) {
        return toastError(err, "No pudimos actualizar el proyecto.");
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: projectDetailQueryKeys.list() });
      void qc.invalidateQueries({ queryKey: projectDetailQueryKeys.detail(projectId) });
      toast.success("Proyecto guardado.");
    },
  });
}

export function useDeleteProject(): UseMutationResult<ApiVoid, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (projectId: string) => {
      try {
        return await apiDelete<ApiVoid>(`/api/v1/projects/${projectId}`);
      } catch (err) {
        return toastError(err, "No pudimos eliminar el proyecto.");
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: projectDetailQueryKeys.list() });
      toast.success("Proyecto eliminado.");
    },
  });
}

export type GoalInput = {
  nombre: string;
  descripcion?: string;
};

export function useCreateGoal(projectId: string): UseMutationResult<{ meta: Meta }, Error, GoalInput> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: GoalInput) => {
      try {
        return await apiPost<{ meta: Meta }>(`/api/v1/projects/${projectId}/goals`, input);
      } catch (err) {
        return toastError(err, "No pudimos crear la meta.");
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: projectDetailQueryKeys.goals(projectId) });
      toast.success("Meta guardada.");
    },
  });
}

export function useUpdateGoal(
  projectId: string,
  goalId: string,
): UseMutationResult<{ meta: Meta }, Error, Partial<GoalInput>> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<GoalInput>) => {
      try {
        return await apiPatch<{ meta: Meta }>(`/api/v1/projects/${projectId}/goals/${goalId}`, input);
      } catch (err) {
        return toastError(err, "No pudimos actualizar la meta.");
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: projectDetailQueryKeys.goals(projectId) });
      toast.success("Meta guardada.");
    },
  });
}

export function useDeleteGoal(projectId: string): UseMutationResult<ApiVoid, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (goalId: string) => {
      try {
        return await apiDelete<ApiVoid>(`/api/v1/projects/${projectId}/goals/${goalId}`);
      } catch (err) {
        return toastError(err, "No pudimos eliminar la meta.");
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: projectDetailQueryKeys.goals(projectId) });
      toast.success("Meta eliminada.");
    },
  });
}

export type IndicatorInput = {
  meta_id?: string;
  nombre: string;
  unidad: string;
  meta_valor: number;
  valor_actual?: number;
  cuenta_beneficiarios?: boolean;
};

export function useCreateIndicator(
  projectId: string,
): UseMutationResult<{ indicador: Indicador }, Error, IndicatorInput> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: IndicatorInput) => {
      try {
        return await apiPost<{ indicador: Indicador }>(`/api/v1/projects/${projectId}/indicators`, input);
      } catch (err) {
        return toastError(err, "No pudimos crear el indicador.");
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: projectDetailQueryKeys.indicators(projectId) });
      toast.success("Indicador guardado.");
    },
  });
}

export function useUpdateIndicator(
  projectId: string,
  indicatorId: string,
): UseMutationResult<{ indicador: Indicador }, Error, Partial<IndicatorInput>> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<IndicatorInput>) => {
      try {
        return await apiPatch<{ indicador: Indicador }>(
          `/api/v1/projects/${projectId}/indicators/${indicatorId}`,
          input,
        );
      } catch (err) {
        return toastError(err, "No pudimos actualizar el indicador.");
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: projectDetailQueryKeys.indicators(projectId) });
      toast.success("Indicador guardado.");
    },
  });
}

export function useDeleteIndicator(projectId: string): UseMutationResult<ApiVoid, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (indicatorId: string) => {
      try {
        return await apiDelete<ApiVoid>(`/api/v1/projects/${projectId}/indicators/${indicatorId}`);
      } catch (err) {
        return toastError(err, "No pudimos eliminar el indicador.");
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: projectDetailQueryKeys.indicators(projectId) });
      toast.success("Indicador eliminado.");
    },
  });
}

export type ExpenseInput = {
  linea_id: string;
  concepto: string;
  monto_cop: number;
  fecha_gasto: string;
  tercero?: string;
  numero_comprobante?: string;
};

export function useCreateExpense(projectId: string): UseMutationResult<{ gasto: Gasto }, Error, ExpenseInput> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ExpenseInput) => {
      try {
        return await apiPost<{ gasto: Gasto }>(`/api/v1/projects/${projectId}/expenses`, input);
      } catch (err) {
        return toastError(err, "No pudimos crear el gasto.");
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: projectDetailQueryKeys.expenses(projectId) });
      void qc.invalidateQueries({ queryKey: projectDetailQueryKeys.budget(projectId) });
      toast.success("Gasto guardado.");
    },
  });
}

/** D8: exactamente uno de `file`/`url`, nunca ambos — el formulario de la UI
 * ya los presenta como mutuamente excluyentes (radio archivo/enlace). */
export type UploadAttachmentInput = {
  nombre: string;
  tipo: TipoSoporte;
  actividad_id?: string;
  gasto_id?: string;
} & ({ file: File; url?: never } | { url: string; file?: never });

/** Multipart upload con el manejo de envelope de `apiFetch` (el header
 * Content-Type NO debe fijarse manualmente para FormData) — mismo criterio
 * que `useUploadAttachment` en kanban.ts. */
export function useUploadAttachment(
  projectId: string,
): UseMutationResult<{ soporte: Soporte }, Error, UploadAttachmentInput> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UploadAttachmentInput) => {
      const form = new FormData();
      form.set("nombre", input.nombre);
      form.set("tipo", input.tipo);
      if (input.actividad_id) form.set("actividad_id", input.actividad_id);
      if (input.gasto_id) form.set("gasto_id", input.gasto_id);
      if ("file" in input && input.file) form.set("file", input.file);
      if ("url" in input && input.url) form.set("url", input.url);

      try {
        const res = await fetch(`/api/v1/projects/${projectId}/attachments`, {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          let message = "No pudimos crear el soporte.";
          try {
            const body = (await res.json()) as { error?: string };
            message = body.error ?? message;
          } catch {
            /* fallback message */
          }
          throw new ApiError(message, res.status);
        }
        return (await res.json()) as { soporte: Soporte };
      } catch (err) {
        if (err instanceof ApiError) toast.error(err.message);
        throw err;
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: projectDetailQueryKeys.attachments(projectId) });
      toast.success("Soporte guardado.");
    },
  });
}

export function useDeleteAttachment(projectId: string): UseMutationResult<ApiVoid, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (attachmentId: string) => {
      try {
        return await apiDelete<ApiVoid>(`/api/v1/projects/${projectId}/attachments/${attachmentId}`);
      } catch (err) {
        return toastError(err, "No pudimos eliminar el soporte.");
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: projectDetailQueryKeys.attachments(projectId) });
      toast.success("Soporte eliminado.");
    },
  });
}
