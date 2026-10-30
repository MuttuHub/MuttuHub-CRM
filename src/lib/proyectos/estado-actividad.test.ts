import { describe, expect, it } from "vitest"
import { columnaTablero, vencidaSinTerminar } from "./estado-actividad"

describe("vencidaSinTerminar", () => {
  it("is overdue when the activity ended on or before the corte and is not finished", () => {
    expect(vencidaSinTerminar({ fin: "2026-03-10", corte: "2026-03-10", terminada: false })).toBe(true)
    expect(vencidaSinTerminar({ fin: "2026-03-09", corte: "2026-03-10", terminada: false })).toBe(true)
  })

  it("is not overdue the day before its end, nor once finished", () => {
    expect(vencidaSinTerminar({ fin: "2026-03-11", corte: "2026-03-10", terminada: false })).toBe(false)
    expect(vencidaSinTerminar({ fin: "2026-03-01", corte: "2026-03-10", terminada: true })).toBe(false)
  })
})

describe("columnaTablero", () => {
  const base = { color: "verde" as const, fin: "2026-06-30", corte: "2026-03-15", tope: 90 }

  it("puts a finished activity (progreso >= 100) in Terminada, even if it ended before the corte or is red", () => {
    expect(columnaTablero({ ...base, progreso: 100 })).toBe("terminada")
    expect(columnaTablero({ ...base, progreso: 100, fin: "2026-01-01", color: "rojo" })).toBe("terminada")
  })

  it("puts a red activity in Atrasada whatever its progress", () => {
    expect(columnaTablero({ ...base, progreso: 0, color: "rojo" })).toBe("atrasada")
    expect(columnaTablero({ ...base, progreso: 99.9, color: "rojo" })).toBe("atrasada")
  })

  it("puts an unfinished activity whose end is on or before the corte in Atrasada", () => {
    expect(columnaTablero({ ...base, progreso: 40, fin: "2026-03-15" })).toBe("atrasada")
    expect(columnaTablero({ ...base, progreso: 0, fin: "2026-03-14" })).toBe("atrasada")
  })

  it("keeps a due activity that reached the tope out of Atrasada: it only waits for soportes (AJ-03)", () => {
    expect(columnaTablero({ ...base, progreso: 90, fin: "2026-03-01" })).toBe("en_curso")
    expect(columnaTablero({ ...base, progreso: 89.9, fin: "2026-03-01" })).toBe("atrasada")
    expect(columnaTablero({ ...base, progreso: 85, fin: "2026-03-01", tope: 80 })).toBe("en_curso")
  })

  it("puts a started, not-late activity in En curso (the boundary is progreso > 0)", () => {
    expect(columnaTablero({ ...base, progreso: 0.1 })).toBe("en_curso")
    expect(columnaTablero({ ...base, progreso: 99.9, fin: "2026-03-16" })).toBe("en_curso")
  })

  it("puts an untouched, not-late activity in Por iniciar", () => {
    expect(columnaTablero({ ...base, progreso: 0 })).toBe("por_iniciar")
  })

  it("never calls an activity without a known end late by date, only by its server colour", () => {
    expect(columnaTablero({ ...base, progreso: 10, fin: null })).toBe("en_curso")
    expect(columnaTablero({ ...base, progreso: 10, fin: null, color: "rojo" })).toBe("atrasada")
  })
})
