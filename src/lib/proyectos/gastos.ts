/**
 * Pure expense rules for the v2 projects module (S6, RF-20..22, RF-25, RNF-03).
 * No DB, no framework. Overspend math lives in `ficha-financiera.ts`
 * (`validadoAcumulado`, `excederiaAsignado`) and is intentionally not repeated here.
 */

import { periodOf, type IsoDate, type Periodo } from "./weeks"

export type TipoIdentificacion = "NIT" | "CC" | "CE"
export type EstadoGasto = "REGISTRADO" | "VALIDADO" | "RECHAZADO" | "ANULADO"
export type AccionGasto = "VALIDAR" | "RECHAZAR" | "ANULAR" | "CORREGIR"

/**
 * Normalized third-party identification used only for the duplicate lookup (RF-21).
 * NIT drops a trailing `-D` check digit; every type keeps alphanumerics only, uppercased.
 * Blank or missing input returns null. The type is not part of the key (map section 9, default b).
 */
export function normalizarIdentificacion(
  tipo: TipoIdentificacion | null | undefined,
  numero: string | null | undefined,
): string | null {
  if (numero == null) return null
  let text = numero.trim().toUpperCase()
  if (tipo === "NIT") {
    const withCheckDigit = /^(.*?)\s*-\s*\d$/.exec(text)
    if (withCheckDigit) text = withCheckDigit[1]
  }
  const norm = text.replace(/[^A-Z0-9]/g, "")
  return norm === "" ? null : norm
}

/** Document number key: uppercase, no whitespace or `- . _ /`; leading zeros are significant. */
export function normalizarNumeroDocumento(numero: string): string {
  return numero.toUpperCase().replace(/[\s\-._/]/g, "")
}

/** The period of an expense defaults to the month of its document date. */
export function periodoPorDefecto(fecha: IsoDate): Periodo {
  return periodOf(fecha)
}

export function periodoEnProyecto(periodo: Periodo, periodos: readonly Periodo[]): boolean {
  return periodos.includes(periodo)
}

/** Derived, never stored: validation needs both the type and the number of the third party. */
export function datosIncompletos(input: {
  tercero_tipo_id: string | null
  tercero_numero_id: string | null
}): boolean {
  return input.tercero_tipo_id == null || input.tercero_numero_id == null
}

const TRANSICIONES: Record<EstadoGasto, Partial<Record<AccionGasto, EstadoGasto>>> = {
  REGISTRADO: { VALIDAR: "VALIDADO", RECHAZAR: "RECHAZADO" },
  RECHAZADO: { CORREGIR: "REGISTRADO" },
  VALIDADO: { ANULAR: "ANULADO" },
  ANULADO: {},
}

/** Next estado of the machine, or null when the action is not allowed from `estado`. */
export function puedeTransicionar(estado: EstadoGasto, accion: AccionGasto): EstadoGasto | null {
  return TRANSICIONES[estado][accion] ?? null
}

type DuplicadoKey = {
  tercero_id_norm: string | null
  numero_documento_norm: string
  estado: EstadoGasto
}

const ESTADOS_VIVOS: readonly EstadoGasto[] = ["REGISTRADO", "VALIDADO"]

/** Same normalized id and document number, both live (REGISTRADO or VALIDADO). Never blocks. */
export function esDuplicado(a: DuplicadoKey, b: DuplicadoKey): boolean {
  if (a.tercero_id_norm == null || b.tercero_id_norm == null) return false
  if (!ESTADOS_VIVOS.includes(a.estado) || !ESTADOS_VIVOS.includes(b.estado)) return false
  return a.tercero_id_norm === b.tercero_id_norm && a.numero_documento_norm === b.numero_documento_norm
}

const CAMPOS_RESTRINGIDOS = ["tercero_numero_id", "tercero_id_norm", "soportes"] as const

/** RNF-03/RNF-04: drops the third-party number and supports unless the actor may view supports. */
export function redactarGasto<T extends object>(
  view: T,
  opts: { puedeVerSoportes: boolean },
): Partial<T> {
  if (opts.puedeVerSoportes) return view
  const out = { ...view } as Record<string, unknown>
  for (const campo of CAMPOS_RESTRINGIDOS) delete out[campo]
  return out as Partial<T>
}
