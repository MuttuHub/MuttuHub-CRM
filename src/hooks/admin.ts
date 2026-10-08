// TanStack Query data layer for the admin module (PRD §3.3, Hito 7). Same
// conventions as src/hooks/crm.ts: DTOs mirror the server response shapes from
// src/app/api/v1 (settings, auth/accesos) and mutation hooks surface any
// server envelope (PRD §8.2) as a Spanish sonner toast before re-throwing.

"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { apiGet, apiPatch, apiPost, apiPut, ApiError } from "@/lib/api/http";
import type { DocCategoriaSetting } from "@/lib/settings";
import { documentQueryKeys } from "@/hooks/documents";
import { projectQueryKeys } from "@/hooks/projects";

/* ── DTOs (server response shapes) ─────────────────────────────────────── */

export type SettingsSnapshot = {
  task_tags: string[];
  doc_categories: DocCategoriaSetting[];
};

export type AccesoRow = {
  id: string;
  created_at: string;
  ip: string | null;
  user_agent: string | null;
  usuario: { email: string; nombre: string };
};

export type AccesosResponse = {
  accesos: AccesoRow[];
  next_before: string | null;
};

// QA audit finding #9: bitácora de auditoría de negocio (Cliente/Tarea/
// Documento), separada de la de accesos (solo login).
export type AuditEntidad = "cliente" | "tarea" | "documento" | "oportunidad";
// Debe reflejar src/lib/api/audit.ts (server) — "exportar" se sumó ahí en el
// PR 6 (close-phase-1) y este espejo del lado cliente quedó desactualizado,
// lo que tumbaba /administracion (ver audit-log-section.tsx).
export type AuditAccion = "crear" | "editar" | "eliminar" | "exportar" | "convertir";

export type AuditoriaRow = {
  id: string;
  entidad: AuditEntidad;
  entidad_id: string;
  accion: AuditAccion;
  cambios: Record<string, unknown> | null;
  created_at: string;
  usuario: { email: string; nombre: string };
};

export type AuditoriaResponse = {
  registros: AuditoriaRow[];
  next_before: string | null;
};

/* ── Catálogos v2 (rubros, líneas estratégicas, municipios) ─────────────── */

export type CatalogoKind = "rubros" | "strategic-lines" | "municipalities";

export type RubroAdmin = {
  id: string;
  codigo: string | null;
  nombre: string;
  activo: boolean;
  orden: number;
};

export type LineaAdmin = {
  id: string;
  codigo: string;
  nombre: string;
  activo: boolean;
  orden: number;
};

export type MunicipioAdmin = {
  id: string;
  nombre: string;
  departamento: string;
  codigo_dane: string | null;
  activo: boolean;
  orden: number;
};

export type CatalogoPatch = { nombre?: string; activo?: boolean };
export type LineaCreateInput = { codigo: string; nombre: string };
export type MunicipioCreateInput = {
  nombre: string;
  departamento: string;
  codigo_dane?: string | null;
};

/* ── Query keys ────────────────────────────────────────────────────────── */

export const adminQueryKeys = {
  settings: ["admin", "settings"],
  accesos: ["admin", "accesos"],
  catalogosV2: ["admin", "catalogos-v2"] as const,
  catalogoV2: (kind: CatalogoKind) => ["admin", "catalogos-v2", kind] as const,
  auditoria: (entidad?: AuditEntidad) => ["admin", "auditoria", entidad ?? "todas"] as const,
} as const;

/* ── Queries ───────────────────────────────────────────────────────────── */

export function useSettings(): UseQueryResult<SettingsSnapshot> {
  return useQuery({
    queryKey: adminQueryKeys.settings,
    queryFn: () => apiGet<SettingsSnapshot>("/api/v1/settings"),
  });
}

/** Catálogos v2 con filas suspendidas (`?incluir_inactivos=true`, solo ADMIN). */
function useCatalogoAdmin<T>(kind: CatalogoKind, key: string): UseQueryResult<T[]> {
  return useQuery({
    queryKey: adminQueryKeys.catalogoV2(kind),
    queryFn: async () => {
      const res = await apiGet<Record<string, T[]>>(
        `/api/v1/${kind}?incluir_inactivos=true`,
      );
      return res[key];
    },
  });
}

export function useAdminRubros(): UseQueryResult<RubroAdmin[]> {
  return useCatalogoAdmin<RubroAdmin>("rubros", "rubros");
}

export function useAdminLineas(): UseQueryResult<LineaAdmin[]> {
  return useCatalogoAdmin<LineaAdmin>("strategic-lines", "lineas");
}

export function useAdminMunicipios(): UseQueryResult<MunicipioAdmin[]> {
  return useCatalogoAdmin<MunicipioAdmin>("municipalities", "municipios");
}

// Bitácora de accesos con paginación por keyset (created_at desc):
// cada página pide los registros anteriores al next_before de la anterior.
export function useAccesos(): ReturnType<typeof useInfiniteQuery<AccesosResponse>> {
  return useInfiniteQuery({
    queryKey: adminQueryKeys.accesos,
    queryFn: ({ pageParam }) =>
      apiGet<AccesosResponse>(
        pageParam
          ? `/api/v1/auth/accesos?before=${encodeURIComponent(pageParam)}`
          : "/api/v1/auth/accesos",
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_before,
  });
}

// Bitácora de auditoría de negocio con la misma paginación por keyset que
// useAccesos; `entidad` filtra por Cliente/Tarea/Documento.
export function useAuditoria(
  entidad?: AuditEntidad,
): ReturnType<typeof useInfiniteQuery<AuditoriaResponse>> {
  return useInfiniteQuery({
    queryKey: adminQueryKeys.auditoria(entidad),
    queryFn: ({ pageParam }) => {
      const sp = new URLSearchParams();
      if (entidad) sp.set("entidad", entidad);
      if (pageParam) sp.set("before", pageParam);
      const qs = sp.toString();
      return apiGet<AuditoriaResponse>(`/api/v1/auditoria${qs ? `?${qs}` : ""}`);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_before,
  });
}

/* ── Mutations ─────────────────────────────────────────────────────────── */

export function useSaveSettings(): UseMutationResult<
  SettingsSnapshot,
  string,
  SettingsSnapshot
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (snapshot) => {
      try {
        return await apiPut<SettingsSnapshot>("/api/v1/settings", {
          task_tags: snapshot.task_tags,
          doc_categories: snapshot.doc_categories,
        });
      } catch (err) {
        return toastError(err, "No pudimos guardar los catálogos.");
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.settings });
      // Bug fix (code review): guardar acá no invalidaba la query key que usa
      // useDocCategories() — un diálogo de Upload/los filtros del Repositorio
      // ya montados en esta sesión seguían mostrando el catálogo viejo hasta
      // el próximo refetch natural (foco de ventana, remount, etc.).
      void qc.invalidateQueries({ queryKey: documentQueryKeys.categories });
      toast.success("Catálogos guardados.");
    },
  });
}

// Los catálogos v2 los consumen los formularios de proyecto (solo activos):
// tras cualquier cambio se refrescan ambas vistas. Los errores se re-lanzan
// sin toast: la sección los muestra en línea con el mensaje del servidor.
function useInvalidateCatalogos() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: adminQueryKeys.catalogosV2 });
    void qc.invalidateQueries({ queryKey: projectQueryKeys.strategicLines });
    void qc.invalidateQueries({ queryKey: projectQueryKeys.municipalities });
  };
}

export function useUpdateCatalogo() {
  const invalidate = useInvalidateCatalogos();
  return useMutation({
    mutationFn: (v: { kind: CatalogoKind; id: string; data: CatalogoPatch }) =>
      apiPatch<unknown>(`/api/v1/${v.kind}/${v.id}`, v.data),
    onSuccess: invalidate,
  });
}

export function useCreateLinea() {
  const invalidate = useInvalidateCatalogos();
  return useMutation({
    mutationFn: (input: LineaCreateInput) => apiPost<unknown>("/api/v1/strategic-lines", input),
    onSuccess: invalidate,
  });
}

export function useCreateMunicipio() {
  const invalidate = useInvalidateCatalogos();
  return useMutation({
    mutationFn: (input: MunicipioCreateInput) => apiPost<unknown>("/api/v1/municipalities", input),
    onSuccess: invalidate,
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
