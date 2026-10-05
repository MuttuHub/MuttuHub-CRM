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

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/http";
import type { EstadoProyecto, OrigenProyecto } from "@prisma/client";

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
