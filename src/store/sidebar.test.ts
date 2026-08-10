import { beforeEach, describe, expect, it, vi } from "vitest"
import { useSidebarStore } from "./sidebar"

const STORAGE_KEY = "muttu-hub-sidebar"

describe("useSidebarStore", () => {
  beforeEach(() => {
    localStorage.clear()
    useSidebarStore.setState({ collapsed: false, mobileOpen: false })
  })

  it("starts with default state (expanded rail, drawer closed)", () => {
    const s = useSidebarStore.getState()
    expect(s.collapsed).toBe(false)
    expect(s.mobileOpen).toBe(false)
  })

  it("toggleCollapsed flips the collapsed flag", () => {
    useSidebarStore.getState().toggleCollapsed()
    expect(useSidebarStore.getState().collapsed).toBe(true)

    useSidebarStore.getState().toggleCollapsed()
    expect(useSidebarStore.getState().collapsed).toBe(false)
  })

  it("setMobileOpen toggles the mobile drawer", () => {
    useSidebarStore.getState().setMobileOpen(true)
    expect(useSidebarStore.getState().mobileOpen).toBe(true)

    useSidebarStore.getState().setMobileOpen(false)
    expect(useSidebarStore.getState().mobileOpen).toBe(false)
  })

  it("persists only `collapsed` (mobileOpen is session-only)", () => {
    useSidebarStore.getState().setMobileOpen(true)
    useSidebarStore.getState().toggleCollapsed()

    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")
    expect(raw.state).toEqual({ collapsed: true })
    expect(raw.state.mobileOpen).toBeUndefined()
  })

  it("hydrates persisted collapsed state on store creation", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { collapsed: true }, version: 0 }))
    vi.resetModules()
    const fresh = await import("./sidebar")
    expect(fresh.useSidebarStore.getState().collapsed).toBe(true)
    expect(fresh.useSidebarStore.getState().mobileOpen).toBe(false)
  })
})