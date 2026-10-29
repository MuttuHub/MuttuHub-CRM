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
import type { ParametroKey, ParametrosV2 } from "@/lib/proyectos/semaforo-v2";

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
export type AuditEntidad = "cliente" | "tarea" | "documento" | "oportunidad" | "dashboard";
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

export type CatalogoPatch = { nombre?: string; activo?: boolean };
export type LineaCreateInput = { codigo: string; nombre: string };

/* ── Query keys ────────────────────────────────────────────────────────── */

export const adminQueryKeys = {
  settings: ["admin", "settings"],
  accesos: ["admin", "accesos"],
  semaforoV2: ["admin", "semaforo-v2"] as const,
  catalogosV2: ["admin", "catalogos-v2"] as const,
  catalogoV2: (kind: CatalogoKind) => ["admin", "catalogos-v2", kind] as const,
  auditoria: (entidad?: AuditEntidad) => ["admin", "auditoria", entidad ?? "todas"] as const,
  // Jefe 2026-10-28 lane 1 task 1.1: catálogo LIVE de etiquetas de tarea
  // (task_tags) — lo consumen los formularios de tarea y el filtro del
  // tablero, sin rol de administrador (mismo endpoint que useDocCategories).
  taskTags: ["catalogs", "task-tags"] as const,
} as const;

/* ── Queries ───────────────────────────────────────────────────────────── */

export function useSettings(): UseQueryResult<SettingsSnapshot> {
  return useQuery({
    queryKey: adminQueryKeys.settings,
    queryFn: () => apiGet<SettingsSnapshot>("/api/v1/settings"),
  });
}

/* Catálogo de etiquetas de tarea EN VIVO (setting `task_tags`, con fallback
   a las constantes de fábrica) vía GET /api/v1/catalogs/settings — el mismo
   endpoint que lee el admin, sin requerir su rol. Espejo de useDocCategories
   (hooks/documents.ts): los formularios de tarea (tablero y CRM) y el filtro
   de etiqueta del tablero deben ofrecer exactamente lo que el servidor
   valida en POST/PATCH /tasks, no el arreglo estático TASK_TAGS — bug del
   jefe 2026-10-28: «le muestra que se crean y están en el listado de
   etiquetas, pero no aparecen al momento de crear un cliente o asignar una
   tarea». */
export function useTaskTags(): UseQueryResult<string[]> {
  return useQuery({
    queryKey: adminQueryKeys.taskTags,
    queryFn: async () => {
      const res = await apiGet<{ task_tags: string[] }>("/api/v1/catalogs/settings");
      return res.task_tags;
    },
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
      // Jefe 2026-10-28 lane 1 task 1.1: igual que con las categorías de
      // documentos, guardar el catálogo debe refrescar los consumidores del
      // catálogo LIVE de etiquetas (formularios de tarea y filtro del
      // tablero) ya montados en esta sesión.
      void qc.invalidateQueries({ queryKey: adminQueryKeys.taskTags });
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

/* ── Parámetros del semáforo v2 ────────────────────────────────────────── */

/** Cuerpo del PATCH: solo los campos que cambian; `confirmado` solo si se envía. */
export type SemaforoParametrosPatch = {
  [K in ParametroKey]?: { valor?: ParametrosV2[K]["valor"]; confirmado?: boolean };
};

export function useSemaforoParametros(): UseQueryResult<ParametrosV2> {
  return useQuery({
    queryKey: adminQueryKeys.semaforoV2,
    queryFn: async () => {
      const res = await apiGet<{ parametros: ParametrosV2 }>("/api/v1/settings/semaforo-v2");
      return res.parametros;
    },
  });
}

// Los errores se re-lanzan sin toast: la sección los muestra en línea.
export function useSaveSemaforoParametros() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: SemaforoParametrosPatch) => {
      const res = await apiPatch<{ parametros: ParametrosV2 }>("/api/v1/settings/semaforo-v2", patch);
      return res.parametros;
    },
    onSuccess: (parametros) => {
      qc.setQueryData(adminQueryKeys.semaforoV2, parametros);
      toast.success("Parámetros guardados.");
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
