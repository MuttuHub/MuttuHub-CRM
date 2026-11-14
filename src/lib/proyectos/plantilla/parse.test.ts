// @vitest-environment node
import { describe, expect, it } from "vitest"
import ExcelJS from "exceljs"
import { PlantillaIlegible, parseFechaCelda, parseNumeroColombiano, parsePlantilla } from "./parse"
import { generarPlantilla } from "./generate"
import { HOJAS, MAX_FILAS_HOJA, PLANTILLA_VERSION } from "./columns"
import { toCents } from "../money"
import { fixtureF_X1 } from "../__fixtures__/plantilla-cedetextil"

describe("parseNumeroColombiano", () => {
  it("reads dots as thousands separators", () => {
    expect(parseNumeroColombiano("59.500.000")).toBe("59500000")
    expect(parseNumeroColombiano("177.360.000")).toBe("177360000")
  })

  it("reads the last comma as the decimal separator with dot grouping", () => {
    expect(parseNumeroColombiano("1.440.000,50")).toBe("1440000.50")
    expect(parseNumeroColombiano("$ 1.440.000,50")).toBe("1440000.50")
  })

  it("treats a single dot with 1-2 trailing digits as a decimal point", () => {
    expect(parseNumeroColombiano("1.5")).toBe("1.5")
    expect(parseNumeroColombiano("0,5")).toBe("0.5")
  })

  it("rejects ambiguous US-style grouping with commas", () => {
    expect(parseNumeroColombiano("59,500,000")).toBeNull()
    expect(parseNumeroColombiano("1,500")).toBeNull()
  })

  it("rejects blank or non-numeric text", () => {
    expect(parseNumeroColombiano("")).toBeNull()
    expect(parseNumeroColombiano("abc")).toBeNull()
  })
})

describe("parseFechaCelda", () => {
  it("reads an Excel Date through its UTC parts", () => {
    expect(parseFechaCelda(new Date(Date.UTC(2026, 9, 5)))).toBe("2026-10-05")
  })

  it("reads DD/MM/AAAA and AAAA-MM-DD strings", () => {
    expect(parseFechaCelda("05/10/2026")).toBe("2026-10-05")
    expect(parseFechaCelda("2026-10-05")).toBe("2026-10-05")
  })

  it("returns null for impossible dates or other shapes", () => {
    expect(parseFechaCelda("32/13/2026")).toBeNull()
    expect(parseFechaCelda("mañana")).toBeNull()
    expect(parseFechaCelda(null)).toBeNull()
    expect(parseFechaCelda(42)).toBeNull()
  })
})

describe("parsePlantilla of the generated F-X1", () => {
  async function roundTrip() {
    return parsePlantilla(await generarPlantilla(fixtureF_X1()))
  }

  it("reads the version and the eight sheets present, with no obsolete sheet", async () => {
    const parsed = await roundTrip()
    expect(parsed.version).toBe(PLANTILLA_VERSION)
    expect(parsed.hojasPresentes).toEqual(Object.values(HOJAS))
    expect(parsed.hojasObsoletas).toEqual([])
  })

  it("notes the programming sheet of the old layout without reading it (A2)", async () => {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load((await generarPlantilla(fixtureF_X1())) as never)
    workbook.addWorksheet("8. Programación").addRow(["Código rubro", "Rubro", "Mes 1 (2026-10)", "Total", "Control"])
    const parsed = await parsePlantilla((await workbook.xlsx.writeBuffer()) as never)
    expect(parsed.hojasObsoletas).toEqual(["8. Programación"])
    expect(parsed.hojasPresentes).toEqual(Object.values(HOJAS))
    expect(Object.keys(parsed.encabezados)).not.toContain("programacion")
  })

  it("locates every cell with its sheet, row and column", async () => {
    const parsed = await roundTrip()
    const codigo = parsed.objetivos[0].celdas["Código"]
    expect(codigo).toMatchObject({ hoja: HOJAS.objetivos, fila: 2, columna: "A", valor: "OE1" })
    expect(parsed.proyecto.codigo).toMatchObject({ hoja: HOJAS.proyecto, fila: 2, columna: "B" })
  })

  it("keeps the header rows per sheet", async () => {
    const parsed = await roundTrip()
    expect(parsed.encabezados.objetivos).toEqual(["Código", "Descripción"])
    expect(parsed.encabezados.presupuesto).toEqual(["Código de actividad", "Rubro", "Valor"])
  })

  it("takes formula values from the cached result", async () => {
    const workbook = new ExcelJS.Workbook()
    const hoja = workbook.addWorksheet(HOJAS.presupuesto)
    hoja.addRow(["Código de actividad", "Rubro", "Valor"])
    hoja.addRow(["1.1", "R01", null])
    hoja.getCell("C2").value = { formula: "1000*2", result: 2000 }
    hoja.addRow(["1.2", "R01", null])
    hoja.getCell("C3").value = { formula: "1-1", result: 0 }
    const parsed = await parsePlantilla((await workbook.xlsx.writeBuffer()) as never)
    expect(parsed.presupuesto.map((f) => f.celdas["Valor"].valor)).toEqual([2000, 0])
  })

  it("round-trips the project fields and the ';' list order", async () => {
    const input = fixtureF_X1()
    const parsed = await roundTrip()
    expect(parsed.proyecto.codigo.valor).toBe(input.proyecto.codigo)
    expect(parsed.proyecto.lineas.valor).toBe("LE03 - Productividad; LE02 - Emprendimiento")
    expect(String(parsed.proyecto.lineas.valor).split("; ")).toEqual(["LE03 - Productividad", "LE02 - Emprendimiento"])
    expect(parseFechaCelda(parsed.proyecto.fechaInicio.valor)).toBe(input.proyecto.fechaInicio)
    expect(parseFechaCelda(parsed.proyecto.fechaFin.valor)).toBe(input.proyecto.fechaFin)
    expect(parsed.objetivos).toHaveLength(1)
    expect(parsed.actividades).toHaveLength(4)
    expect(parsed.entregables).toHaveLength(7)
    expect(parsed.indicadores).toHaveLength(2)
  })

  it("round-trips every activity, deliverable, indicator and project field of F-X1", async () => {
    const parsed = await roundTrip()

    // Objetivos: code, description and their order. `ParsedTemplate` has no
    // `orden` field; the fixture order is asserted through the mapped arrays.
    expect(
      parsed.objetivos.map((f) => ({
        codigo: f.celdas["Código"].valor,
        descripcion: f.celdas["Descripción"].valor,
      })),
    ).toEqual([
      {
        codigo: "OE1",
        descripcion: "Fortalecer las capacidades productivas de las unidades textiles del municipio.",
      },
    ])

    // Actividades: code, objective link, name, weeks (via the parsed cells) and owner.
    // AJ-02: the sheet no longer carries a weight column.
    expect(
      parsed.actividades.map((f) => ({
        codigo: f.celdas["Código"].valor,
        objetivoCodigo: f.celdas["Código objetivo"].valor,
        nombre: f.celdas["Nombre"].valor,
        semanaInicio: f.celdas["Semana inicio"].valor,
        semanaFin: f.celdas["Semana fin"].valor,
        responsable: f.celdas["Responsable (correo)"].valor,
      })),
    ).toEqual([
      { codigo: "1.1", objetivoCodigo: "OE1", nombre: "Caracterización de las unidades productivas", semanaInicio: 1, semanaFin: 1, responsable: "ana@muttu.co" },
      { codigo: "1.2", objetivoCodigo: "OE1", nombre: "Formación en prácticas de confección", semanaInicio: 2, semanaFin: 2, responsable: "ana@muttu.co" },
      { codigo: "1.3", objetivoCodigo: "OE1", nombre: "Acompañamiento técnico a las unidades", semanaInicio: 3, semanaFin: 3, responsable: "ana@muttu.co" },
      { codigo: "1.4", objetivoCodigo: "OE1", nombre: "Entrega de dotación y certificación", semanaInicio: 3, semanaFin: 6, responsable: "ana@muttu.co" },
    ])

    // Entregables: code, activity link, description, quantity and unit.
    expect(
      parsed.entregables.map((f) => ({
        codigo: f.celdas["Código"].valor,
        actividadCodigo: f.celdas["Código actividad"].valor,
        descripcion: f.celdas["Descripción"].valor,
        cantidadMeta: f.celdas["Cantidad"].valor,
        unidad: f.celdas["Unidad"].valor,
      })),
    ).toEqual([
      { codigo: "1.1-E1", actividadCodigo: "1.1", descripcion: "Informe de caracterización", cantidadMeta: 1, unidad: "Informe" },
      { codigo: "1.1-E2", actividadCodigo: "1.1", descripcion: "Memoria de la jornada de caracterización", cantidadMeta: 1, unidad: "Memoria" },
      { codigo: "1.2-E1", actividadCodigo: "1.2", descripcion: "Mapa de unidades productivas", cantidadMeta: 1, unidad: "Mapa" },
      { codigo: "1.3-E1", actividadCodigo: "1.3", descripcion: "Acta de acompañamiento", cantidadMeta: 4, unidad: "Acta" },
      { codigo: "1.3-E2", actividadCodigo: "1.3", descripcion: "Estatuto del emprendimiento", cantidadMeta: 1, unidad: "Estatuto" },
      { codigo: "1.4-E1", actividadCodigo: "1.4", descripcion: "Certificado de formación", cantidadMeta: 4, unidad: "Certificado" },
      { codigo: "1.4-E2", actividadCodigo: "1.4", descripcion: "RUT actualizado de la unidad productiva", cantidadMeta: 4, unidad: "RUT" },
    ])

    // Indicadores: code, objective link, name, goal and baseline.
    expect(
      parsed.indicadores.map((f) => ({
        codigo: f.celdas["Código"].valor,
        objetivoCodigo: f.celdas["Código objetivo"].valor,
        nombre: f.celdas["Nombre"].valor,
        meta: f.celdas["Meta"].valor,
        lineaBase: f.celdas["Línea base"].valor,
      })),
    ).toEqual([
      { codigo: "IND-01", objetivoCodigo: "OE1", nombre: "Unidades productivas fortalecidas", meta: 30, lineaBase: 0 },
      { codigo: "IND-02", objetivoCodigo: "OE1", nombre: "Personas formadas", meta: 60, lineaBase: 0 },
    ])

    // Project: municipality list, total value and beneficiary goal.
    expect(parsed.proyecto.municipios.valor).toBe("Montería (Córdoba); Cereté (Córdoba)")
    expect(parsed.proyecto.valorTotal.valor).toBe(177360000)
    expect(parsed.proyecto.metaBeneficiarios.valor).toBe(500)
  })

  it("round-trips the budget lines (activity, rubro, value) to the cent", async () => {
    const input = fixtureF_X1()
    const parsed = await roundTrip()
    expect(
      parsed.presupuesto.map((fila) => [
        fila.celdas["Código de actividad"].valor,
        String(fila.celdas["Rubro"].valor).split(" - ")[0],
        toCents(String(fila.celdas["Valor"].valor)),
      ]),
    ).toEqual(input.presupuesto.map((l) => [l.actividadCodigo, l.rubroCodigo, toCents(l.valor)]))
  })

  it("keeps a numeric cell numeric (no Colombian parsing applied)", async () => {
    const workbook = new ExcelJS.Workbook()
    const hoja = workbook.addWorksheet(HOJAS.objetivos)
    hoja.addRow(["Código", "Descripción"])
    hoja.addRow(["OE1", 1.5])
    const buffer = await workbook.xlsx.writeBuffer()
    const parsed = await parsePlantilla(buffer as never)
    const valor = parsed.objetivos[0].celdas["Descripción"].valor
    expect(typeof valor).toBe("number")
    expect(valor).toBe(1.5)
  })

  it("caps the rows of each sheet at MAX_FILAS_HOJA", async () => {
    const workbook = new ExcelJS.Workbook()
    const hoja = workbook.addWorksheet(HOJAS.objetivos)
    hoja.addRow(["Código", "Descripción"])
    for (let i = 0; i < MAX_FILAS_HOJA + 5; i++) hoja.addRow([`OE${i}`, "x"])
    const buffer = await workbook.xlsx.writeBuffer()
    const parsed = await parsePlantilla(buffer as never)
    expect(parsed.objetivos).toHaveLength(MAX_FILAS_HOJA)
  })

  it("surfaces the rows an oversized sheet dropped", async () => {
    const workbook = new ExcelJS.Workbook()
    const hoja = workbook.addWorksheet(HOJAS.objetivos)
    hoja.addRow(["Código", "Descripción"])
    for (let i = 0; i < MAX_FILAS_HOJA + 5; i++) hoja.addRow([`OE${i}`, "x"])
    const buffer = await workbook.xlsx.writeBuffer()
    const parsed = await parsePlantilla(buffer as never)
    expect(parsed.excesoFilas[HOJAS.objetivos]).toBe(5)
  })

  it("reports no excess for the generated F-X1", async () => {
    const parsed = await roundTrip()
    expect(parsed.excesoFilas).toEqual({})
  })

  it("throws PlantillaIlegible for a garbage buffer", async () => {
    await expect(parsePlantilla(Buffer.from("this is not an xlsx"))).rejects.toBeInstanceOf(PlantillaIlegible)
  })
})
