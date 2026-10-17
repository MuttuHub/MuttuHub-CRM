// @vitest-environment node
// P1 — the PO's simple budget workbook (`rubro | valor (COP)`): header detection,
// rubro matching by normalized name, amounts and the per-row / per-file errors.
import { describe, expect, it } from "vitest"
import ExcelJS from "exceljs"
import { RUBROS_V2 } from "@/lib/catalogs"
import { toCents } from "../money"
import {
  MAX_FILAS_PRESUPUESTO_PO,
  normalizarTexto,
  parseMontoCelda,
  parsePresupuestoPO,
  type RubroCatalogo,
} from "./parse"

const catalogo: RubroCatalogo[] = RUBROS_V2.map((r) => ({ id: `id-${r.codigo}`, codigo: r.codigo, nombre: r.nombre }))

/** The PO's own sheet: `Hoja1`, the stray `}` in the header and `Viaticos` without an accent. */
const NOMBRES_PO = [
  "Personal",
  "Consultor",
  "Subsidio arriendo",
  "Promoción y divulgación",
  "Alistamiento",
  "Caracterización",
  "Acompañamiento",
  "Formación",
  "Capital semilla",
  "Viaticos",
  "Varios",
  "Transporte",
  "Suministros",
  "Oficina",
  "Dotación",
]

type Celda = string | number | null | ExcelJS.CellValue

async function libro(hojas: { nombre: string; filas: Celda[][] }[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  for (const hoja of hojas) {
    const sheet = workbook.addWorksheet(hoja.nombre)
    hoja.filas.forEach((fila, r) => {
      fila.forEach((valor, c) => {
        if (valor !== null) sheet.getCell(r + 1, c + 1).value = valor as ExcelJS.CellValue
      })
    })
  }
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

function libroPO(valores: Celda[] = NOMBRES_PO.map(() => null)): Promise<Buffer> {
  return libro([
    { nombre: "Hoja1", filas: [["rubro", "valor (COP)}"], ...NOMBRES_PO.map((nombre, i) => [nombre, valores[i] ?? null])] },
  ])
}

describe("normalizarTexto", () => {
  it("lowercases, strips accents, punctuation and extra spaces", () => {
    expect(normalizarTexto("  Promoción   y divulgación ")).toBe("promocion y divulgacion")
    expect(normalizarTexto("valor (COP)}")).toBe("valor cop")
    expect(normalizarTexto("VIÁTICOS.")).toBe("viaticos")
  })
})

describe("parseMontoCelda", () => {
  it("reads numeric cells as exact cents", () => {
    expect(parseMontoCelda(1500000)).toEqual({ ok: true, cents: toCents("1500000") })
    expect(parseMontoCelda(1500000.5)).toEqual({ ok: true, cents: toCents("1500000.50") })
  })

  it("reads es-CO text, with or without the currency sign", () => {
    expect(parseMontoCelda("1.500.000,50")).toEqual({ ok: true, cents: toCents("1500000.50") })
    expect(parseMontoCelda("$ 2.000.000")).toEqual({ ok: true, cents: toCents("2000000") })
    expect(parseMontoCelda("2000000")).toEqual({ ok: true, cents: toCents("2000000") })
  })

  it("treats an empty cell as $0", () => {
    expect(parseMontoCelda(null)).toEqual({ ok: true, cents: toCents("0") })
    expect(parseMontoCelda("   ")).toEqual({ ok: true, cents: toCents("0") })
  })

  it("rejects negative, malformed, error and over-precise amounts", () => {
    expect(parseMontoCelda(-5)).toMatchObject({ ok: false, message: expect.stringMatching(/negativo/) })
    expect(parseMontoCelda("-1.000")).toMatchObject({ ok: false, message: expect.stringMatching(/negativo/) })
    expect(parseMontoCelda("abc")).toMatchObject({ ok: false })
    expect(parseMontoCelda("1,500,000")).toMatchObject({ ok: false })
    expect(parseMontoCelda("#REF!")).toMatchObject({ ok: false })
    expect(parseMontoCelda(1.005)).toMatchObject({ ok: false })
    expect(parseMontoCelda(1e20)).toMatchObject({ ok: false, message: expect.stringMatching(/alto/) })
  })
})

describe("parsePresupuestoPO — the PO file shape", () => {
  it("reads the PO's blank sheet: every rubro matched, all amounts $0", async () => {
    const resultado = await parsePresupuestoPO(await libroPO(), catalogo)
    expect(resultado.erroresArchivo).toEqual([])
    expect(resultado.filas).toHaveLength(15)
    expect(resultado.filas.every((f) => f.error === null && f.rubroId !== null)).toBe(true)
    expect(resultado.filas.find((f) => f.rubroTexto === "Viaticos")?.rubroId).toBe("id-R10")
    expect(resultado.resumen).toEqual({ sumaCents: toCents("0"), rubros: 15, errores: 0 })
  })

  it("reads filled values (numeric and es-CO text) with their Excel row numbers", async () => {
    const valores: Celda[] = NOMBRES_PO.map(() => null)
    valores[0] = 10_000_000
    valores[9] = "1.500.000,50"
    const resultado = await parsePresupuestoPO(await libroPO(valores), catalogo)
    expect(resultado.filas[0]).toEqual({
      fila: 2,
      rubroTexto: "Personal",
      rubroId: "id-R01",
      cents: toCents("10000000"),
      error: null,
    })
    expect(resultado.filas[9]).toMatchObject({ fila: 11, rubroId: "id-R10", cents: toCents("1500000.50") })
    expect(resultado.resumen.sumaCents).toBe(toCents("11500000.50"))
  })

  it("reads a formula's cached result", async () => {
    const buffer = await libro([
      { nombre: "Hoja1", filas: [["Rubro", "Valor (COP)"], ["Personal", { formula: "1000+500", result: 1500 } as ExcelJS.CellValue]] },
    ])
    const resultado = await parsePresupuestoPO(buffer, catalogo)
    expect(resultado.filas[0]).toMatchObject({ rubroId: "id-R01", cents: toCents("1500") })
  })
})

describe("parsePresupuestoPO — headers", () => {
  it("finds the header row below a title and in any column order", async () => {
    const buffer = await libro([
      {
        nombre: "Presupuesto",
        filas: [["Presupuesto del proyecto"], [], ["  VALOR  ", "RUBROS"], [2000, "Oficina"]],
      },
    ])
    const resultado = await parsePresupuestoPO(buffer, catalogo)
    expect(resultado.erroresArchivo).toEqual([])
    expect(resultado.filas).toEqual([{ fila: 4, rubroTexto: "Oficina", rubroId: "id-R14", cents: toCents("2000"), error: null }])
  })

  it("uses the first sheet that has the headers", async () => {
    const buffer = await libro([
      { nombre: "Notas", filas: [["Instrucciones"]] },
      { nombre: "Hoja1", filas: [["rubro", "valor (COP)"], ["Dotación", 100]] },
    ])
    const resultado = await parsePresupuestoPO(buffer, catalogo)
    expect(resultado.filas).toHaveLength(1)
  })

  it("is a file error when no sheet has the headers", async () => {
    const buffer = await libro([{ nombre: "Hoja1", filas: [["nombre", "monto x"], ["Personal", 1]] }])
    const resultado = await parsePresupuestoPO(buffer, catalogo)
    expect(resultado.filas).toEqual([])
    expect(resultado.erroresArchivo).toEqual([expect.stringMatching(/Rubro.*Valor/)])
  })

  it("is a file error when the bytes are not a workbook", async () => {
    const resultado = await parsePresupuestoPO(Buffer.from("no soy un excel"), catalogo)
    expect(resultado.erroresArchivo).toEqual([expect.stringMatching(/no es un archivo de Excel válido/)])
  })
})

describe("parsePresupuestoPO — row errors", () => {
  it("flags an unknown rubro, a negative and an invalid amount on their rows", async () => {
    const buffer = await libro([
      {
        nombre: "Hoja1",
        filas: [["rubro", "valor"], ["Material POP", 100], ["Personal", -1], ["Oficina", "mucho"], ["Varios", 50]],
      },
    ])
    const resultado = await parsePresupuestoPO(buffer, catalogo)
    expect(resultado.filas.map((f) => [f.fila, f.rubroId, f.error === null])).toEqual([
      [2, null, false],
      [3, "id-R01", false],
      [4, "id-R14", false],
      [5, "id-R11", true],
    ])
    expect(resultado.filas[0].error).toMatch(/Material POP/)
    expect(resultado.filas[1].cents).toBeNull()
    expect(resultado.resumen).toEqual({ sumaCents: toCents("50"), rubros: 1, errores: 3 })
  })

  it("flags a duplicated rubro (also when written differently) on the repeated row", async () => {
    const buffer = await libro([
      { nombre: "Hoja1", filas: [["rubro", "valor"], ["Viáticos", 100], ["viaticos ", 200]] },
    ])
    const resultado = await parsePresupuestoPO(buffer, catalogo)
    expect(resultado.filas[0].error).toBeNull()
    expect(resultado.filas[1].error).toMatch(/repetido.*fila 2/)
    expect(resultado.resumen.sumaCents).toBe(toCents("100"))
  })

  it("flags a value without a rubro name, and skips empty and total rows", async () => {
    const buffer = await libro([
      {
        nombre: "Hoja1",
        filas: [["rubro", "valor"], ["Personal", 100], [], [null, 300], ["TOTAL", 400]],
      },
    ])
    const resultado = await parsePresupuestoPO(buffer, catalogo)
    expect(resultado.filas.map((f) => f.fila)).toEqual([2, 4])
    expect(resultado.filas[1].error).toMatch(/nombre del rubro/)
  })

  it("matches by rubro code too", async () => {
    const buffer = await libro([{ nombre: "Hoja1", filas: [["rubro", "valor"], ["r09", 5]] }])
    const resultado = await parsePresupuestoPO(buffer, catalogo)
    expect(resultado.filas[0].rubroId).toBe("id-R09")
  })

  it("is a file error beyond the row cap", async () => {
    const filas: Celda[][] = [["rubro", "valor"]]
    for (let i = 0; i <= MAX_FILAS_PRESUPUESTO_PO; i++) filas.push([`Rubro ${i}`, 1])
    const resultado = await parsePresupuestoPO(await libro([{ nombre: "Hoja1", filas }]), catalogo)
    expect(resultado.erroresArchivo).toEqual([expect.stringMatching(/más de/)])
  })
})
