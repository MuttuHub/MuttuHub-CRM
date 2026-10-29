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
  /** Live medios, in detail (AJ-06 S3: "3 archivos y 1 enlace muestra los 4"), oldest first. */
  soportes: MedioView[];
};

/** An avance counts when it is not voided and, if the parameter requires it, has a live medio. */
export function avanceCuenta(anulado: boolean, requiereMedio: boolean, medios: number): boolean {
  return !anulado && (!requiereMedio || medios > 0);
}

export function toAvanceView(row: AvanceRow, requiereMedio: boolean, medios = 0, soportes: MedioView[] = []): AvanceView {
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
    soportes,
  };
}

// ---------------------------------------------------------------------------
// Medios (supports) of an avance
// ---------------------------------------------------------------------------

/** Live (not soft-deleted) medios per avance id; avances without medios are absent from the map. */
export async function contarMediosVivos(avanceIds: string[]): Promise<Map<string, number>> {
  if (avanceIds.length === 0) return new Map();
  const grouped = await db.soporteProyecto.groupBy({
    by: ["avance_id"],
    where: { avance_id: { in: avanceIds }, deleted_at: null },
    _count: { _all: true },
  });
  const counts = new Map<string, number>();
  for (const row of grouped) {
    if (row.avance_id) counts.set(row.avance_id, row._count._all);
  }
  return counts;
}

/**
 * Live medios of several avances, in detail (not just a count), oldest first — backs the
 * `soportes` field of `AvanceView` (AJ-06 T2, S3).
 */
export async function listarSoportesVivos(avanceIds: string[]): Promise<Map<string, MedioView[]>> {
  if (avanceIds.length === 0) return new Map();
  const rows = await db.soporteProyecto.findMany({
    where: { avance_id: { in: avanceIds }, deleted_at: null },
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
  });
  const grouped = new Map<string, MedioView[]>();
  for (const row of rows) {
    if (!row.avance_id) continue;
    const vistos = grouped.get(row.avance_id) ?? [];
    vistos.push(toMedioView(row));
    grouped.set(row.avance_id, vistos);
  }
  return grouped;
}

export type MedioRow = {
  id: string;
  proyecto_id: string;
  avance_id: string | null;
  nombre: string;
  storage_path: string | null;
  url_externa: string | null;
  tipo_mime: string | null;
  tamano_bytes: number | null;
  subido_por_id: string;
  created_at: Date;
};

export type MedioView = {
  id: string;
  proyecto_id: string;
  avance_id: string | null;
  nombre: string;
  tipo: "archivo" | "enlace";
  url_externa: string | null;
  tipo_mime: string | null;
  tamano_bytes: number | null;
  subido_por_id: string;
  created_at: string;
};

/** The storage key is never exposed: downloads go through the signed-URL route. */
export function toMedioView(row: MedioRow): MedioView {
  return {
    id: row.id,
    proyecto_id: row.proyecto_id,
    avance_id: row.avance_id,
    nombre: row.nombre,
    tipo: row.storage_path ? "archivo" : "enlace",
    url_externa: row.url_externa,
    tipo_mime: row.tipo_mime,
    tamano_bytes: row.tamano_bytes,
    subido_por_id: row.subido_por_id,
    created_at: row.created_at.toISOString(),
  };
}

export const AVANCE_ANULADO_MEDIO_MESSAGE = "No se pueden adjuntar medios a un avance anulado.";

/** The avance must belong to this project (404); a voided one cannot receive medios (409). */
export async function loadAvanceParaMedio(
  proyectoId: string,
  avanceId: string,
  { permitirAnulado = false }: { permitirAnulado?: boolean } = {},
): Promise<{ ok: true; value: { id: string } } | { ok: false; response: Response }> {
  const avance = await db.avanceEntregable.findFirst({
    where: { id: avanceId, proyecto_id: proyectoId },
    select: { id: true, anulado_at: true },
  });
  if (!avance) return { ok: false, response: apiError(AVANCE_NO_EXISTE, 404, "NOT_FOUND") };
  if (avance.anulado_at !== null && !permitirAnulado) {
    return { ok: false, response: apiError(AVANCE_ANULADO_MEDIO_MESSAGE, 409, "CONFLICT") };
  }
  return { ok: true, value: { id: avance.id } };
}
