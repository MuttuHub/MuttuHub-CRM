// Shared formatting and small rules of the Actividades cards (redesign T2). No React, no fetching.

import type { EstadoActividad, ProjectActivityReport } from "@/hooks/projects";

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];

export function formatNumero(value: number): string {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(value);
}

/** «25 oct» from a calendar `YYYY-MM-DD` (the year is implied by the project). */
export function fechaCorta(value: string): string {
  const [, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!month || !day) return value;
  return `${day} ${MESES_CORTOS[month - 1] ?? ""}`.trim();
}

export function esFinalizada(estado: EstadoActividad): boolean {
  return estado === "FINALIZADA" || estado === "FINALIZADA_CON_RETRASO";
}

/** Newest first: by date, then (same date) by creation — the same order the void route uses. */
export function porReciente(a: ProjectActivityReport, b: ProjectActivityReport): number {
  if (a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1;
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
  return 0;
}

/** The latest live report (never a voided one): the only one that can be voided. */
export function ultimoVigente(reportes: ProjectActivityReport[]): ProjectActivityReport | null {
  return [...reportes].filter((reporte) => reporte.anulado_at === null).sort(porReciente)[0] ?? null;
}

export const AYUDA_PROGRAMADO = "Real es lo registrado; programado es lo que debería llevar a hoy según el cronograma.";
export const AYUDA_ENTREGABLES = "Un entregable cuenta para la meta cuando tiene su soporte adjunto.";

export function ayudaTope(tope: number): string {
  return `Una actividad llega como máximo al ${formatNumero(tope)} % con avances; el ${formatNumero(100 - tope)} % restante se completa cuando se cuentan sus entregables.`;
}

export function avisoTope(tope: number): string {
  return `El avance llega como máximo al ${formatNumero(tope)} %. El ${formatNumero(100 - tope)} % restante se completa cuando se cuentan los entregables de la actividad.`;
}

/** Text link look for secondary actions, with a 44 px touch area. */
export const ENLACE_ACCION =
  "relative inline-flex min-h-11 items-center rounded-12 text-[13px] font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-8";
