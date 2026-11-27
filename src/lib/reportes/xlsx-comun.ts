// Shared building blocks of the report workbooks (tag report T3, project report T9b): cell helpers, formats,
// labels and the table-sheet builder, so both files follow the same rules (no forbidden header, numbers as
// numbers, dates as real dates, totals that never drift from the rows).
import type ExcelJS from "exceljs"
import { assertSinEncabezadosProhibidos } from "@/lib/proyectos/export-xlsx"
import { fromCents, sumCents, toCents } from "@/lib/proyectos/money"

export type Celda = string | number | Date | null

export const FORMATO_DINERO = "#,##0.00"
export const FORMATO_PCT = "0.0"
export const FORMATO_FECHA = "yyyy-mm-dd"

export const ETIQUETA_ESTADO_PROYECTO: Record<string, string> = {
  PLANIFICACION: "Planificación",
  BORRADOR: "Borrador",
  EN_EJECUCION: "En ejecución",
  SUSPENDIDO: "Suspendido",
  CERRADO: "Cerrado",
  CANCELADO: "Cancelado",
}
export const ETIQUETA_TIPO_INTERACCION: Record<string, string> = {
  REUNION: "Reunión",
  CORREO: "Correo",
  LLAMADA: "Llamada",
  VISITA: "Visita",
  OTRO: "Otro",
}

export const numero = (valor: number | null | undefined): Celda => (valor === null || valor === undefined ? "" : valor)
export const dinero = (valor: string | null | undefined): Celda => (valor === null || valor === undefined ? "" : Number(valor))
/** `AAAA-MM-DD` as a real date cell (UTC midnight, so the calendar day never shifts). */
export const fecha = (valor: string | null | undefined): Celda => (valor ? new Date(`${valor}T00:00:00Z`) : "")
export const siNo = (valor: boolean) => (valor ? "Sí" : "No")
/** Sums two-decimal amounts in cents, so the total never drifts from the rows. */
export const sumaDinero = (valores: (string | number | null | undefined)[]) =>
  Number(
    fromCents(
      sumCents(
        valores
          .filter((v): v is string | number => typeof v === "string" || typeof v === "number")
          .map((v) => toCents(typeof v === "number" ? v.toFixed(2) : v)),
      ),
    ),
  )

function letraColumna(n: number): string {
  let letra = ""
  for (let i = n; i > 0; i = Math.floor((i - 1) / 26)) letra = String.fromCharCode(65 + ((i - 1) % 26)) + letra
  return letra
}

/**
 * One table sheet: bold, frozen and filtered header row, then the rows and an optional totals row. The filter
 * covers the header and the data only, so sorting never moves the totals row.
 */
export function hoja(
  wb: ExcelJS.Workbook,
  nombre: string,
  encabezados: readonly string[],
  filas: readonly Celda[][],
  opciones: { formatos?: Record<number, string>; total?: Celda[] } = {},
) {
  assertSinEncabezadosProhibidos(encabezados)
  const ws = wb.addWorksheet(nombre)
  ws.addRow([...encabezados]).font = { bold: true }
  ws.views = [{ state: "frozen", ySplit: 1 }]
  for (const fila of filas) ws.addRow(fila)
  ws.autoFilter = { from: "A1", to: `${letraColumna(encabezados.length)}${filas.length + 1}` }
  if (opciones.total) ws.addRow(opciones.total).font = { bold: true }
  for (const [col, formato] of Object.entries(opciones.formatos ?? {})) {
    ws.getColumn(Number(col)).eachCell((cell, fila) => {
      if (fila > 1) cell.numFmt = formato
    })
  }
  ws.columns.forEach((c, i) => {
    c.width = Math.max(12, Math.min(48, String(encabezados[i] ?? "").length + 4))
  })
  return ws
}
