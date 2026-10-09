/**
 * Client-safe helpers for the S7 import report (decision D-5): the report is
 * shown grouped by sheet and downloaded as a CSV built in the browser. No
 * `exceljs` here on purpose — this file ends up in the client bundle.
 */

/** One finding of the import report (the HTTP shape of `ErrorPlantilla`). */
export type HallazgoPlantilla = {
  regla: string
  hoja: string
  fila: number | null
  columna: string | null
  valor: string | null
  mensaje: string
}

export type ReportePlantilla = {
  errores: HallazgoPlantilla[]
  advertencias: HallazgoPlantilla[]
  resumen: Record<string, number>
  truncado: boolean
}

/** Groups findings by sheet, keeping the order in which each sheet first appears. */
export function agruparPorHoja(errores: readonly HallazgoPlantilla[]): { hoja: string; errores: HallazgoPlantilla[] }[] {
  const grupos = new Map<string, HallazgoPlantilla[]>()
  for (const error of errores) {
    const grupo = grupos.get(error.hoja)
    if (grupo) grupo.push(error)
    else grupos.set(error.hoja, [error])
  }
  return [...grupos].map(([hoja, items]) => ({ hoja, errores: items }))
}

const SEPARADOR = ";"
const SALTO = "\r\n"

/** A cell a spreadsheet would execute as a formula when the CSV is opened. */
const INICIO_FORMULA = /^[=+\-@\t\r]/

function celda(valor: string | number | null): string {
  if (valor === null) return ""
  let texto = String(valor)
  if (INICIO_FORMULA.test(texto)) texto = `'${texto}`
  return /[;"\r\n]/.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto
}

/**
 * The report as a CSV for Excel in a Spanish locale: UTF-8 BOM, `;` separator,
 * CRLF lines. Cells that start like a formula are prefixed with `'` so a crafted
 * workbook cannot turn its own error report into a formula injection.
 */
export function reporteACsv(reporte: ReportePlantilla): string {
  const filas = [
    ["Tipo", "Regla", "Hoja", "Fila", "Columna", "Valor", "Mensaje"],
    ...reporte.errores.map((e) => ["Error", e.regla, e.hoja, e.fila, e.columna, e.valor, e.mensaje]),
    ...reporte.advertencias.map((e) => ["Advertencia", e.regla, e.hoja, e.fila, e.columna, e.valor, e.mensaje]),
  ]
  return `﻿${filas.map((fila) => fila.map(celda).join(SEPARADOR)).join(SALTO)}`
}
