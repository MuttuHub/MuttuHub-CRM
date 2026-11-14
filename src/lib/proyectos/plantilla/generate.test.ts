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
  it("writes the eight sheets in the canonical order, with no programming sheet (S4)", async () => {
    const workbook = await reload()
    expect(workbook.worksheets.map((w) => w.name)).toEqual(Object.values(HOJAS))
    expect(workbook.getWorksheet("8. Programación")).toBeUndefined()
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

  it("writes one budget row per line: activity code, rubro and value (S3)", async () => {
    const presupuesto = sheet(await reload(), HOJAS.presupuesto)
    expect(presupuesto.getRow(1).values).toEqual([undefined, "Código de actividad", "Rubro", "Valor"])
    const filas = Array.from({ length: 8 }, (_, i) => {
      const fila = presupuesto.getRow(i + 2)
      return [fila.getCell(1).value, fila.getCell(2).value, fila.getCell(3).value]
    })
    expect(filas).toEqual([
      ["1.1", "R01 - Personal", 59500000],
      ["1.1", "R06 - Caracterización", 1440000],
      ["1.2", "R08 - Formación", 45000000],
      ["1.2", "R12 - Transporte", 24000000],
      ["1.3", "R04 - Promoción y divulgación", 34000000],
      ["1.3", "R11 - Varios", 300000],
      ["1.4", "R13 - Suministros", 12800000],
      ["1.4", "R15 - Dotación", 320000],
    ])
    expect(presupuesto.actualRowCount).toBe(9)
  })

  it("leaves the activity cell empty for a legacy line without activity", async () => {
    const input = fixtureF_X1()
    input.presupuesto = [{ actividadCodigo: null, rubroCodigo: "R01", valor: "1000" }]
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load((await generarPlantilla(input)) as never)
    const fila = sheet(workbook, HOJAS.presupuesto).getRow(2)
    expect([fila.getCell(1).value, fila.getCell(2).value, fila.getCell(3).value]).toEqual([null, "R01 - Personal", 1000])
  })

  it("keeps the named ranges after a save/reload round trip", async () => {
    const workbook: WorkbookWithDefinedNames = await reload()
    expect(workbook.definedNames.getRanges("Rubros").ranges).toEqual(["'8. Catálogos'!$A$2:$A$16"])
    expect(sheet(workbook, HOJAS.catalogos).getCell("A2").value).toBe("R01 - Personal")
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
    expect(ranges).toEqual(["'8. Catálogos'!$C$2"])
    expect(ranges.join()).not.toContain("$C$1")
  })

  it("keeps the data validations after a save/reload round trip", async () => {
    const workbook = await reload()
    expect(sheet(workbook, HOJAS.presupuesto).getCell("A2").dataValidation.formulae).toEqual([
      "='4. Actividades'!$A$2:$A$200",
    ])
    expect(sheet(workbook, HOJAS.presupuesto).getCell("B2").dataValidation.formulae).toEqual(["=Rubros"])
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
})

describe("generarPlantilla — presentación de marca y ayudas", () => {
  it("pinta los encabezados con el rosa de la marca", async () => {
    const workbook = await reload()
    const actividades = sheet(workbook, HOJAS.actividades)
    expect(actividades.getCell("A1").fill).toMatchObject({
      type: "pattern",
      fgColor: { argb: "FFCD1560" },
    })
  })

  it("deja una ayuda con ejemplo en cada encabezado de datos", async () => {
    const workbook = await reload()
    const actividades = sheet(workbook, HOJAS.actividades)
    expect(JSON.stringify(actividades.getCell("A1").note)).toContain("Ejemplo: 1.1")
    expect(JSON.stringify(actividades.getCell("F1").note)).toContain("ana@muttu.co")

    const presupuesto = sheet(workbook, HOJAS.presupuesto)
    expect(JSON.stringify(presupuesto.getCell("C1").note)).toContain("15.000.000")

    const proyecto = sheet(workbook, HOJAS.proyecto)
    expect(JSON.stringify(proyecto.getCell("B8").note)).toContain("177.360.000")
  })

  it("incluye la tabla de ejemplos en la hoja de instrucciones", async () => {
    const workbook = await reload()
    const instrucciones = sheet(workbook, HOJAS.instrucciones)
    expect(instrucciones.getCell("A12").value).toContain("Ejemplos de uso")
    expect(instrucciones.getCell("A14").value).toBe("3. Objetivos")
  })
})

describe("generarPlantilla — comentarios en todos los encabezados", () => {
  it("cada hoja tiene un comentario en cada celda de su fila de encabezado", async () => {
    const workbook = await reload()
    for (const nombre of Object.values(HOJAS)) {
      const hoja = sheet(workbook, nombre)
      hoja.getRow(1).eachCell({ includeEmpty: false }, (celda) => {
        expect(JSON.stringify(celda.note), `falta comentario en ${nombre}!${celda.address}`).not.toBe("null")
      })
    }
  })

  // U8: la app y la guía PDF tratan de «tú»; las notas del Excel no pueden ir en voseo.
  it("U8: habla de tú en las notas, nunca con voseo", async () => {
    const workbook = await reload()
    const trozos: string[] = []
    for (const hoja of workbook.worksheets) {
      hoja.eachRow((fila) => {
        fila.eachCell({ includeEmpty: false }, (celda) => {
          if (typeof celda.value === "string") trozos.push(celda.value)
          const nota = JSON.stringify(celda.note)
          if (nota && nota !== "null") trozos.push(nota)
        })
      })
    }
    const texto = trozos.join("\n")

    expect(texto).not.toMatch(/Pasá|Leé|Escribí|Marcá|Revisá|Cargá|Usá|Completá|Poné|Tenés|Podés|Fijate|Acordate|Elegí|Dejá|Verificá/)
    expect(texto).toContain("Lee esta hoja antes de llenar el libro")
    expect(texto).toContain("Pasa el mouse por cada fila")
  })
})
