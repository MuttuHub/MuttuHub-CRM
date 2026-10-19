/**
 * Pure "Requiere atención" list of ONE project (S14 P5, S6 RF-20..22). No DB, no framework.
 *
 * Every condition is derived from the same pure helpers the rest of the ficha uses — `calcularTecnico`
 * for activity progress (D3) and `esObservado` for the D5 readings of the ledger — so the attention
 * list cannot disagree with the numbers shown elsewhere. The SERVER owns the Spanish copy (title and
 * detail); the client only renders it and never recomputes a semáforo (D11). A source that is missing
 * simply contributes no item; this function never throws.
 */

import {
  calcularTecnico,
  type ActividadTecnicaInput,
} from "./avance"
import { vencidaSinTerminar } from "./estado-actividad"
import { esObservado, type EstadoGasto } from "./gastos"
import { formatCOP, type Cents } from "./money"
import type { MedicionInput } from "./kpis"
import type { IsoDate } from "./weeks"

/** Stable discriminator of an attention item; the UI keys its rendering by this value. */
export const ATENCION_TIPOS = [
  "alerta_retraso",
  "rubro_sobreejecucion",
  "actividad_atrasada",
  "avance_sin_soporte",
  "indicador_bajo_meta",
  "gasto_observado",
] as const

export type AtencionTipo = (typeof ATENCION_TIPOS)[number]

/** Server-owned copy per tipo; the client never writes its own header. */
export const ATENCION_TITULO: Record<AtencionTipo, string> = {
  alerta_retraso: "Posible retraso",
  rubro_sobreejecucion: "Rubro sobreejecutado",
  actividad_atrasada: "Actividad atrasada",
  avance_sin_soporte: "Avance sin soporte",
  indicador_bajo_meta: "Indicador bajo la meta",
  gasto_observado: "Gasto pendiente por revisión",
}

/**
 * One attention item. `tipo` is the stable discriminator; the optional ids are the minimal references
 * the client needs to render (or link) the row, and the server owns `titulo`/`detalle`.
 */
export type AtencionItem = {
  tipo: AtencionTipo
  titulo: string
  detalle: string
  rubro_id?: string
  actividad_id?: string
  avance_id?: string
  indicador_id?: string
  gasto_id?: string
}

export type AtencionProyecto = {
  corte: IsoDate
  medible: boolean
  items: AtencionItem[]
}

/** Activity shaped exactly like the KPI input, plus the name the copy needs. */
export type AtencionActividadInput = ActividadTecnicaInput & { nombre: string }

export type AtencionAvanceInput = {
  id: string
  entregable_id: string
  fecha: IsoDate
  tiene_soporte: boolean
}

export type AtencionIndicadorInput = {
  id: string
  nombre: string
  meta: number
  mediciones: readonly MedicionInput[]
}

export type AtencionRubroInput = {
  rubro_id: string
  codigo: string | null
  nombre: string
  asignado: Cents
  ejecutado: Cents
}

export type AtencionGastoInput = {
  id: string
  estado: EstadoGasto
  alerta_sobregasto: boolean
  datos_incompletos: boolean
  descripcion: string
}

export type AtencionInput = {
  corte: IsoDate
  /** From the project KPIs: the server's financial delay alert, never recomputed here. */
  alerta_retraso: boolean
  /** `avance_requiere_medio`: progress counts a support only while the parameter holds. */
  requiere_medio: boolean
  actividades: readonly AtencionActividadInput[]
  avances: readonly AtencionAvanceInput[]
  indicadores: readonly AtencionIndicadorInput[]
  rubros: readonly AtencionRubroInput[]
  gastos: readonly AtencionGastoInput[]
}

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 })

/** Last live measurement at or before the corte; same ordering as `cumplimientoIndicadores`. */
function ultimaMedicion(mediciones: readonly MedicionInput[], corte: IsoDate): MedicionInput | null {
  const vivas = mediciones
    .filter((m) => !m.anulado && m.fecha <= corte)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.createdAt ?? "").localeCompare(b.createdAt ?? ""))
  return vivas.length === 0 ? null : vivas[vivas.length - 1]
}

/** `2026-09-30` -> `30 sept 2026` (es-CO, calendar date read in UTC so it never shifts a day). */
function fechaLegible(iso: IsoDate): string {
  const [year, month, day] = iso.split("-").map(Number)
  if (!year || !month || !day) return iso
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
}

/** Free text goes before a colon: drop its own trailing period so it never reads "Compra.:". */
const sinPuntoFinal = (texto: string): string => texto.replace(/[.\s]+$/, "")

const etiquetaRubro = (rubro: AtencionRubroInput): string =>
  rubro.codigo ? `${rubro.codigo} ${rubro.nombre}` : rubro.nombre

function detalleGasto(gasto: AtencionGastoInput): string {
  const motivos: string[] = []
  if (gasto.alerta_sobregasto) motivos.push("supera lo asignado al rubro")
  if (gasto.datos_incompletos) motivos.push("datos del tercero incompletos")
  return `${sinPuntoFinal(gasto.descripcion)}: ${motivos.join(" y ")}.`
}

/**
 * The attention list at `corte`, ordered by rule. Pure and total: an empty input yields an empty list,
 * and a rule with no source data simply contributes nothing.
 */
export function construirAtencion(input: AtencionInput): AtencionItem[] {
  const items: AtencionItem[] = []
  const { corte } = input

  if (input.alerta_retraso) {
    items.push({
      tipo: "alerta_retraso",
      titulo: ATENCION_TITULO.alerta_retraso,
      detalle: "El gasto va por debajo de lo programado y el avance técnico está atrasado.",
    })
  }

  for (const rubro of input.rubros) {
    if (rubro.ejecutado > rubro.asignado) {
      items.push({
        tipo: "rubro_sobreejecucion",
        titulo: ATENCION_TITULO.rubro_sobreejecucion,
        detalle: `${etiquetaRubro(rubro)}: ejecutado ${formatCOP(rubro.ejecutado)} sobre ${formatCOP(rubro.asignado)} asignados.`,
        rubro_id: rubro.rubro_id,
      })
    }
  }

  const tecnico = calcularTecnico({
    corte,
    requiereMedio: input.requiere_medio,
    actividades: [...input.actividades],
  })
  const progresoDe = new Map(tecnico.actividades.map((actividad) => [actividad.id, actividad.progreso]))
  for (const actividad of input.actividades) {
    const progreso = progresoDe.get(actividad.id) ?? 0
    if (vencidaSinTerminar({ fin: actividad.fin, corte, terminada: progreso >= 1 })) {
      items.push({
        tipo: "actividad_atrasada",
        titulo: ATENCION_TITULO.actividad_atrasada,
        detalle: `${actividad.codigo} ${sinPuntoFinal(actividad.nombre)}: vencida el ${fechaLegible(actividad.fin)} con avance ${nf.format(progreso * 100)} %.`,
        actividad_id: actividad.id,
      })
    }
  }

  for (const avance of input.avances) {
    if (!avance.tiene_soporte) {
      items.push({
        tipo: "avance_sin_soporte",
        titulo: ATENCION_TITULO.avance_sin_soporte,
        detalle: `Avance del ${fechaLegible(avance.fecha)} sin soporte adjunto.`,
        avance_id: avance.id,
      })
    }
  }

  for (const indicador of input.indicadores) {
    const ultima = ultimaMedicion(indicador.mediciones, corte)
    if (ultima !== null && indicador.meta > 0 && ultima.valor < indicador.meta) {
      items.push({
        tipo: "indicador_bajo_meta",
        titulo: ATENCION_TITULO.indicador_bajo_meta,
        detalle: `${indicador.nombre}: ${nf.format(ultima.valor)} de meta ${nf.format(indicador.meta)}.`,
        indicador_id: indicador.id,
      })
    }
  }

  for (const gasto of input.gastos) {
    const observado = esObservado({
      estado: gasto.estado,
      alerta_sobregasto: gasto.alerta_sobregasto,
      datos_incompletos: gasto.datos_incompletos,
    })
    if (observado) {
      items.push({
        tipo: "gasto_observado",
        titulo: ATENCION_TITULO.gasto_observado,
        detalle: detalleGasto(gasto),
        gasto_id: gasto.id,
      })
    }
  }

  return items
}
