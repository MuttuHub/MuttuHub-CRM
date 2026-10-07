/**
 * Pure rules for a project's general data (S2.1b) — no DB, no framework, like
 * `src/lib/permissions.ts` and `src/lib/proyectos/weeks.ts`.
 *
 * Two rules live here because they are imported by the API layer and by the
 * future project form:
 *
 * 1. `validarLineas`: a project has 1..n strategic lines and exactly one of
 *    them is the principal (REQ-CAT-03, DP-05). The missing-principal copy is
 *    the string REQ-CAT-03 quotes verbatim.
 * 2. `duracionProyecto`: the read-only `duracion_semanas` of a project, i.e.
 *    `durationWeeks` (S0.5, the RF-07 formula) with the null-when-incomplete
 *    handling the API response needs. No week arithmetic is duplicated here.
 */

import { durationWeeks, type IsoDate } from "./weeks";

export type LineaInput = { id: string; principal?: boolean };

/** Discriminated result so a caller can surface `message` as the 400 copy. */
export type ValidacionLineas = { ok: true } | { ok: false; message: string };

export const VALIDAR_LINEAS_MESSAGES = {
  empty: "Selecciona al menos una línea estratégica.",
  missingPrincipal: "Marca una línea estratégica como principal.",
  manyPrincipals: "Solo una línea estratégica puede ser la principal.",
  duplicated: "No repitas la misma línea estratégica.",
} as const;

/**
 * `Date` (or ISO string) -> `YYYY-MM-DD`, the calendar-date contract of the
 * `@db.Date` columns. `@db.Date` round-trips as UTC midnight, so slicing the
 * UTC ISO string returns the stored date regardless of the server time zone.
 */
export function isoDate(value: Date | string): IsoDate {
  const iso = value instanceof Date ? value.toISOString() : value;
  return iso.slice(0, 10);
}

/**
 * Week count of the project window, or `null` while an end date is missing
 * (a draft may not have both dates yet). Delegates to `durationWeeks`.
 */
export function duracionProyecto(
  fechaInicio: Date | string | null | undefined,
  fechaFin: Date | string | null | undefined,
): number | null {
  if (fechaInicio == null || fechaFin == null) return null;
  return durationWeeks(isoDate(fechaInicio), isoDate(fechaFin));
}

/**
 * Initial team of a project being created: the responsable is always a member
 * (ADR-09), and a `miembro_ids` entry that names them collapses into that one
 * membership. Repeated ids collapse too, in first-seen order, so the partial
 * unique index `proyecto_miembros_activo_uq` is never asked to reject a request
 * the contract considers valid.
 */
export function miembrosInicialesProyecto(
  responsableId: string,
  miembroIds: readonly string[] = [],
): string[] {
  return [...new Set([responsableId, ...miembroIds])];
}

/**
 * REQ-CAT-03: at least one line, exactly one principal. A repeated line is
 * refused here too because the `(proyecto_id, linea_id)` primary key would
 * otherwise fail the whole transaction with a raw P2002.
 */
export function validarLineas(lineas: readonly LineaInput[]): ValidacionLineas {
  if (lineas.length === 0) {
    return { ok: false, message: VALIDAR_LINEAS_MESSAGES.empty };
  }

  const ids = new Set<string>();
  for (const linea of lineas) {
    if (ids.has(linea.id)) {
      return { ok: false, message: VALIDAR_LINEAS_MESSAGES.duplicated };
    }
    ids.add(linea.id);
  }

  const principales = lineas.filter((linea) => linea.principal === true).length;
  if (principales === 0) {
    return { ok: false, message: VALIDAR_LINEAS_MESSAGES.missingPrincipal };
  }
  if (principales > 1) {
    return { ok: false, message: VALIDAR_LINEAS_MESSAGES.manyPrincipals };
  }

  return { ok: true };
}
