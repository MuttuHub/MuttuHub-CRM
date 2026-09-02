// TanStack Query data layer for the Kanban module (Hito 3). DTOs mirror the
// server shapes from src/app/api/v1/tasks (list, detail, status, comments,
// subtasks, attachments, report, export) plus /api/v1/auth/me for the
// "Mi tablero" scope. Mutations toast Spanish errors centrally (same
// convention as src/hooks/crm.ts) and re-throw so callers can roll back
// optimistic UI. useMoveTask deliberately has NO toast: the board shows its
// own "No pudimos mover la tarea." on rollback.

"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPatch, apiPost, ApiError, type ApiVoid } from "@/lib/api/http";
import type { EstadoTarea, OrigenTarea, PrioridadTarea, RolUsuario } from "@prisma/client";
import type { TaskItem, TaskListResponse } from "@/hooks/crm";

/* ── DTOs (server response shapes) ─────────────────────────────────────── */

export type ComentarioTarea = {
  id: string;
  autor_id: string;
  autor_nombre: string;
  texto: string;
  created_at: string;
};

export type TaskDetail = TaskItem & { comentarios: ComentarioTarea[] };

export type Subtarea = {
  id: string;
  tarea_id: string;
  titulo: string;
  completada: boolean;
};

export type Adjunto = {
  id: string;
  nombre: string;
  tamano_bytes: number | null;
  created_at: string;
};

export type TaskReportResponse = {
  rango: "week" | "month" | "quarter" | "all";
  resumen: {
    total_asignadas: number;
    vencidas_activas: number;
    completadas: number;
    tasa_cumplimiento: number;
    a_tiempo: number;
    tarde: number;
  };
  por_persona: {
    id: string;
    nombre: string;
    asignadas: number;
    en_curso: number;
    vencidas: number;
    completadas: number;
    a_tiempo: number;
    tarde: number;
  }[];
  por_estado: { estado: EstadoTarea; cantidad: number }[];
  por_cliente: { id: string; nombre: string; cantidad: number }[];
  /** PR 20 (plan 3B): vencidas activas por antigüedad + abiertas sin fecha. */
  vencimientos_por_antiguedad: { bucket: string; cantidad: number }[];
  /** PR 20: histograma exacto sobre fecha_entrega de las tareas abiertas. */
  carga_semanal: { semana: string; cantidad: number }[];
  /** PR 22: cierres por semana sobre completed_at (la marca real). */
  tendencia_cierre: { semana: string; cantidad: number }[];
  /** PR 23: la UI/PDF declaran el criterio del rango desde el payload. */
  meta: { criterio_rango: string };
};

export type CurrentUser = {
  id: string;
  nombre: string;
  rol: RolUsuario;
};

/**
 * Server-side task filters (the /api/v1/tasks list actually accepts these:
 * q, cliente, responsable, estado, origen, prioridad, etiqueta,
 * fecha_entrega_desde, fecha_entrega_hasta, vencidas + pagination).
 *
 * PR 6 (close-phase-1): prioridad / etiqueta / fecha_entrega_* are now
 * real server clauses (synthetic-rabin §"El tope de 100"); the board
 * feeds them as URL params and the API filters the result set before
 * paginating. The matching `total` on the response is honest about
 * truncation vs. filtering, and the board renders a banner when
 * items.length < total.
 */
export type TaskFilters = {
  q?: string;
  cliente?: string;
  responsable?: string;
  estado?: EstadoTarea;
  origen?: OrigenTarea;
  prioridad?: PrioridadTarea;
  etiqueta?: string;
  fecha_entrega_desde?: string;
  fecha_entrega_hasta?: string;
  vencidas?: boolean;
  page?: number;
  limit?: number;
};

/** URL query string for the server-supported task params (list/export/print). */
export function buildTaskQueryString(filters: TaskFilters, overrides?: TaskFilters): string {
  const merged = { ...filters, ...overrides };
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined || value === null || value === "") continue;
    sp.set(key, String(value));
  }
  return sp.toString();
}

/* ── Query keys ────────────────────────────────────────────────────────── */

export const taskQueryKeys = {
  all: ["tasks"] as const,
  list: (filters: TaskFilters) => ["tasks", "list", filters] as const,
  detail: (id: string | null) => ["tasks", "detail", id ?? "none"] as const,
  comments: (id: string) => ["tasks", id, "comments"] as const,
  subtasks: (id: string) => ["tasks", id, "subtasks"] as const,
  attachments: (id: string) => ["tasks", id, "attachments"] as const,
  report: (filters: ReportFilters) => ["tasks", "report", filters] as const,
  me: () => ["auth", "me"] as const,
  clientsForFilter: () => ["clients", "filter-options"] as const,
};

/* ── Queries ───────────────────────────────────────────────────────────── */

/**
 * Page size for the kanban task list (PR 7, close-phase-1). The server already
 * paginates (GET /api/v1/tasks accepts `page`/`limit` and returns
 * `page`/`limit`/`total`/`items`); the hook now drives pages of this size via
 * `useInfiniteQuery` so the board can show every task instead of a silent
 * 100-row cut. The `Cargar más` button at the bottom of the board triggers
 * `fetchNextPage` (D8 — explicit button, no scroll listener, to keep the
 * @dnd-kit pointer/touch handlers stable).
 */
export const TASKS_PAGE_SIZE = 100;

export function useTasks(
  filters: TaskFilters,
): UseInfiniteQueryResult<InfiniteData<TaskListResponse>, Error> {
  return useInfiniteQuery({
    queryKey: taskQueryKeys.list(filters),
    queryFn: ({ pageParam, signal }) => {
      // pageParam is the 1-based page number. First page is 1 so the server
      // (parsePagination default) and the hook agree on `page=1`.
      const qs = buildTaskQueryString({
        ...filters,
        page: pageParam as number,
        limit: TASKS_PAGE_SIZE,
      });
      return apiGet<TaskListResponse>(`/api/v1/tasks?${qs}`, { signal });
    },
    initialPageParam: 1,
    // While the accumulated page set hasn't covered `total` there is more to
    // fetch. The server's `total` excludes prioridad / etiqueta /
    // fecha_entrega_* (D7) — accepted asymmetry: when those filters are
    // active the user may "click past" the filtered result and observe empty
    // pages until items.length === total. The hook mirrors the spec wording.
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + p.items.length, 0);
      return loaded < lastPage.total ? lastPage.page + 1 : null;
    },
  });
}

export function useTask(id: string | null): UseQueryResult<TaskDetail> {
  return useQuery({
    queryKey: taskQueryKeys.detail(id),
    enabled: id !== null,
    queryFn: async () => {
      const res = await apiGet<{ task: TaskDetail }>(`/api/v1/tasks/${id}`);
      return res.task;
    },
  });
}

export type ReportFilters = {
  rango: "week" | "month" | "quarter" | "all";
  responsable?: string;
  cliente?: string;
};

export function useTaskReport(filters: ReportFilters): UseQueryResult<TaskReportResponse> {
  return useQuery({
    queryKey: taskQueryKeys.report(filters),
    queryFn: () => {
      const sp = new URLSearchParams();
      sp.set("rango", filters.rango);
      if (filters.responsable) sp.set("responsable", filters.responsable);
      if (filters.cliente) sp.set("cliente", filters.cliente);
      return apiGet<TaskReportResponse>(`/api/v1/tasks/report?${sp.toString()}`);
    },
  });
}

export function useComments(taskId: string | null): UseQueryResult<ComentarioTarea[]> {
  return useQuery({
    queryKey: taskQueryKeys.comments(taskId ?? "none"),
    enabled: taskId !== null,
    queryFn: async () => {
      const res = await apiGet<{ comentarios: ComentarioTarea[] }>(
        `/api/v1/tasks/${taskId}/comments`,
      );
      return res.comentarios;
    },
  });
}

export function useSubtareas(taskId: string | null): UseQueryResult<Subtarea[]> {
  return useQuery({
    queryKey: taskQueryKeys.subtasks(taskId ?? "none"),
    enabled: taskId !== null,
    queryFn: async () => {
      const res = await apiGet<{ subtareas: Subtarea[] }>(`/api/v1/tasks/${taskId}/subtasks`);
      return res.subtareas;
    },
  });
}

export function useAttachments(taskId: string | null): UseQueryResult<Adjunto[]> {
  return useQuery({
    queryKey: taskQueryKeys.attachments(taskId ?? "none"),
    enabled: taskId !== null,
    queryFn: async () => {
      const res = await apiGet<{ adjuntos: Adjunto[] }>(`/api/v1/tasks/${taskId}/attachments`);
      return res.adjuntos;
    },
  });
}

export function useCurrentUser(initialData?: CurrentUser | null): UseQueryResult<CurrentUser | null> {
  return useQuery({
    queryKey: taskQueryKeys.me(),
    initialData,
    queryFn: async () => {
      try {
        const res = await apiGet<{ usuario: CurrentUser | null }>("/api/v1/auth/me");
        return res.usuario;
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60 * 1000,
  });
}

export type ClientOption = { id: string; nombre: string };

export function useClientOptions(): UseQueryResult<ClientOption[]> {
  return useQuery({
    queryKey: taskQueryKeys.clientsForFilter(),
    queryFn: async () => {
      const res = await apiGet<{ items: ClientOption[] }>("/api/v1/clients?page=1&limit=100");
      return res.items;
    },
  });
}

/* ── Mutations ─────────────────────────────────────────────────────────── */

type TaskInput = {
  titulo: string;
  descripcion?: string | null;
  responsable_id?: string;
  cliente_id?: string | null;
  estado?: EstadoTarea;
  origen?: OrigenTarea;
  prioridad?: PrioridadTarea | null;
  fecha_entrega?: string | null;
  etiquetas?: string[];
  motivo_bloqueo?: string | null;
};

export function useMoveTask(): UseMutationResult<
  { task: TaskItem },
  Error,
  { taskId: string; estado: EstadoTarea; motivo_bloqueo?: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, estado, motivo_bloqueo }) =>
      apiPatch<{ task: TaskItem }>(`/api/v1/tasks/${taskId}/status`, {
        estado,
        ...(motivo_bloqueo !== undefined ? { motivo_bloqueo } : {}),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useCreateTask(): UseMutationResult<
  { task: TaskItem },
  Error,
  TaskInput & { responsable_id: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input) => {
      try {
        return await apiPost<{ task: TaskItem }>("/api/v1/tasks", input);
      } catch (err) {
        return toastError(err, "No pudimos guardar la tarea.");
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Tarea guardada.");
    },
  });
}

export function useUpdateTask(taskId: string): UseMutationResult<
  { task: TaskItem },
  Error,
  Partial<TaskInput>
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input) => {
      try {
        return await apiPatch<{ task: TaskItem }>(`/api/v1/tasks/${taskId}`, input);
      } catch (err) {
        return toastError(err, "No pudimos actualizar la tarea.");
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Tarea guardada.");
    },
  });
}

export function useDeleteTask(taskId: string): UseMutationResult<ApiVoid, Error, void> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      try {
        return await apiDelete<ApiVoid>(`/api/v1/tasks/${taskId}`);
      } catch (err) {
        return toastError(err, "No pudimos eliminar la tarea.");
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Tarea eliminada.");
    },
  });
}

export function useAddComment(taskId: string): UseMutationResult<
  { comentario: ComentarioTarea },
  Error,
  { texto: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ texto }) => {
      try {
        return await apiPost<{ comentario: ComentarioTarea }>(
          `/api/v1/tasks/${taskId}/comments`,
          { texto },
        );
      } catch (err) {
        return toastError(err, "No pudimos guardar el comentario.");
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: taskQueryKeys.comments(taskId) });
      void qc.invalidateQueries({ queryKey: taskQueryKeys.detail(taskId) });
    },
  });
}

export function useAddSubtarea(taskId: string): UseMutationResult<
  { subtarea: Subtarea },
  Error,
  { titulo: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ titulo }) => {
      try {
        return await apiPost<{ subtarea: Subtarea }>(`/api/v1/tasks/${taskId}/subtasks`, {
          titulo,
        });
      } catch (err) {
        return toastError(err, "No pudimos guardar el subtarea.");
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: taskQueryKeys.subtasks(taskId) });
    },
  });
}

export function useUpdateSubtarea(
  taskId: string,
  subtareaId: string,
): UseMutationResult<{ subtarea: Subtarea }, Error, { completada?: boolean; titulo?: string }> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input) => {
      try {
        return await apiPatch<{ subtarea: Subtarea }>(
          `/api/v1/tasks/${taskId}/subtasks/${subtareaId}`,
          input,
        );
      } catch (err) {
        return toastError(err, "No pudimos actualizar el subtarea.");
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: taskQueryKeys.subtasks(taskId) });
      void qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useDeleteSubtarea(
  taskId: string,
  subtareaId: string,
): UseMutationResult<ApiVoid, Error, void> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      try {
        return await apiDelete<ApiVoid>(`/api/v1/tasks/${taskId}/subtasks/${subtareaId}`);
      } catch (err) {
        return toastError(err, "No pudimos eliminar el subtarea.");
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: taskQueryKeys.subtasks(taskId) });
      void qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

/** Multipart upload with the envelope error handling of apiFetch (the
 *  Content-Type header must NOT be set for FormData). */
export function useUploadAttachment(taskId: string): UseMutationResult<
  { adjunto: Adjunto },
  Error,
  File
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      try {
        const res = await fetch(`/api/v1/tasks/${taskId}/attachments`, {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          let message = "No pudimos subir el archivo.";
          try {
            const body = (await res.json()) as { error?: string };
            message = body.error ?? message;
          } catch {
            /* fallback message */
          }
          throw new ApiError(message, res.status);
        }
        return (await res.json()) as { adjunto: Adjunto };
      } catch (err) {
        if (err instanceof ApiError) toast.error(err.message);
        throw err;
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: taskQueryKeys.attachments(taskId) });
      // Bug report: uploading an attachment also mirrors it into the
      // Document Repository (see /api/v1/tasks/[id]/attachments), which
      // bumps the "documentos" count GET /api/v1/nav/counts returns — but
      // nothing here invalidated ["nav","counts"], so the sidebar badge
      // stayed stale until an unrelated refetch happened to catch up.
      void qc.invalidateQueries({ queryKey: ["nav", "counts"] });
      toast.success("Archivo adjunto subido.");
    },
  });
}

/* ── Formatting helpers ────────────────────────────────────────────────── */

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const ALLOWED_ATTACHMENT_EXT = ["pdf", "docx", "xlsx", "jpg", "png"];
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export function attachmentValidationError(file: File): string | null {
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!ALLOWED_ATTACHMENT_EXT.includes(ext)) {
    return "Solo se aceptan PDF, Word (.docx), Excel (.xlsx), JPG o PNG.";
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return "El archivo supera el límite de 10 MB.";
  }
  return null;
}

function toastError(err: unknown, fallback: string): never {
  if (err instanceof ApiError) {
    toast.error(err.message);
  } else {
    toast.error(fallback);
  }
  throw err;
}