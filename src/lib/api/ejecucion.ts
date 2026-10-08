// Shared plumbing of the S4 technical-execution routes (avances, medios,
// measurements, beneficiaries, technical status), all mounted under
// /api/v1/projects/:id/.
//
// Order of every write: project (404) -> permission (403) -> estado (409) ->
// body (400). Execution is only possible while the project is EN_EJECUCION;
// no route moves a project there in S4 (baseline approval, S8.2, does).

import type { Usuario } from "@prisma/client";
import { apiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { canExecuteProject, canManageProjects, type ProjectMembershipActor } from "@/lib/permissions";
import { canReadProject, loadProjectScoped, projectReadActor } from "@/lib/api/projects";
import { isoDate } from "@/lib/proyectos/proyecto-general";
import type { GateResult } from "@/lib/api/estructura";

export const EJECUCION_FORBIDDEN_MESSAGE = "No tienes permisos sobre este proyecto.";
export const EJECUCION_STATE_MESSAGE = "El proyecto aún no tiene línea base aprobada.";
export const PROYECTO_NO_EXISTE = "El proyecto no existe.";
export const ENTREGABLE_NO_EXISTE = "El entregable no existe.";
export const AVANCE_NO_EXISTE = "El avance no existe.";

export type EjecucionProyecto = {
  id: string;
  estado: string;
  fecha_inicio: Date | null;
  fecha_fin: Date | null;
};

const EJECUCION_SELECT = { id: true, estado: true, fecha_inicio: true, fecha_fin: true } as const;

/** 404 -> 403 -> 409 for an execution write (create an avance, medio, measurement...). */
export async function gateEjecucionWrite(
  usuario: Usuario,
  proyectoId: string,
): Promise<GateResult<EjecucionProyecto>> {
  const scoped = await loadProjectScoped(usuario, proyectoId, EJECUCION_SELECT);
  if (!scoped) return { ok: false, response: apiError(PROYECTO_NO_EXISTE, 404, "NOT_FOUND") };

  const actor: ProjectMembershipActor = projectReadActor(usuario, scoped.es_miembro);
  if (!canExecuteProject(actor)) {
    return { ok: false, response: apiError(EJECUCION_FORBIDDEN_MESSAGE, 403, "FORBIDDEN") };
  }
  if (scoped.row.estado !== "EN_EJECUCION") {
    return { ok: false, response: apiError(EJECUCION_STATE_MESSAGE, 409, "INVALID_STATE") };
  }
  return { ok: true, value: scoped.row };
}

/** 404 -> 403 for an execution read; also returns the estado so the UI can explain an empty state. */
export async function gateEjecucionRead(
  usuario: Usuario,
  proyectoId: string,
): Promise<GateResult<EjecucionProyecto>> {
  const scoped = await loadProjectScoped(usuario, proyectoId, EJECUCION_SELECT);
  if (!scoped) return { ok: false, response: apiError(PROYECTO_NO_EXISTE, 404, "NOT_FOUND") };
  if (!canReadProject(usuario, scoped.es_miembro)) {
    return { ok: false, response: apiError(EJECUCION_FORBIDDEN_MESSAGE, 403, "FORBIDDEN") };
  }
  return { ok: true, value: scoped.row };
}

/** 404 -> 403 for a void: managers only, allowed in any estado (a mistake must stay correctable). */
export async function gateEjecucionVoid(
  usuario: Usuario,
  proyectoId: string,
): Promise<GateResult<{ id: string; estado: string }>> {
  const proyecto = await db.proyecto.findFirst({
    where: { id: proyectoId, deleted_at: null },
    select: { id: true, estado: true },
  });
  if (!proyecto) return { ok: false, response: apiError(PROYECTO_NO_EXISTE, 404, "NOT_FOUND") };
  if (!canManageProjects(usuario)) {
    return { ok: false, response: apiError(EJECUCION_FORBIDDEN_MESSAGE, 403, "FORBIDDEN") };
  }
  return { ok: true, value: proyecto };
}

// ---------------------------------------------------------------------------
// Avance projection
// ---------------------------------------------------------------------------

export type AvanceRow = {
  id: string;
  proyecto_id: string;
  entregable_id: string;
  fecha: Date;
  cantidad: { toString(): string };
  observacion: string | null;
  justificacion_exceso: string | null;
  registrado_por_id: string;
  created_at: Date;
  anulado_at: Date | null;
  anulado_por_id: string | null;
  motivo_anulacion: string | null;
};

export type AvanceView = {
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
  /** Live medios attached to the avance. */
  medios: number;
  /** True when the avance counts towards the deliverable (not voided and, when required, supported). */
  cuenta: boolean;
};

/** An avance counts when it is not voided and, if the parameter requires it, has a live medio. */
export function avanceCuenta(anulado: boolean, requiereMedio: boolean, medios: number): boolean {
  return !anulado && (!requiereMedio || medios > 0);
}

export function toAvanceView(row: AvanceRow, requiereMedio: boolean, medios = 0): AvanceView {
  return {
    id: row.id,
    proyecto_id: row.proyecto_id,
    entregable_id: row.entregable_id,
    fecha: isoDate(row.fecha),
    cantidad: row.cantidad.toString(),
    observacion: row.observacion,
    justificacion_exceso: row.justificacion_exceso,
    registrado_por_id: row.registrado_por_id,
    created_at: row.created_at.toISOString(),
    anulado_at: row.anulado_at ? row.anulado_at.toISOString() : null,
    anulado_por_id: row.anulado_por_id,
    motivo_anulacion: row.motivo_anulacion,
    medios,
    cuenta: avanceCuenta(row.anulado_at !== null, requiereMedio, medios),
  };
}
