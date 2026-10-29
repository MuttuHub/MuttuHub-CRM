// @vitest-environment node
// B8 — the blank expenses template: the headers `parse.ts` reads, a list of the rubros that take
// expenses, and nothing else (no example row, so an untouched template reads as "no rows").
import { describe, expect, it } from "vitest"
import ExcelJS from "exceljs"
import { ENCABEZADOS_GASTOS, SIN_FILAS_GASTOS, parseGastosImport } from "./parse"
import { HOJA_PLANTILLA_GASTOS, HOJA_RUBROS_GASTOS, generarPlantillaGastos } from "./template"

async function cargar(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as never)
  return workbook
}

describe("generarPlantillaGastos", () => {
  it("writes the documented headers in the first row of the expenses sheet", async () => {
    const workbook = await cargar(await generarPlantillaGastos(["Transporte", "Viáticos"]))
    const hoja = workbook.getWorksheet(HOJA_PLANTILLA_GASTOS)
    expect(hoja).toBeDefined()
    expect((hoja!.getRow(1).values as unknown[]).slice(1)).toEqual([...ENCABEZADOS_GASTOS])
  })

  it("separates Subtotal and IVA, offers an optional Total and no longer has the old «Valor (COP)» column (AJ-04)", async () => {
    const workbook = await cargar(await generarPlantillaGastos(["Transporte"]))
    const hoja = workbook.getWorksheet(HOJA_PLANTILLA_GASTOS)!
    const encabezados = (hoja.getRow(1).values as unknown[]).slice(1)
    expect(encabezados).toEqual(expect.arrayContaining(["Subtotal", "IVA", "Total"]))
    expect(encabezados).not.toContain("Valor (COP)")
    for (const nombre of ["Subtotal", "IVA", "Total"]) {
      expect(hoja.getColumn(encabezados.indexOf(nombre) + 1).numFmt).toBe("#,##0.00")
    }
    expect(hoja.getColumn(encabezados.indexOf("Fecha del documento") + 1).numFmt).toBe("yyyy-mm-dd")
  })

  it("lists the rubros that take expenses in their own sheet", async () => {
    const workbook = await cargar(await generarPlantillaGastos(["Transporte", "Viáticos"]))
    const rubros = workbook.getWorksheet(HOJA_RUBROS_GASTOS)
    expect(rubros).toBeDefined()
    expect([1, 2, 3].map((r) => rubros!.getRow(r).getCell(1).value)).toEqual(["Rubro", "Transporte", "Viáticos"])
  })

  it("is read back by the parser: headers found, no data rows", async () => {
    const r = await parseGastosImport(await generarPlantillaGastos(["Transporte"]), {
      proyecto: { fecha_inicio: new Date("2026-10-05"), fecha_fin: new Date("2027-01-29") },
      rubros: [],
      rubrosConAsignado: new Set(),
    })
    expect(r.erroresArchivo).toEqual([SIN_FILAS_GASTOS])
  })
})
