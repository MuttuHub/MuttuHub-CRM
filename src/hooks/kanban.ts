// TanStack Query data layer for the Kanban module (Hito 3). DTOs mirror the
// server shapes from src/app/api/v1/tasks (list, detail, status, comments,
// subtasks, attachments, report, export) plus /api/v1/auth/me for the
// "Mi tablero" scope. Mutations toast Spanish errors centrally (same
// convention as src/hooks/crm.ts) and re-throw so callers can roll back
// optimistic UI. useMoveTask deliberately has NO toast: the board shows its
// own "No pudimos mover la tarea." on rollback.

"use client";

import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from "@tanstack/react-query";
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
};

export type CurrentUser = {
  id: string;
  nombre: string;
  rol: RolUsuario;
};

/**
 * Server-side task filters (the /api/v1/tasks list actually accepts these:
 * q, cliente, responsable, estado, origen, vencidas + pagination).
 */
export type TaskFilters = {
  q?: string;
  cliente?: string;
  responsable?: string;
  estado?: EstadoTarea;
  origen?: OrigenTarea;
  vencidas?: boolean;
  page?: number;
  limit?: number;
};

/**
 * Client-side filters (prioridad, etiqueta, rango de fecha) that the list
 * endpoint does NOT support yet — the board applies them locally on the
 * fetched page (limit 100). Kept separate so re-fetches stay honest.
 */
export type LocalTaskFilters = {
  prioridad: PrioridadTarea | "";
  etiqueta: string;
  desde: string;
  hasta: string;
};

export const EMPTY_LOCAL_TASK_FILTERS: LocalTaskFilters = {
  prioridad: "",
  etiqueta: "",
  desde: "",
  hasta: "",
};

export function localFiltersActive(f: LocalTaskFilters): boolean {
  return f.prioridad !== "" || f.etiqueta !== "" || f.desde !== "" || f.hasta !== "";
}

export function applyLocalFilters(items: TaskItem[], local: LocalTaskFilters): TaskItem[] {
  if (!localFiltersActive(local)) return items;
  const desde = local.desde ? new Date(`${local.desde}T00:00:00`).getTime() : null;
  const hasta = local.hasta ? new Date(`${local.hasta}T23:59:59.999`).getTime() : null;
  return items.filter((t) => {
    if (local.prioridad && t.prioridad !== local.prioridad) return false;
    if (local.etiqueta && !t.etiquetas.includes(local.etiqueta)) return false;
    const fecha = t.fecha_entrega ? new Date(t.fecha_entrega).getTime() : null;
    if (fecha === null) {
      if (desde !== null || hasta !== null) return false;
    } else {
      if (desde !== null && fecha < desde) return false;
      if (hasta !== null && fecha > hasta) return false;
    }
    return true;
  });
}

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

export function useTasks(filters: TaskFilters): UseQueryResult<TaskListResponse> {
  return useQuery({
    queryKey: taskQueryKeys.list(filters),
    queryFn: () => {
      const qs = buildTaskQueryString(filters);
      return apiGet<TaskListResponse>(`/api/v1/tasks?${qs}`);
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

export function useCurrentUser(): UseQueryResult<CurrentUser | null> {
  return useQuery({
    queryKey: taskQueryKeys.me(),
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