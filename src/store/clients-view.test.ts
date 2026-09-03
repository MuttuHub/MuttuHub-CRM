import { beforeEach, describe, expect, it, vi } from "vitest"
import { useClientsViewStore } from "./clients-view"

const STORAGE_KEY = "muttu-hub-clientes-vista"

describe("useClientsViewStore", () => {
  beforeEach(() => {
    localStorage.clear()
    useClientsViewStore.setState({ view: "tarjetas" })
  })

  it("starts with the default view (tarjetas)", () => {
    const s = useClientsViewStore.getState()
    expect(s.view).toBe("tarjetas")
  })

  it("setView switches the current view", () => {
    useClientsViewStore.getState().setView("lista")
    expect(useClientsViewStore.getState().view).toBe("lista")

    useClientsViewStore.getState().setView("detalles")
    expect(useClientsViewStore.getState().view).toBe("detalles")
  })

  it("persists only `view` across sessions", () => {
    useClientsViewStore.getState().setView("detalles")
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")
    expect(raw.state).toEqual({ view: "detalles" })
  })

  it("hydrates persisted view on store creation", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { view: "lista" }, version: 0 }))
    vi.resetModules()
    const fresh = await import("./clients-view")
    expect(fresh.useClientsViewStore.getState().view).toBe("lista")
  })
})