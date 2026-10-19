// Pure rules of the "Editar datos generales" dialog (UX-3): which fields are validated, which are sent.
// In BORRADOR every general field is editable; in EN_EJECUCION only `descripcion` and the number of
// beneficiaries are, because dates and value change the baseline (they go through a modification request).
// The validators are the same ones the creation form and the API use: no rule is forked here.

import { MENSAJE_BENEFICIARIOS } from "./linea-base"
import { validarLineas } from "./proyecto-general"
import { MENSAJE_RANGO_FECHAS, rangoFechasValido } from "./rango-fechas"

/** Mirrors the server cap (`DESCRIPCION_MAX` in `src/lib/api/projects.ts`, which is server-only). */
export const DESCRIPCION_MAX = 2000

export type ModoEdicion = "BORRADOR" | "EN_EJECUCION"

export type CampoDatosGenerales =
  | "nombre"
  | "descripcion"
  | "responsable"
  | "valorTotal"
  | "fechaInicio"
  | "fechaFin"
  | "beneficiarios"
  | "lineas"
  | "municipios"

/** Form state: everything as the inputs hold it (strings), selections as ids. */
export type DatosGenerales = {
  nombre: string
  descripcion: string
  responsableId: string
  valorTotal: string
  fechaInicio: string
  fechaFin: string
  beneficiarios: string
  lineas: { id: string; principal: boolean }[]
  municipioIds: string[]
}

export type ErrorDatosGenerales = { campo: CampoDatosGenerales; mensaje: string }

function beneficiariosValidos(texto: string): boolean {
  const valor = Number(texto.trim())
  return Number.isInteger(valor) && valor > 0
}

/** First broken rule (the field to focus and the copy), or null. Fields read-only in the mode are not checked. */
export function validarDatosGenerales(datos: DatosGenerales, modo: ModoEdicion): ErrorDatosGenerales | null {
  const error = (campo: CampoDatosGenerales, mensaje: string): ErrorDatosGenerales => ({ campo, mensaje })

  if (modo === "BORRADOR") {
    if (datos.nombre.trim() === "") return error("nombre", "El nombre del proyecto es obligatorio.")
  }
  if (datos.descripcion.trim().length > DESCRIPCION_MAX) {
    return error("descripcion", `La descripción no puede superar ${DESCRIPCION_MAX} caracteres.`)
  }
  if (modo === "BORRADOR") {
    const lineas = validarLineas(datos.lineas)
    if (!lineas.ok) return error("lineas", lineas.message)
    if (datos.municipioIds.length === 0) return error("municipios", "Selecciona al menos un municipio.")
    if (datos.fechaInicio === "" || datos.fechaFin === "") {
      return error(datos.fechaInicio === "" ? "fechaInicio" : "fechaFin", "Completa las fechas de inicio y fin.")
    }
    if (!rangoFechasValido(datos.fechaInicio, datos.fechaFin)) return error("fechaFin", MENSAJE_RANGO_FECHAS)
    if (!(Number(datos.valorTotal.trim()) > 0)) return error("valorTotal", "El valor total debe ser mayor que cero.")
  }
  const beneficiarios = datos.beneficiarios.trim()
  if (modo === "EN_EJECUCION" || beneficiarios !== "") {
    if (!beneficiariosValidos(beneficiarios)) return error("beneficiarios", MENSAJE_BENEFICIARIOS)
  }
  return null
}

const mismoConjunto = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().join("\u0000") === [...b].sort().join("\u0000")

const clavesLineas = (lineas: DatosGenerales["lineas"]) =>
  lineas.map((linea) => `${linea.id}:${linea.principal ? 1 : 0}`)

export type CuerpoCambios = {
  nombre?: string
  descripcion?: string
  responsable_id?: string
  valor_total?: number
  fecha_inicio?: string
  fecha_fin?: string
  beneficiarios_meta?: number | null
  lineas?: { id: string; principal: boolean }[]
  municipio_ids?: string[]
}

/**
 * The PATCH body: only what changed. In EN_EJECUCION it can only ever carry `descripcion` and
 * `beneficiarios_meta` (the server rejects anything else). A blank description is sent as "" (the server
 * stores null); a blank beneficiaries box is sent as null (BORRADOR only: validation blocks it in execution).
 */
export function cuerpoDeCambios(inicial: DatosGenerales, actual: DatosGenerales, modo: ModoEdicion): CuerpoCambios {
  const cuerpo: CuerpoCambios = {}

  const descripcion = actual.descripcion.trim()
  if (descripcion !== inicial.descripcion.trim()) cuerpo.descripcion = descripcion

  const beneficiarios = actual.beneficiarios.trim()
  if (beneficiarios !== inicial.beneficiarios.trim()) {
    cuerpo.beneficiarios_meta = beneficiarios === "" ? null : Number(beneficiarios)
  }

  if (modo === "BORRADOR") {
    const nombre = actual.nombre.trim()
    if (nombre !== inicial.nombre.trim()) cuerpo.nombre = nombre
    if (actual.responsableId !== inicial.responsableId && actual.responsableId !== "") {
      cuerpo.responsable_id = actual.responsableId
    }
    if (actual.valorTotal.trim() !== inicial.valorTotal.trim()) cuerpo.valor_total = Number(actual.valorTotal.trim())
    if (actual.fechaInicio !== inicial.fechaInicio) cuerpo.fecha_inicio = actual.fechaInicio
    if (actual.fechaFin !== inicial.fechaFin) cuerpo.fecha_fin = actual.fechaFin
    if (!mismoConjunto(clavesLineas(actual.lineas), clavesLineas(inicial.lineas))) cuerpo.lineas = actual.lineas
    if (!mismoConjunto(actual.municipioIds, inicial.municipioIds)) cuerpo.municipio_ids = actual.municipioIds
  }
  return cuerpo
}
