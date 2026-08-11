import { beforeEach, describe, expect, it, vi } from "vitest"
import { RANGO_HEADER_LABELS, RANGO_OPCIONES, useFiltersStore, type RangoFiltro } from "./filters"

const STORAGE_KEY = "muttu-hub-filters"

describe("useFiltersStore", () => {
  beforeEach(() => {
    localStorage.clear()
    useFiltersStore.setState({ rango: "mes" })
  })

  it("starts with the default range (mes)", () => {
    expect(useFiltersStore.getState().rango).toBe("mes")
  })

  it("setRango updates the state", () => {
    useFiltersStore.getState().setRango("90")
    expect(useFiltersStore.getState().rango).toBe("90")

    useFiltersStore.getState().setRango("todo")
    expect(useFiltersStore.getState().rango).toBe("todo")
  })

  it("persists only the rango field to localStorage", () => {
    useFiltersStore.getState().setRango("30")
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")
    expect(raw.state).toEqual({ rango: "30" })
    expect(raw.version).toBe(0)
  })

  it("hydrates the persisted rango on store creation", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { rango: "90" }, version: 0 }))
    vi.resetModules()
    const fresh = await import("./filters")
    expect(fresh.useFiltersStore.getState().rango).toBe("90")
  })

  it("validates rango on hydrate: unknown value falls back to mes (BUG-001)", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { rango: "1000000" }, version: 0 }))
    vi.resetModules()
    const fresh = await import("./filters")
    expect(fresh.useFiltersStore.getState().rango).toBe("mes")
  })
})

describe("RANGO_OPCIONES", () => {
  it("exposes the four range presets with labels", () => {
    expect(RANGO_OPCIONES.map((o) => o.value)).toEqual(["todo", "mes", "30", "90"])
    expect(RANGO_OPCIONES.map((o) => o.label)).toEqual(["Todo", "Este mes", "30 días", "90 días"])
  })
})

describe("RANGO_HEADER_LABELS", () => {
  it("provides a label for every RangoFiltro option", () => {
    const rangoValues: RangoFiltro[] = ["todo", "mes", "30", "90"]
    for (const rango of rangoValues) {
      expect(RANGO_HEADER_LABELS[rango]).toBeTruthy()
    }
    expect(RANGO_HEADER_LABELS.todo).toBe("Todo el tiempo")
    expect(RANGO_HEADER_LABELS.mes).toBe("Este mes")
  })
})