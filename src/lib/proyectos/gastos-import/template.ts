/**
 * The blank expenses template: one sheet with the headers `parse.ts` reads (no example row, so an
 * untouched template reads as "no rows") and a second sheet listing the rubros that take expenses.
 * Pure and Node-only (`exceljs`).
 */
import ExcelJS from "exceljs"
import { ENCABEZADOS_GASTOS, MAX_FILAS_GASTOS } from "./parse"

export const HOJA_PLANTILLA_GASTOS = "Gastos"
export const HOJA_RUBROS_GASTOS = "Rubros"

const ANCHOS = [28, 20, 32, 28, 22, 24, 22, 40, 18, 12]
const TIPOS_SOPORTE = '"Factura de proveedor,Cuenta de cobro persona natural,Otro"'
const TIPOS_ID = '"NIT,CC,CE"'

export async function generarPlantillaGastos(rubros: readonly string[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const hoja = workbook.addWorksheet(HOJA_PLANTILLA_GASTOS)
  hoja.columns = ENCABEZADOS_GASTOS.map((header, i) => ({ header, key: String(i), width: ANCHOS[i] }))
  hoja.getRow(1).font = { bold: true }
  hoja.getColumn(2).numFmt = "yyyy-mm-dd"
  hoja.getColumn(9).numFmt = "#,##0.00"

  const lista = workbook.addWorksheet(HOJA_RUBROS_GASTOS)
  lista.columns = [{ header: "Rubro", key: "rubro", width: 40 }]
  lista.getRow(1).font = { bold: true }
  for (const nombre of rubros) lista.addRow({ rubro: nombre })

  // Dropdowns (a convenience: the parser accepts typed text too).
  for (let fila = 2; fila <= MAX_FILAS_GASTOS + 1; fila++) {
    if (rubros.length > 0) {
      hoja.getCell(fila, 1).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`${HOJA_RUBROS_GASTOS}!$A$2:$A$${rubros.length + 1}`],
      }
    }
    hoja.getCell(fila, 3).dataValidation = { type: "list", allowBlank: true, formulae: [TIPOS_SOPORTE] }
    hoja.getCell(fila, 5).dataValidation = { type: "list", allowBlank: true, formulae: [TIPOS_ID] }
  }
  return Buffer.from(await workbook.xlsx.writeBuffer())
}
