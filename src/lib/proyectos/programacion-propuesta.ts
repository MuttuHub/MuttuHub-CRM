// T13 (S7, EV-03): the monthly programming the system proposes for one budget line.
//
// «Al importar, el sistema propone la programación mensual de cada línea (actividad + rubro) en proporción a los
// días que la actividad ocupa en cada mes. El centavo que sobre por redondeo se suma al último mes.» The PO example
// is in whole pesos ($4.642.857 / $5.357.143), so each month gets whole pesos and the remainder — the pesos and
// cents the rounding leaves — goes to the last month. «En las transversales la propuesta sale pareja por mes.»

import { sumCents, type Cents } from "./money"
import type { PlanImportacion } from "./plantilla/mapear"
import { activityDates, daysBetweenInclusive, projectPeriods, type IsoDate, type Periodo } from "./weeks"

const ZERO = BigInt(0)
const UN_PESO = BigInt(100)

export type CeldaPropuesta = { periodo: Periodo; valor: Cents }

/** Last day of `periodo` (`YYYY-MM`). */
function finDeMes(periodo: Periodo): IsoDate {
  const [anio, mes] = periodo.split("-").map(Number) as [number, number]
  return new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10)
}

const max = (a: IsoDate, b: IsoDate) => (a > b ? a : b)
const min = (a: IsoDate, b: IsoDate) => (a < b ? a : b)

/**
 * The proposed cells of a line worth `valor`, one per month the activity occupies inside the project dates, in
 * calendar order. They always sum `valor`. A zero line, or an activity entirely outside the project, gets none.
 */
export function proponerProgramacion(input: {
  valor: Cents
  actividad: { inicio: IsoDate; fin: IsoDate }
  proyecto: { inicio: IsoDate; fin: IsoDate }
  transversal: boolean
}): CeldaPropuesta[] {
  const inicio = max(input.actividad.inicio, input.proyecto.inicio)
  const fin = min(input.actividad.fin, input.proyecto.fin)
  if (input.valor <= ZERO || fin < inicio) return []

  const periodos = projectPeriods(inicio, fin)
  const pesos = periodos.map((periodo) =>
    input.transversal
      ? BigInt(1)
      : BigInt(daysBetweenInclusive(max(inicio, `${periodo}-01`), min(fin, finDeMes(periodo)))),
  )
  const total = sumCents(pesos)

  const valores = pesos.map((peso) => ((input.valor * peso) / total / UN_PESO) * UN_PESO)
  valores[valores.length - 1]! += input.valor - sumCents(valores)

  return periodos.map((periodo, i) => ({ periodo, valor: valores[i]! })).filter((c) => c.valor > ZERO)
}


/**
 * The proposal for every budget line of an import plan, keyed `actividadCodigo|rubroCodigo`. A Normal activity is
 * proposed by days; a Transversal one (the template's «Tipo» column, T13.8) evenly by month.
 */
export function programacionDelPlan(plan: Pick<PlanImportacion, "proyecto" | "actividades" | "presupuesto">): Map<string, CeldaPropuesta[]> {
  const proyecto = { inicio: plan.proyecto.fechaInicio, fin: plan.proyecto.fechaFin }
  const actividades = new Map(plan.actividades.map((a) => [a.codigo, a]))
  const propuesta = new Map<string, CeldaPropuesta[]>()
  for (const linea of plan.presupuesto) {
    const actividad = actividades.get(linea.actividadCodigo)
    if (!actividad) continue
    propuesta.set(
      `${linea.actividadCodigo}|${linea.rubroCodigo}`,
      proponerProgramacion({
        valor: linea.cents,
        actividad: activityDates(proyecto.inicio, actividad.semanaInicio, actividad.semanaFin),
        proyecto,
        transversal: actividad.tipo === "TRANSVERSAL",
      }),
    )
  }
  return propuesta
}
