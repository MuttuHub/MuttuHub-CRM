// @vitest-environment node
import { describe, expect, it } from "vitest"
import ExcelJS from "exceljs"
import { generarPlantilla } from "./generate"
import { HOJAS, PLANTILLA_VERSION } from "./columns"
import { fixtureF_X1, F_X1_CLIENTE, F_X1_CODIGO, F_X1_INICIO } from "../__fixtures__/plantilla-cedetextil"

type WorkbookWithDefinedNames = ExcelJS.Workbook

async function reload(): Promise<ExcelJS.Workbook> {
  const buffer = await generarPlantilla(fixtureF_X1())
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as never)
  return workbook
}

function sheet(workbook: ExcelJS.Workbook, name: string): ExcelJS.Worksheet {
  const found = workbook.getWorksheet(name)
  if (!found) throw new Error(`Missing sheet ${name}`)
  return found
}

describe("generarPlantilla (F-X1 round trip through ExcelJS)", () => {
  it("writes the nine sheets in the canonical order", async () => {
    const workbook = await reload()
    expect(workbook.worksheets.map((w) => w.name)).toEqual(Object.values(HOJAS))
  })

  it("puts the version in B2 of the instructions sheet", async () => {
    const workbook = await reload()
    expect(sheet(workbook, HOJAS.instrucciones).getCell("B2").value).toBe(PLANTILLA_VERSION)
  })

  it("prefills the project code and client and dates them as Date cells", async () => {
    const proyecto = sheet(await reload(), HOJAS.proyecto)
    expect(proyecto.getCell("A2").value).toBe("Código")
    expect(proyecto.getCell("B2").value).toBe(F_X1_CODIGO)
    expect(proyecto.getCell("A3").value).toBe("Cliente")
    expect(proyecto.getCell("B3").value).toBe(F_X1_CLIENTE)
    expect(proyecto.getCell("A6").value).toBe("Fecha de inicio")
    const fecha = proyecto.getCell("B6").value
    expect(fecha).toBeInstanceOf(Date)
    expect((fecha as Date).toISOString()).toBe(`${F_X1_INICIO}T00:00:00.000Z`)
  })

  it("preloads all 15 rubros in the budget sheet", async () => {
    const presupuesto = sheet(await reload(), HOJAS.presupuesto)
    const codes = Array.from({ length: 15 }, (_, i) => presupuesto.getCell(i + 2, 1).value)
    expect(codes).toEqual([
      "R01", "R02", "R03", "R04", "R05", "R06", "R07", "R08",
      "R09", "R10", "R11", "R12", "R13", "R14", "R15",
    ])
    expect(presupuesto.getCell("C2").value).toBe(59500000)
    expect(presupuesto.getCell("C3").value).toBe(0)
  })

  it("builds one Mes k (AAAA-MM) column per project period", async () => {
    const programacion = sheet(await reload(), HOJAS.programacion)
    expect(programacion.getCell("C1").value).toBe("Mes 1 (2026-10)")
    expect(programacion.getCell("D1").value).toBe("Mes 2 (2026-11)")
    expect(programacion.getCell("E1").value).toBe("Mes 3 (2026-12)")
    expect(programacion.getCell("F1").value).toBe("Mes 4 (2027-01)")
    expect(programacion.getCell("G1").value).toBe("Total")
    expect(programacion.getCell("H1").value).toBe("Control")
    // R01 in row 2: four monthly cells.
    expect(programacion.getCell("C2").value).toBe(14875000)
    expect(programacion.getCell("F2").value).toBe(14875000)
  })

  it("keeps the named ranges after a save/reload round trip", async () => {
    const workbook: WorkbookWithDefinedNames = await reload()
    expect(workbook.definedNames.getRanges("Rubros").ranges).toEqual(["'9. Catálogos'!$A$2:$A$16"])
    expect(workbook.definedNames.getRanges("Lineas").ranges[0]).toContain("$B$2:$B$")
    expect(workbook.definedNames.getRanges("Municipios").ranges[0]).toContain("$C$2:$C$")
    expect(workbook.definedNames.getRanges("Unidades").ranges[0]).toContain("$D$2:$D$")
  })

  it("anchors an empty catalog list on a valid single-cell range", async () => {
    const input = fixtureF_X1()
    input.catalogo.municipios = []
    const buffer = await generarPlantilla(input)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer as never)
    const ranges = workbook.definedNames.getRanges("Municipios").ranges
    // An empty list must never yield the reversed `$C$2:$C$1`, which ExcelJS
    // rewrites to `$C$1:$C$2` and wrongly includes the header row.
    expect(ranges).toEqual(["'9. Catálogos'!$C$2"])
    expect(ranges.join()).not.toContain("$C$1")
  })

  it("keeps the data validations after a save/reload round trip", async () => {
    const workbook = await reload()
    expect(sheet(workbook, HOJAS.presupuesto).getCell("A2").dataValidation.formulae).toEqual(["=Rubros"])
    expect(sheet(workbook, HOJAS.actividades).getCell("B2").dataValidation.formulae).toEqual([
      "='3. Objetivos'!$A$2:$A$200",
    ])
    expect(sheet(workbook, HOJAS.entregables).getCell("D2").dataValidation.type).toBe("decimal")
    expect(sheet(workbook, HOJAS.actividades).getCell("D2").dataValidation.type).toBe("whole")
  })

  it("protects the catalog sheet with a password that is not stored", async () => {
    const workbook = await reload()
    const catalogo = sheet(workbook, HOJAS.catalogos)
    const protection = (catalogo as unknown as { sheetProtection?: { sheet?: boolean } }).sheetProtection
    expect(protection?.sheet).toBe(true)
  })

  it("writes Total and Control formulas with a cached result", async () => {
    const programacion = sheet(await reload(), HOJAS.programacion)
    const total = programacion.getCell("G2")
    const control = programacion.getCell("H2")
    expect(total.formula).toBe("SUM(C2:F2)")
    expect(total.result).toBe(59500000)
    expect(control.formula).toBe("G2-VLOOKUP(A2,'7. Presupuesto'!A:C,3,FALSE)")
    expect(control.result).toBe(0)
  })
})
