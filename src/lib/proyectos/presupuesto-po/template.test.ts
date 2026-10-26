// @vitest-environment node
// P2 — the blank template in the PO format round-trips through the P1 parser.
import { describe, expect, it } from "vitest"
import ExcelJS from "exceljs"
import { RUBROS_V2 } from "@/lib/catalogs"
import { toCents } from "../money"
import { parsePresupuestoPO } from "./parse"
import { HOJA_PLANTILLA_PO, generarPlantillaPresupuestoPO } from "./template"

const catalogo = RUBROS_V2.map((r) => ({ id: `id-${r.codigo}`, codigo: r.codigo, nombre: r.nombre }))

describe("generarPlantillaPresupuestoPO", () => {
  it("writes one sheet with the Rubro | Valor (COP) headers and one row per rubro, values empty", async () => {
    const buffer = await generarPlantillaPresupuestoPO(catalogo.map((r) => r.nombre))
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer as never)

    expect(workbook.worksheets.map((h) => h.name)).toEqual([HOJA_PLANTILLA_PO])
    const hoja = workbook.worksheets[0]
    expect([hoja.getCell("A1").value, hoja.getCell("B1").value]).toEqual(["Rubro", "Valor (COP)"])
    expect(hoja.getCell("A2").value).toBe("Personal")
    expect(hoja.getCell("A16").value).toBe("Dotación")
    expect(hoja.getCell("B2").value).toBeNull()
    expect(hoja.getCell("A17").value).toBeNull()
  })

  it("reads back through the parser: every rubro matched at $0", async () => {
    const buffer = await generarPlantillaPresupuestoPO(catalogo.map((r) => r.nombre))
    const resultado = await parsePresupuestoPO(buffer, catalogo)
    expect(resultado.erroresArchivo).toEqual([])
    expect(resultado.filas).toHaveLength(15)
    expect(resultado.resumen).toEqual({ sumaCents: toCents("0"), rubros: 15, errores: 0 })
  })
})
