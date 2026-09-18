// Access helpers for the Proyecto aggregate (tablero-seguimiento-social,
// T10, design.md). New file rather than an addition to crm.ts (D-level
// deviation declared in design.md T10: crm.ts is the CRM aggregate — client
// / task / opportunity — and already exceeds 450 lines). Mirrors the exact
// literal shape of loadClientForOpportunityRead / getClientForOpportunityWrite
// in crm.ts: `{ ok: false, code: "NOT_FOUND" | "FORBIDDEN" }` on the failure
// path, `{ ok: true, proyecto }` on success.

import type { Prisma, Usuario } from "@prisma/client";
import { db } from "@/lib/db";
import { canManageProject, canViewProject } from "@/lib/permissions";

/**
 * Read access to a project (RNF-01/T9): existence is checked first, then
 * `canViewProject` gates visibility (management dashboard flag/role, or the
 * project's own responsable). Same NOT_FOUND / FORBIDDEN shape as
 * `loadClientForOpportunityRead`.
 */
export async function loadProjectScoped(id: string, usuario: Usuario) {
  const proyecto = await db.proyecto.findFirst({
    where: { id, deleted_at: null },
    select: { id: true, responsable_id: true },
  });
  if (!proyecto) return { ok: false as const, code: "NOT_FOUND" as const };
  if (
    !canViewProject(proyecto, {
      id: usuario.id,
      rol: usuario.rol,
      puede_ver_tablero_gerencial: usuario.puede_ver_tablero_gerencial,
    })
  ) {
    return { ok: false as const, code: "FORBIDDEN" as const };
  }
  return { ok: true as const, proyecto };
}

/**
 * Write access to a project and everything hanging off it (metas,
 * actividades, líneas presupuestales, gastos, soportes): `canManageProject`
 * (T9 — canManageAny roles, or the project's own responsable). The
 * `puede_ver_tablero_gerencial` flag never composes here — same NOT_FOUND /
 * FORBIDDEN shape as `getClientForOpportunityWrite`.
 */
export async function getProjectForWrite(id: string, usuario: Usuario) {
  const proyecto = await db.proyecto.findFirst({
    where: { id, deleted_at: null },
    select: { id: true, responsable_id: true },
  });
  if (!proyecto) return { ok: false as const, code: "NOT_FOUND" as const };
  if (!canManageProject(proyecto, { id: usuario.id, rol: usuario.rol })) {
    return { ok: false as const, code: "FORBIDDEN" as const };
  }
  return { ok: true as const, proyecto };
}

/** Projection shared by the Proyecto list/detail/create responses (Phase 2b+). */
export const PROJECT_SELECT = {
  id: true,
  codigo: true,
  nombre: true,
  cliente_id: true,
  oportunidad_id: true,
  territorio: true,
  linea_estrategica: true,
  fecha_inicio: true,
  fecha_fin: true,
  estado: true,
  beneficiarios_meta: true,
  responsable_id: true,
  umbrales_override: true,
  created_at: true,
  updated_at: true,
  cliente: { select: { nombre: true } },
  responsable: { select: { nombre: true } },
} as const;

export type ProjectRow = Prisma.ProyectoGetPayload<{ select: typeof PROJECT_SELECT }>;

export type ProjectItem = {
  id: string;
  codigo: string;
  nombre: string;
  cliente_id: string;
  cliente_nombre: string;
  oportunidad_id: string | null;
  territorio: string;
  linea_estrategica: ProjectRow["linea_estrategica"];
  fecha_inicio: Date;
  fecha_fin: Date;
  estado: ProjectRow["estado"];
  beneficiarios_meta: number;
  responsable_id: string;
  responsable_nombre: string;
  umbrales_override: Prisma.JsonValue;
  /** Calculado como `canManageProject(proyecto, actor)` — el servidor sigue
   * siendo la autoridad, las rutas responden 403 igual (design.md). */
  puede_editar_proyecto: boolean;
  created_at: Date;
  updated_at: Date;
};

/** Row -> JSON shape shared by every project endpoint. */
export function toProjectItem(
  proyecto: ProjectRow,
  actor: { id: string; rol: Usuario["rol"] },
): ProjectItem {
  return {
    id: proyecto.id,
    codigo: proyecto.codigo,
    nombre: proyecto.nombre,
    cliente_id: proyecto.cliente_id,
    cliente_nombre: proyecto.cliente.nombre,
    oportunidad_id: proyecto.oportunidad_id,
    territorio: proyecto.territorio,
    linea_estrategica: proyecto.linea_estrategica,
    fecha_inicio: proyecto.fecha_inicio,
    fecha_fin: proyecto.fecha_fin,
    estado: proyecto.estado,
    beneficiarios_meta: proyecto.beneficiarios_meta,
    responsable_id: proyecto.responsable_id,
    responsable_nombre: proyecto.responsable.nombre,
    umbrales_override: proyecto.umbrales_override,
    puede_editar_proyecto: canManageProject(proyecto, actor),
    created_at: proyecto.created_at,
    updated_at: proyecto.updated_at,
  };
}
