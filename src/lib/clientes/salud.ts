/**
 * Client health score — pure math for the v7 "Salud" section (C5).
 *
 * No DB, no framework. The three components mirror the prototype's own
 * composition (Contacto 40 / Compromisos 35 / Proyectos 25); a component without
 * data is dropped and the remaining weights are renormalised, so "no projects"
 * is not the same as "bad health". Every sub-score is rounded to one decimal so
 * the API contract is stable; the composed score is rounded the same way.
 *
 * `subscoreContacto` is deliberately ALWAYS available (0 when the client has no
 * bitácora entry), per the decided formula: a client you never contacted is bad
 * health, not missing data. `puntajeSalud`/`clasificarBucket`/`motivoSalud` are
 * written generically so the "no component available" path still yields
 * `null` + `SIN_DATOS` (never `RIESGO`) if that ever changes.
 */

import type { ColorSemaforo } from "@/lib/proyectos/semaforo-v2"

/* ── Weights and thresholds (the prototype's own composition) ──────────── */

export const PESO_CONTACTO = 40
export const PESO_COMPROMISOS = 35
export const PESO_PROYECTOS = 25

/** Days since the last interaction at or below which the contact score is 100. */
export const CONTACTO_DIAS_OPTIMO = 15
/** Days after which the contact score is 0. */
export const CONTACTO_DIAS_LIMITE = 90

/** Verdict thresholds: >= 75 SANA, 45..74.99 ATENCION, < 45 RIESGO. */
export const UMBRAL_SANA = 75
export const UMBRAL_ATENCION = 45

/** Score value of each live-project semáforo color. */
export const VALOR_SEMAFORO: Record<ColorSemaforo, number> = {
  verde: 100,
  amarillo: 60,
  rojo: 20,
}

export const MOTIVO_SIN_RIESGO = "Sin señales de riesgo"
export const MOTIVO_SIN_DATOS = "Sin datos suficientes"

/* ── Types ─────────────────────────────────────────────────────────────── */

export type SaludBucket = "SANA" | "ATENCION" | "RIESGO" | "SIN_DATOS"

/** Counts of the client's open, dated tasks split by the shared alert buckets. */
export type CompromisosConteo = {
  vencidos: number
  hoy: number
  proximos3: number
}

export type SaludSubscores = {
  contacto: number | null
  compromisos: number | null
  proyectos: number | null
}

export type SaludInput = {
  /** Days since the most recent `BitacoraEntrada`; null when there are none. */
  diasUltimaInteraccion: number | null
  /** Alert-bucket counts for the client; null when it has no open dated task. */
  compromisos: CompromisosConteo | null
  /** Semáforos of the client's live projects whose color is derivable. */
  proyectosColores: readonly ColorSemaforo[]
}

export type SaludScore = {
  score: number | null
  bucket: SaludBucket
  subscores: SaludSubscores
  motivo: string
}

/* ── Components ────────────────────────────────────────────────────────── */

const round1 = (value: number): number => Math.round(value * 10) / 10
const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

/**
 * Contact score: 100 up to `CONTACTO_DIAS_OPTIMO` days, 0 from
 * `CONTACTO_DIAS_LIMITE` on, linear in between. No entries (null) is 0 — an
 * available, worst-case signal, never "unavailable".
 */
export function subscoreContacto(dias: number | null): number {
  if (dias === null) return 0
  if (dias <= CONTACTO_DIAS_OPTIMO) return 100
  if (dias >= CONTACTO_DIAS_LIMITE) return 0
  return round1(clamp((100 * (CONTACTO_DIAS_LIMITE - dias)) / 75, 0, 100))
}

/**
 * Commitments score: `100 - 20·vencidos - 10·hoy - 5·proximos3`, floored at 0.
 * A client with no open dated task in the alert window has this component
 * `null` (unavailable) so its absent commitments neither help nor hurt.
 */
export function subscoreCompromisos(conteo: CompromisosConteo | null): number | null {
  if (conteo === null) return null
  const penalizacion =
    20 * conteo.vencidos + 10 * conteo.hoy + 5 * conteo.proximos3
  return Math.max(0, 100 - penalizacion)
}

/**
 * Projects score: mean of the live projects' semáforo values
 * (VERDE 100 / AMARILLO 60 / ROJO 20). No live project with a derivable color
 * is "unavailable" (null), not 0.
 */
export function subscoreProyectos(colores: readonly ColorSemaforo[]): number | null {
  if (colores.length === 0) return null
  const total = colores.reduce((sum, color) => sum + VALOR_SEMAFORO[color], 0)
  return round1(total / colores.length)
}

/* ── Composition ───────────────────────────────────────────────────────── */

const COMPONENTES: readonly { key: keyof SaludSubscores; peso: number }[] = [
  { key: "contacto", peso: PESO_CONTACTO },
  { key: "compromisos", peso: PESO_COMPROMISOS },
  { key: "proyectos", peso: PESO_PROYECTOS },
]

/**
 * Renormalised weighted mean over the AVAILABLE components only:
 * `Σ(w_i · s_i) / Σ(w_i)`. Null when none is available. Rounded to one decimal.
 */
export function puntajeSalud(subscores: SaludSubscores): number | null {
  let pesoTotal = 0
  let acumulado = 0
  for (const { key, peso } of COMPONENTES) {
    const sub = subscores[key]
    if (sub === null) continue
    pesoTotal += peso
    acumulado += peso * sub
  }
  if (pesoTotal === 0) return null
  return round1(acumulado / pesoTotal)
}

export function clasificarBucket(score: number | null): SaludBucket {
  if (score === null) return "SIN_DATOS"
  if (score >= UMBRAL_SANA) return "SANA"
  if (score >= UMBRAL_ATENCION) return "ATENCION"
  return "RIESGO"
}

const plural = (n: number, singular: string, pluralForm: string): string =>
  `${n} ${n === 1 ? singular : pluralForm}`

function motivoCompromisos(conteo: CompromisosConteo): string {
  if (conteo.vencidos > 0) {
    return plural(conteo.vencidos, "compromiso vencido", "compromisos vencidos")
  }
  if (conteo.hoy > 0) return plural(conteo.hoy, "compromiso para hoy", "compromisos para hoy")
  return plural(conteo.proximos3, "compromiso por vencer", "compromisos por vencer")
}

/**
 * One short sentence naming the worst signal, most actionable first: overdue
 * commitments, then red projects, then a cold contact, then a weak commitments
 * component (due today / upcoming), then yellow projects. When none of those
 * risks is present there is nothing to call out.
 */
export function motivoSalud(
  input: SaludInput,
  subscores: SaludSubscores,
  score: number | null,
): string {
  if (score === null) return MOTIVO_SIN_DATOS

  if (input.compromisos && input.compromisos.vencidos > 0) {
    return motivoCompromisos(input.compromisos)
  }
  if (input.proyectosColores.includes("rojo")) return "Proyectos en rojo"
  if (subscores.contacto !== null && subscores.contacto < UMBRAL_SANA) {
    if (input.diasUltimaInteraccion === null) return "Sin interacciones registradas"
    return `Sin interacciones hace ${input.diasUltimaInteraccion} días`
  }
  if (
    input.compromisos &&
    subscores.compromisos !== null &&
    subscores.compromisos < UMBRAL_SANA
  ) {
    return motivoCompromisos(input.compromisos)
  }
  if (input.proyectosColores.includes("amarillo")) return "Proyectos en amarillo"

  return MOTIVO_SIN_RIESGO
}

/** Full read: sub-scores, renormalised score, bucket and `motivo`. */
export function calcularSalud(input: SaludInput): SaludScore {
  const subscores: SaludSubscores = {
    contacto: subscoreContacto(input.diasUltimaInteraccion),
    compromisos: subscoreCompromisos(input.compromisos),
    proyectos: subscoreProyectos(input.proyectosColores),
  }
  const score = puntajeSalud(subscores)
  return {
    score,
    bucket: clasificarBucket(score),
    subscores,
    motivo: motivoSalud(input, subscores, score),
  }
}
