import { describe, expect, it } from "vitest"
import { formatFecha, formatFechaDia } from "./crm"

// Run under `TZ=America/Bogota` (UTC-5), the zone where the shift shows up.
describe("formatFechaDia", () => {
  it("keeps the calendar day of a date-only value stored as UTC midnight", () => {
    expect(formatFechaDia("2026-10-07T00:00:00.000Z")).toBe("07 de oct de 2026")
  })

  it("accepts a Date at UTC midnight", () => {
    expect(formatFechaDia(new Date("2026-10-07T00:00:00.000Z"))).toBe("07 de oct de 2026")
  })

  it("returns the placeholder for empty or invalid input", () => {
    expect(formatFechaDia(null)).toBe("—")
    expect(formatFechaDia(undefined)).toBe("—")
    expect(formatFechaDia("not-a-date")).toBe("—")
  })

  it("leaves formatFecha local, because real instants must follow the viewer's zone", () => {
    // 02:00 UTC is still the previous evening in Bogota.
    expect(formatFecha("2026-10-07T02:00:00.000Z")).toBe(
      new Date("2026-10-07T02:00:00.000Z").toLocaleDateString("es-CO", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
    )
  })
})
