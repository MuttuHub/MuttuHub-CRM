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

  it("reads the version and the nine sheets present", async () => {
    const parsed = await roundTrip()
    expect(parsed.version).toBe(PLANTILLA_VERSION)
    expect(parsed.hojasPresentes).toEqual(Object.values(HOJAS))
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
    expect(parsed.encabezados.programacion[0]).toBe("Código rubro")
    expect(parsed.encabezados.programacion.at(-1)).toBe("Control")
  })

  it("takes formula values from the cached result", async () => {
    const parsed = await roundTrip()
    const r01 = parsed.programacion.filas.find((f) => f.celdas["Código rubro"].valor === "R01")!
    expect(r01.celdas["Total"].valor).toBe(59500000)
    expect(r01.celdas["Control"].valor).toBe(0)
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

  it("round-trips the budget and the monthly programming to the cent", async () => {
    const input = fixtureF_X1()
    const parsed = await roundTrip()
    for (const fila of parsed.presupuesto) {
      const codigo = String(fila.celdas["Código rubro"].valor)
      expect(toCents(String(fila.celdas["Valor asignado"].valor))).toBe(toCents(input.presupuesto[codigo] ?? "0"))
    }
    expect(parsed.programacion.meses.map((m) => m.periodo)).toEqual(["2026-10", "2026-11", "2026-12", "2027-01"])
    for (const fila of parsed.programacion.filas) {
      const codigo = String(fila.celdas["Código rubro"].valor)
      for (const mes of parsed.programacion.meses) {
        const valor = fila.celdas[mes.encabezado].valor
        const esperado = input.programacion[codigo]?.[mes.periodo!]
        expect(toCents(valor === null || valor === undefined ? "0" : String(valor))).toBe(toCents(esperado ?? "0"))
      }
    }
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

  it("throws PlantillaIlegible for a garbage buffer", async () => {
    await expect(parsePlantilla(Buffer.from("this is not an xlsx"))).rejects.toBeInstanceOf(PlantillaIlegible)
  })
})
