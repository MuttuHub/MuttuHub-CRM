// REQ-VER-01: everything a project must satisfy before its baseline can be approved.
// Composes the budget preconditions (S5) with the structure and header items. Pure: the
// caller loads the rows (under the project lock) and the route answers 409 with the list.

import { precondicionesPresupuesto, type PrecondicionFalla } from "./ficha-financiera"
import type { Cents } from "./money"
import { projectPeriods, type Periodo } from "./weeks"

export type EntradaLineaBase = {
  valorTotal: Cents | null
  fechaInicio: string | null
  fechaFin: string | null
  beneficiariosMeta: number | null
  objetivos: readonly { codigo: string }[]
  actividades: readonly { codigo: string; objetivoCodigo: string }[]
  entregables: readonly { codigo: string; actividadCodigo: string }[]
  lineas: readonly { rubroId: string; nombre: string; asignado: Cents; activo: boolean }[]
  programacion: readonly { rubroId: string; periodo: Periodo; valor: Cents }[]
}

function periodosDelProyecto(inicio: string | null, fin: string | null): Periodo[] | null {
  if (!inicio || !fin || fin < inicio) return null
  return projectPeriods(inicio, fin)
}

/** Every failed precondition (not just the first), structure items before budget ones. */
export function precondicionesLineaBase(entrada: EntradaLineaBase): PrecondicionFalla[] {
  const fallas: PrecondicionFalla[] = []
  const ZERO = BigInt(0)

  if (entrada.valorTotal === null || entrada.valorTotal <= ZERO) {
    fallas.push({ codigo: "SIN_VALOR_TOTAL", mensaje: "El proyecto no tiene un valor total mayor que cero." })
  }

  const periodos = periodosDelProyecto(entrada.fechaInicio, entrada.fechaFin)
  if (periodos === null) {
    fallas.push({ codigo: "SIN_FECHAS", mensaje: "El proyecto debe tener fechas de inicio y fin válidas." })
  }

  if (entrada.beneficiariosMeta === null || entrada.beneficiariosMeta <= 0) {
    fallas.push({
      codigo: "META_BENEFICIARIOS_INVALIDA",
      mensaje: "El número de beneficiarios debe ser mayor que cero.",
    })
  }

  if (entrada.objetivos.length === 0) {
    fallas.push({ codigo: "SIN_OBJETIVOS", mensaje: "El proyecto no tiene objetivos." })
  }
  for (const objetivo of entrada.objetivos) {
    if (!entrada.actividades.some((a) => a.objetivoCodigo === objetivo.codigo)) {
      fallas.push({
        codigo: "OBJETIVO_SIN_ACTIVIDADES",
        mensaje: `El objetivo ${objetivo.codigo} no tiene actividades.`,
      })
    }
  }
  for (const actividad of entrada.actividades) {
    if (!entrada.entregables.some((e) => e.actividadCodigo === actividad.codigo)) {
      fallas.push({
        codigo: "ACTIVIDAD_SIN_ENTREGABLES",
        mensaje: `La actividad ${actividad.codigo} no tiene entregables.`,
      })
    }
  }

  const presupuesto = precondicionesPresupuesto({
    valorTotal: entrada.valorTotal,
    lineas: entrada.lineas,
    programacion: entrada.programacion,
    periodosProyecto: periodos ?? [],
  })
  // Without valid dates there is no range to check against: SIN_FECHAS already says it.
  return [...fallas, ...presupuesto.filter((f) => periodos !== null || f.codigo !== "PERIODO_FUERA_DE_RANGO")]
}
