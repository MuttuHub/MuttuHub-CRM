import { describe, expect, it } from "vitest"

import { F_W1 } from "./__fixtures__/weeks"
import { pesoEfectivo, resolvePeso, toActividadV2View, validarSemanas } from "./actividad"

const proyecto = {
  fecha_inicio: new Date(`${F_W1.fechaInicio}T00:00:00.000Z`),
  fecha_fin: new Date(`${F_W1.fechaFin}T00:00:00.000Z`),
}

const fila = {
  id: "act-1",
  proyecto_id: "pry-1",
  objetivo_id: "obj-1",
  codigo: "1.4",
  nombre: "Taller de costura",
  semana_inicio: F_W1.actividad14.semanaInicio,
  semana_fin: F_W1.actividad14.semanaFin,
  peso: 4,
  peso_manual: false,
  responsable_id: null,
  created_at: new Date("2026-10-08T12:00:00.000Z"),
  updated_at: new Date("2026-10-08T12:00:00.000Z"),
}

describe("pesoEfectivo", () => {
  it("uses the duration in weeks as weight unless peso_manual", () => {
    // The stored weight is stale on purpose: a derived weight can never drift.
    expect(pesoEfectivo({ semana_inicio: 3, semana_fin: 6, peso: 99, peso_manual: false })).toBe(F_W1.actividad14.pesoPorDefecto)
    expect(pesoEfectivo({ semana_inicio: 3, semana_fin: 6, peso: 2.5, peso_manual: true })).toBe(2.5)
  })

  it("accepts a Decimal-like stored weight", () => {
    expect(pesoEfectivo({ semana_inicio: 3, semana_fin: 6, peso: { toString: () => "2.50" }, peso_manual: true })).toBe(2.5)
  })
})

describe("resolvePeso (REQ-STR-04)", () => {
  it("defaults to the duration when no weight is supplied", () => {
    expect(resolvePeso({ semana_inicio: 3, semana_fin: 6 })).toEqual({ peso: 4, peso_manual: false })
  })

  it("a supplied weight sets peso_manual", () => {
    expect(resolvePeso({ semana_inicio: 3, semana_fin: 6, peso: 2.5 })).toEqual({ peso: 2.5, peso_manual: true })
  })

  it("keeps a manual weight when the weeks change", () => {
    expect(
      resolvePeso({ semana_inicio: 3, semana_fin: 7, actual: { peso: 2.5, peso_manual: true } }),
    ).toEqual({ peso: 2.5, peso_manual: true })
  })

  it("recomputes a non-manual weight when the weeks change", () => {
    expect(
      resolvePeso({ semana_inicio: 3, semana_fin: 7, actual: { peso: 4, peso_manual: false } }),
    ).toEqual({ peso: 5, peso_manual: false })
  })

  it("an explicit null clears a manual weight back to the default", () => {
    expect(
      resolvePeso({ semana_inicio: 3, semana_fin: 7, peso: null, actual: { peso: 2.5, peso_manual: true } }),
    ).toEqual({ peso: 5, peso_manual: false })
  })

  it("rounds a manual weight to two decimals", () => {
    expect(resolvePeso({ semana_inicio: 1, semana_fin: 1, peso: 1.005 }).peso).toBe(1.01)
  })
})

describe("validarSemanas", () => {
  it("accepts 1 <= inicio <= fin <= duration, bounds included", () => {
    expect(validarSemanas(1, 17, F_W1.duracionSemanas)).toEqual({ ok: true })
    expect(validarSemanas(3, 6, F_W1.duracionSemanas)).toEqual({ ok: true })
    expect(validarSemanas(17, 17, F_W1.duracionSemanas)).toEqual({ ok: true })
  })

  it("rejects an inverted range, a week below 1 and a week past the duration", () => {
    for (const [inicio, fin] of [
      [6, 3],
      [0, 3],
      [3, 18],
    ]) {
      const result = validarSemanas(inicio, fin, F_W1.duracionSemanas)
      expect(result.ok).toBe(false)
    }
    expect(validarSemanas(3, 18, 17)).toEqual({
      ok: false,
      message: "La semana final no puede superar la duración del proyecto (17 semanas).",
    })
  })

  it("rejects non-integer weeks", () => {
    expect(validarSemanas(1.5, 3, 17).ok).toBe(false)
  })
})

describe("toActividadV2View", () => {
  it("derives fecha_inicio/fecha_fin from the weeks and the project start (F-W1)", () => {
    const view = toActividadV2View(fila, proyecto)
    expect(view.fecha_inicio).toBe(F_W1.actividad14.inicio)
    expect(view.fecha_fin).toBe(F_W1.actividad14.fin)
    expect(view.peso).toBe(F_W1.actividad14.pesoPorDefecto)
    expect(view.peso_manual).toBe(false)
    expect(view.fuera_de_duracion).toBe(false)
    expect(view.created_at).toBe("2026-10-08T12:00:00.000Z")
  })

  it("recomputes the dates when the project start changes", () => {
    const view = toActividadV2View(fila, { ...proyecto, fecha_inicio: new Date("2026-11-02T00:00:00.000Z") })
    expect(view.fecha_inicio).toBe("2026-11-16")
    expect(view.fecha_fin).toBe("2026-12-13")
  })

  it("never stores or exposes anything but derived dates: null while the project has no dates", () => {
    const view = toActividadV2View(fila, { fecha_inicio: null, fecha_fin: null })
    expect(view.fecha_inicio).toBeNull()
    expect(view.fecha_fin).toBeNull()
    expect(view.fuera_de_duracion).toBe(false)
  })

  it("flags an activity that exceeds a shrunk project duration instead of hiding it", () => {
    const view = toActividadV2View(
      { ...fila, semana_fin: 18 },
      proyecto,
    )
    expect(view.fuera_de_duracion).toBe(true)
  })

  it("keeps a manual weight in the view", () => {
    const view = toActividadV2View({ ...fila, peso: 2.5, peso_manual: true }, proyecto)
    expect(view.peso).toBe(2.5)
    expect(view.peso_manual).toBe(true)
  })
})
