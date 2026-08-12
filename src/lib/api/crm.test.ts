import { describe, expect, it } from "vitest"
import { parseClientListFilters } from "./crm"

const VALID_TIPO = ["EMPRESA", "GOBIERNO_LOCAL"] as const
const VALID_ESTADO = ["PROSPECTO", "CLIENTE_ACTIVO"] as const
const VALID_PRIORIDAD = ["ALTA", "MEDIA", "BAJA"] as const

function parse(qs: string) {
  return parseClientListFilters(
    new URL(`http://test/api/v1/clients?${qs}`),
    VALID_TIPO,
    VALID_ESTADO,
    VALID_PRIORIDAD,
  )
}

describe("parseClientListFilters", () => {
  it("accepts a valid date range (desde <= hasta)", () => {
    const res = parse("desde=2026-01-01&hasta=2026-12-31")
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.filters.desde).toBe("2026-01-01")
      expect(res.filters.hasta).toBe("2026-12-31")
    }
  })

  it("accepts a single-sided date range and equal bounds", () => {
    expect(parse("desde=2026-01-01").ok).toBe(true)
    expect(parse("hasta=2026-01-01").ok).toBe(true)
    expect(parse("desde=2026-01-01&hasta=2026-01-01").ok).toBe(true)
  })

  it("rejects `desde` after `hasta` with a 400 VALIDATION_ERROR", async () => {
    const res = parse("desde=2026-12-31&hasta=2026-01-01")
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.response.status).toBe(400)
      const body = await res.response.json()
      expect(body).toEqual({
        error: "La fecha final no puede ser anterior a la inicial.",
        code: "VALIDATION_ERROR",
      })
    }
  })

  it("still rejects malformed dates", () => {
    expect(parse("desde=31-12-2026").ok).toBe(false)
    expect(parse("hasta=2026/01/01").ok).toBe(false)
  })
})