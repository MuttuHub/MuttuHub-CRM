// @vitest-environment node
// Cell and rubro helpers shared by the Excel imports (structure, expenses).
import { describe, expect, it } from "vitest"
import { RUBROS_V2 } from "@/lib/catalogs"
import { toCents } from "./money"
import { indiceCatalogo, normalizarTexto, parseMontoCelda, vacio, type RubroCatalogo } from "./excel-celdas"

const catalogo: RubroCatalogo[] = RUBROS_V2.map((r) => ({ id: `id-${r.codigo}`, codigo: r.codigo, nombre: r.nombre }))

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

describe("catalog and empty-cell helpers", () => {
  it("indexes the catalog by normalized name and by code", () => {
    const indice = indiceCatalogo(catalogo)
    const primero = catalogo[0]
    expect(indice.get(normalizarTexto(primero.nombre))).toBe(primero)
    expect(primero.codigo && indice.get(normalizarTexto(primero.codigo))).toBe(primero)
  })

  it("treats null and blank text as empty, and a number as a value", () => {
    expect([vacio(null), vacio("   "), vacio("x"), vacio(0)]).toEqual([true, true, false, false])
  })
})
