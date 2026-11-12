// AJ-09: the simple "traslado entre rubros". The person only says origin, destination and amount; this
// turns it into the `detalle` of a TRASLADO request by spreading the amount over the OPEN periods of each
// rubro. Pure and exact (cents in bigint): the server (`validarModificacion`) stays the authority on every
// rule, this only builds a request that keeps each rubro's programming equal to its assigned amount.

import { construirDetalle, type CampoEditable, type DetalleModificacion } from "./modificacion-detalle"
import { formatCOP, fromCents, sumCents, toCents, type Cents } from "./money"
import type { Periodo } from "./weeks"

/** One budget line as the screen shows it: A and its programming cells (a missing period is $0). */
export type RubroTraslado = {
  codigo: string
  asignado: string
  celdas: readonly { periodo: Periodo; valor: string }[]
}

type TrasladoSimpleErrorCodigo =
  | "VALOR_INVALIDO"
  | "MISMO_RUBRO"
  | "RUBRO_INEXISTENTE"
  | "SIN_PERIODOS_ABIERTOS"
  | "ORIGEN_INSUFICIENTE"

type TrasladoSimpleResultado =
  | { ok: true; detalle: DetalleModificacion[] }
  | { ok: false; error: { codigo: TrasladoSimpleErrorCodigo; mensaje: string } }

const ZERO = BigInt(0)

/**
 * The periods a traslado may still change: the current one and the later ones. The complement of the
 * `PERIODO_PASADO` rule of `validarModificacion` (`periodo < periodoActual` is elapsed), with the same
 * `periodoActual` the server uses: `periodOf(todayInBogota())`.
 */
export function periodosAbiertos(periodos: readonly Periodo[], periodoActual: Periodo): Periodo[] {
  return periodos.filter((periodo) => !(periodo < periodoActual))
}

/**
 * `valor` split in proportion to `pesos` (floored to the cent). The cents the rounding leaves go to the
 * last weighted position; with `tope`, no share may exceed its own weight, so what does not fit there
 * moves to the previous weighted position. Needs a positive total weight (and `valor` <= it with `tope`).
 */
function repartir(valor: Cents, pesos: readonly Cents[], tope: boolean): Cents[] {
  const total = sumCents(pesos)
  const partes = pesos.map((peso) => (valor * peso) / total)
  let resto = valor - sumCents(partes)
  for (let i = pesos.length - 1; i >= 0 && resto > ZERO; i -= 1) {
    if (pesos[i]! === ZERO) continue
    const cabe = tope ? pesos[i]! - partes[i]! : resto
    const extra = cabe < resto ? cabe : resto
    partes[i]! += extra
    resto -= extra
  }
  return partes
}

const fallo = (codigo: TrasladoSimpleErrorCodigo, mensaje: string): TrasladoSimpleResultado => ({
  ok: false,
  error: { codigo, mensaje },
})

/**
 * The `detalle` of the TRASLADO that moves `valor` from `origen` to `destino`:
 * - A: origin minus the amount, destination plus the amount.
 * - Origin programming: lowered in its open periods in proportion to what each has programmed.
 * - Destination programming: raised in its open periods in the same way; with nothing programmed there,
 *   the whole amount goes to the first open period (the current one while the project is running).
 * Elapsed periods are never part of the detalle. The origin must have the amount programmed in open
 * periods; otherwise there is no way to keep its programming equal to A and the request is not built.
 */
export function construirTrasladoSimple(input: {
  lineas: readonly RubroTraslado[]
  /** From `periodosAbiertos`, in calendar order. */
  periodosAbiertos: readonly Periodo[]
  origen: string
  destino: string
  valor: Cents
}): TrasladoSimpleResultado {
  const { lineas, periodosAbiertos: abiertos, valor } = input
  if (valor <= ZERO) return fallo("VALOR_INVALIDO", "El valor del traslado debe ser mayor que cero.")
  if (input.origen === input.destino) {
    return fallo("MISMO_RUBRO", "El rubro de destino debe ser distinto del rubro de origen.")
  }
  const origen = lineas.find((linea) => linea.codigo === input.origen)
  const destino = lineas.find((linea) => linea.codigo === input.destino)
  if (!origen || !destino) {
    const ausente = origen ? input.destino : input.origen
    return fallo("RUBRO_INEXISTENTE", `El rubro «${ausente}» no está en el presupuesto del proyecto.`)
  }
  if (abiertos.length === 0) {
    return fallo("SIN_PERIODOS_ABIERTOS", "El proyecto ya no tiene periodos abiertos para programar el traslado.")
  }

  const celda = (linea: RubroTraslado, periodo: Periodo) =>
    linea.celdas.find((c) => c.periodo === periodo)?.valor ?? "0.00"
  const programado = (linea: RubroTraslado) => abiertos.map((periodo) => toCents(celda(linea, periodo)))

  const pesosOrigen = programado(origen)
  const disponible = sumCents(pesosOrigen)
  if (disponible < valor || toCents(origen.asignado) < valor) {
    return fallo(
      "ORIGEN_INSUFICIENTE",
      `El rubro «${origen.codigo}» solo tiene ${formatCOP(disponible)} programados desde el periodo actual: no se pueden trasladar ${formatCOP(valor)}.`,
    )
  }
  const bajas = repartir(valor, pesosOrigen, true)

  const pesosDestino = programado(destino)
  const altas =
    sumCents(pesosDestino) > ZERO
      ? repartir(valor, pesosDestino, false)
      : abiertos.map((_, indice) => (indice === 0 ? valor : ZERO))

  const campos = (linea: RubroTraslado, signo: 1 | -1, partes: readonly Cents[]): CampoEditable[] => {
    const mover = (antes: string, parte: Cents) => fromCents(toCents(antes) + (signo === 1 ? parte : -parte))
    return [
      { elemento: "presupuesto", clave: linea.codigo, campo: "asignado", antes: linea.asignado, valor: mover(linea.asignado, valor) },
      ...abiertos.map((periodo, indice): CampoEditable => {
        const antes = celda(linea, periodo)
        return { elemento: "programacion", clave: `${linea.codigo}|${periodo}`, campo: "valor", antes, valor: mover(antes, partes[indice]!) }
      }),
    ]
  }

  // `construirDetalle` keeps only what really changes (a cell with a $0 share is not part of the request).
  return { ok: true, detalle: construirDetalle("TRASLADO", [...campos(origen, -1, bajas), ...campos(destino, 1, altas)]) }
}
