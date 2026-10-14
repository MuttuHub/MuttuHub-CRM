// Project query of the "Nuevo proyecto" page. Same key and fetcher as the shared `useProject`, so the cache is
// shared with the ficha and the editors that invalidate it, but a 404 is never retried: a `?proyecto=<id>` that
// does not exist must show "El proyecto no existe." at once, not after the default retries with backoff.
// The shared hook keeps its defaults for every other caller.

"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { ApiError, apiGet } from "@/lib/api/http";
import { projectQueryKeys, type ProjectListRow } from "@/hooks/projects";

const MAX_REINTENTOS = 3;

export function reintentarProyecto(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status === 404) return false;
  return failureCount < MAX_REINTENTOS;
}

export function useProyectoNuevo(id: string): UseQueryResult<ProjectListRow> {
  return useQuery<ProjectListRow>({
    queryKey: projectQueryKeys.detail(id),
    enabled: id !== "",
    retry: reintentarProyecto,
    queryFn: async () => {
      const res = await apiGet<{ proyecto: ProjectListRow }>(`/api/v1/projects/${id}`);
      return res.proyecto;
    },
  });
}
