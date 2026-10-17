/**
 * The blank budget template in the PO's own format: one sheet, headers
 * `Rubro | Valor (COP)` and one row per rubro name, values empty. Pure and
 * Node-only (`exceljs`); `parse.ts` reads it back.
 */
import ExcelJS from "exceljs"

export const HOJA_PLANTILLA_PO = "Presupuesto"

export async function generarPlantillaPresupuestoPO(nombres: readonly string[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const hoja = workbook.addWorksheet(HOJA_PLANTILLA_PO)
  hoja.columns = [
    { header: "Rubro", key: "rubro", width: 32 },
    { header: "Valor (COP)", key: "valor", width: 20, style: { numFmt: "#,##0.00" } },
  ]
  hoja.getRow(1).font = { bold: true }
  for (const nombre of nombres) hoja.addRow({ rubro: nombre })
  return Buffer.from(await workbook.xlsx.writeBuffer())
}
