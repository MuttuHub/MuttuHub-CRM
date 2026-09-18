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
import { apiDelete, apiGet, ApiError, type ApiVoid } from "@/lib/api/http";
import type { EstadoProyecto, LineaEstrategica, TipoSoporte } from "@prisma/client";

/* ── DTOs (server response shapes) ─────────────────────────────────────── */

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
  download_url: string | null;
  created_at: string;
};

/* ── Query keys ────────────────────────────────────────────────────────── */

export const projectDetailQueryKeys = {
  detail: (id: string) => ["projects", "detail", id] as const,
  goals: (id: string) => ["projects", id, "goals"] as const,
  activities: (id: string) => ["projects", id, "activities"] as const,
  attachments: (id: string) => ["projects", id, "attachments"] as const,
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

/* ── Mutations ─────────────────────────────────────────────────────────── */

function toastError(err: unknown, fallback: string): never {
  if (err instanceof ApiError) toast.error(err.message);
  else toast.error(fallback);
  throw err;
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
