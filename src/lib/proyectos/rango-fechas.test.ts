import { describe, expect, it } from "vitest"
import { MENSAJE_RANGO_FECHAS, rangoFechasValido } from "./rango-fechas"

describe("rangoFechasValido (V-03: start strictly before end)", () => {
  it("accepts a start strictly before the end", () => {
    expect(rangoFechasValido("2026-01-01", "2026-01-02")).toBe(true)
    expect(rangoFechasValido(new Date("2026-01-01T00:00:00Z"), new Date("2026-06-30T00:00:00Z"))).toBe(true)
  })

  it("rejects equal dates (one-day projects are not admitted, PO-4)", () => {
    expect(rangoFechasValido("2026-01-01", "2026-01-01")).toBe(false)
    expect(rangoFechasValido(new Date("2026-01-01T00:00:00Z"), new Date("2026-01-01T00:00:00Z"))).toBe(false)
  })

  it("compares calendar days, not instants", () => {
    expect(rangoFechasValido("2026-10-05T08:00:00Z", "2026-10-05T20:00:00Z")).toBe(false)
  })

  it("rejects an inverted range", () => {
    expect(rangoFechasValido("2026-02-01", "2026-01-01")).toBe(false)
  })

  it("exposes the Spanish message used by the API and the form", () => {
    expect(MENSAJE_RANGO_FECHAS).toBe("La fecha de fin debe ser posterior a la fecha de inicio.")
  })
})
