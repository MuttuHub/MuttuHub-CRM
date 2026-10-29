// Semana del reporte semanal (S5): lunes a domingo en el calendario de Bogotá.
import { describe, expect, it } from "vitest"
import { desplazarSemana, fechaEnBogota, inicioDiaBogota, semanaDe } from "./semana"

describe("semanaDe", () => {
  it("returns Monday to Sunday for any day of the week", () => {
    expect(semanaDe("2026-10-29")).toEqual({ desde: "2026-10-26", hasta: "2026-11-01" })
    expect(semanaDe("2026-10-26")).toEqual({ desde: "2026-10-26", hasta: "2026-11-01" })
    expect(semanaDe("2026-11-01")).toEqual({ desde: "2026-10-26", hasta: "2026-11-01" })
  })

  it("moves whole weeks back and forth", () => {
    expect(desplazarSemana(semanaDe("2026-10-29"), -1)).toEqual({ desde: "2026-10-19", hasta: "2026-10-25" })
    expect(desplazarSemana(semanaDe("2026-10-29"), 1)).toEqual({ desde: "2026-11-02", hasta: "2026-11-08" })
  })
})

describe("Bogotá calendar", () => {
  it("starts a Bogotá day at 05:00 UTC", () => {
    expect(inicioDiaBogota("2026-10-26").toISOString()).toBe("2026-10-26T05:00:00.000Z")
  })

  it("reads late-night UTC instants as the previous Bogotá day", () => {
    expect(fechaEnBogota(new Date("2026-10-26T03:00:00.000Z"))).toBe("2026-10-25")
    expect(fechaEnBogota(new Date("2026-10-26T05:00:00.000Z"))).toBe("2026-10-26")
  })
})
