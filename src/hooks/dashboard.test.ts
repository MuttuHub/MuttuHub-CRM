import { describe, expect, it } from "vitest"
import { buildDashboardQuery, rangoMesActual } from "./dashboard"

describe("rangoMesActual", () => {
  it("returns the first day of the month through today (local time)", () => {
    expect(rangoMesActual(new Date(2026, 7, 10))).toEqual({ desde: "2026-08-01", hasta: "2026-08-10" })
  })

  it("zero-pads month and day", () => {
    expect(rangoMesActual(new Date(2026, 0, 5))).toEqual({ desde: "2026-01-01", hasta: "2026-01-05" })
  })

  it("defaults to the current date", () => {
    const now = new Date()
    const { desde, hasta } = rangoMesActual()
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, "0")
    const dd = String(now.getDate()).padStart(2, "0")
    expect(desde).toBe(`${yyyy}-${mm}-01`)
    expect(hasta).toBe(`${yyyy}-${mm}-${dd}`)
  })
})

describe("buildDashboardQuery", () => {
  it("returns an empty string for empty filters", () => {
    expect(buildDashboardQuery({})).toBe("")
  })

  it("serializes present values in order", () => {
    const qs = buildDashboardQuery({
      desde: "2026-08-01",
      hasta: "2026-08-10",
      responsable_id: "u1",
    })
    expect(qs).toBe("desde=2026-08-01&hasta=2026-08-10&responsable_id=u1")
  })

  it("omits undefined and empty-string values", () => {
    const qs = buildDashboardQuery({ desde: "", hasta: undefined, tipo_cliente: "gobierno" })
    expect(qs).toBe("tipo_cliente=gobierno")
  })

  it("appends dias_sin_gestion when provided", () => {
    expect(buildDashboardQuery({}, { dias_sin_gestion: 30 })).toBe("dias_sin_gestion=30")
    expect(buildDashboardQuery({ desde: "2026-08-01" }, { dias_sin_gestion: 7 })).toBe(
      "desde=2026-08-01&dias_sin_gestion=7",
    )
  })

  it("omits dias_sin_gestion when falsy (0 or undefined)", () => {
    expect(buildDashboardQuery({}, { dias_sin_gestion: 0 })).toBe("")
    expect(buildDashboardQuery({}, {})).toBe("")
  })
})