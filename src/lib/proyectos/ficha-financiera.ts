/**
 * Pure financial ficha math for the v2 projects module (S5, RF-23/RF-24).
 * No DB, no framework. Amounts are COP cents in bigint (see `money.ts`).
 *
 * A = assigned, P = programmed (cumulative up to the corte), E = validated
 * expenses (cumulative up to the corte). A period is `"AAAA-MM"`, so a string
 * comparison is chronological.
 */

import {
  formatCOP,
  percentTenths,
  sumCents,
  toleranceThreshold,
  type Cents,
} from "./money"
import { colorFinancieroV2, type ColorSemaforo } from "./semaforo-v2"
import type { Periodo } from "./weeks"

export type GastoEstado = "REGISTRADO" | "VALIDADO" | "RECHAZADO" | "ANULADO"
export type GastoInput = { periodo: Periodo; valor: Cents; estado: GastoEstado }
export type CeldaInput = { periodo: Periodo; valor: Cents }

export type FichaRubroInput = {
  rubroId: string
  /** Null for legacy suspended rubros without a code. */
  codigo: string | null
  nombre: string
  asignado: Cents
  programacion: CeldaInput[]
  gastos: GastoInput[]
}

export type FichaRow = {
  /** Null on the total row. */
  rubroId: string | null
  codigo: string | null
  nombre: string
  asignado: Cents
  programado: Cents
  ejecutado: Cents
  /** E - P. */
  diferencia: Cents
  /** E/P in tenths of a percent; null when P = 0. */
  epTenths: bigint | null
  /** E/A in tenths of a percent; null when A = 0. */
  eaTenths: bigint | null
  /** P * (1 + tolerance), the yellow/red boundary. */
  umbralRojo: Cents
  color: ColorSemaforo
}

export type Ficha = { corte: Periodo; rubros: FichaRow[]; total: FichaRow }

function buildRow(
  base: { rubroId: string | null; codigo: string | null; nombre: string },
  A: Cents,
  P: Cents,
  E: Cents,
  toleranciaBp: bigint,
): FichaRow {
  return {
    ...base,
    asignado: A,
    programado: P,
    ejecutado: E,
    diferencia: E - P,
    epTenths: percentTenths(E, P),
    eaTenths: percentTenths(E, A),
    umbralRojo: toleranceThreshold(P, toleranciaBp),
    color: colorFinancieroV2({ A, P, E }, toleranciaBp),
  }
}

/** Sum of VALIDADO expenses (any period) of one rubro. */
export function validadoAcumulado(gastos: readonly GastoInput[]): Cents {
  return sumCents(gastos.filter((g) => g.estado === "VALIDADO").map((g) => g.valor))
}

/** True when validating `nuevo` would push the validated total strictly above A. */
export function excederiaAsignado(input: { asignado: Cents; validado: Cents; nuevo: Cents }): boolean {
  return input.validado + input.nuevo > input.asignado
}

/** Σ programmed cells − A; informational in BORRADOR, a baseline precondition later. */
export function controlProgramacion(asignado: Cents, celdas: readonly Cents[]): Cents {
  return sumCents(celdas) - asignado
}

export function computeFicha(input: {
  rubros: readonly FichaRubroInput[]
  corte: Periodo
  toleranciaBp: bigint
}): Ficha {
  const { corte, toleranciaBp } = input
  const parts = input.rubros.map((rubro) => ({
    rubro,
    A: rubro.asignado,
    P: sumCents(rubro.programacion.filter((c) => c.periodo <= corte).map((c) => c.valor)),
    E: sumCents(
      rubro.gastos.filter((g) => g.estado === "VALIDADO" && g.periodo <= corte).map((g) => g.valor),
    ),
  }))

  const rubros = parts.map(({ rubro, A, P, E }) =>
    buildRow({ rubroId: rubro.rubroId, codigo: rubro.codigo, nombre: rubro.nombre }, A, P, E, toleranciaBp),
  )
  // Total: the same formulas applied to the sums (not the worst of the rows).
  const total = buildRow(
    { rubroId: null, codigo: null, nombre: "Total" },
    sumCents(parts.map((p) => p.A)),
    sumCents(parts.map((p) => p.P)),
    sumCents(parts.map((p) => p.E)),
    toleranciaBp,
  )
  return { corte, rubros, total }
}

export type PrecondicionCodigo =
  | "SUMA_DISTINTA_VALOR_TOTAL"
  | "CONTROL_PROGRAMACION"
  | "PROGRAMACION_PENDIENTE"
  | "RUBRO_SUSPENDIDO_CON_ASIGNADO"
  | "PERIODO_FUERA_DE_RANGO"
  // S8 baseline structure items (REQ-VER-01), composed in `linea-base.ts`.
  | "SIN_VALOR_TOTAL"
  | "SIN_FECHAS"
  | "SIN_OBJETIVOS"
  | "OBJETIVO_SIN_ACTIVIDADES"
  | "ACTIVIDAD_SIN_ENTREGABLES"
  | "META_BENEFICIARIOS_INVALIDA"

export type PrecondicionFalla = { codigo: PrecondicionCodigo; mensaje: string; rubroId?: string }

/**
 * Failures that block the baseline (S8.2). BORRADOR editing stays free-form; this
 * is the list the baseline returns as 409 `precondiciones`.
 */
export function precondicionesPresupuesto(input: {
  valorTotal: Cents | null
  lineas: readonly { rubroId: string; nombre: string; asignado: Cents; activo: boolean }[]
  programacion: readonly { rubroId: string; periodo: Periodo; valor: Cents }[]
  periodosProyecto: readonly Periodo[]
}): PrecondicionFalla[] {
  const fallas: PrecondicionFalla[] = []
  const suma = sumCents(input.lineas.map((l) => l.asignado))

  if (input.valorTotal !== null && suma !== input.valorTotal) {
    fallas.push({
      codigo: "SUMA_DISTINTA_VALOR_TOTAL",
      mensaje: `La suma del presupuesto (${formatCOP(suma)}) no es igual al valor total del proyecto (${formatCOP(input.valorTotal)}); diferencia ${formatCOP(suma - input.valorTotal)}.`,
    })
  }

  const ZERO = BigInt(0)
  if (!input.programacion.some((c) => c.valor > ZERO)) {
    fallas.push({ codigo: "PROGRAMACION_PENDIENTE", mensaje: "Programación pendiente." })
  }

  for (const linea of input.lineas) {
    const celdas = input.programacion.filter((c) => c.rubroId === linea.rubroId).map((c) => c.valor)
    const control = controlProgramacion(linea.asignado, celdas)
    if (control !== ZERO) {
      fallas.push({
        codigo: "CONTROL_PROGRAMACION",
        rubroId: linea.rubroId,
        mensaje: `La programación del rubro ${linea.nombre} no coincide con lo asignado; control ${formatCOP(control)}.`,
      })
    }
    if (!linea.activo && linea.asignado > ZERO) {
      fallas.push({
        codigo: "RUBRO_SUSPENDIDO_CON_ASIGNADO",
        rubroId: linea.rubroId,
        mensaje: `El rubro suspendido ${linea.nombre} tiene un monto asignado pendiente de reasignación.`,
      })
    }
  }

  const permitidos = new Set(input.periodosProyecto)
  for (const celda of input.programacion) {
    if (!permitidos.has(celda.periodo)) {
      fallas.push({
        codigo: "PERIODO_FUERA_DE_RANGO",
        rubroId: celda.rubroId,
        mensaje: `El periodo ${celda.periodo} está fuera del rango del proyecto.`,
      })
    }
  }
  return fallas
}
