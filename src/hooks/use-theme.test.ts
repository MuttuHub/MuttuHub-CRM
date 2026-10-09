import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { THEME_STORAGE_KEY, useTheme } from "./use-theme"

// The anti-FOUC script lives inline in the root layout (a Server Component
// cannot import a string from this "use client" module), so the tests extract
// it from the source and evaluate it against a fake document/storage.
const layoutSource = readFileSync(resolve(process.cwd(), "src/app/layout.tsx"), "utf8")
const initScript = /__html: `([^`]+)`/.exec(layoutSource)?.[1] ?? ""

function runInitScript(stored: string | null, systemDark: boolean) {
  const classes = new Set<string>()
  const root = {
    classList: { add: (c: string) => classes.add(c) },
    style: { colorScheme: "" },
  }
  const matchMedia = vi.fn(() => ({ matches: systemDark }))
  new Function("localStorage", "window", "document", initScript)(
    { getItem: (k: string) => (k === "muttu-theme" ? stored : null) },
    { matchMedia },
    { documentElement: root },
  )
  return { dark: classes.has("dark"), colorScheme: root.style.colorScheme, matchMedia }
}

describe("theme init script (layout.tsx)", () => {
  it("was found in the layout source", () => {
    expect(initScript).toContain("muttu-theme")
  })

  it("defaults to light when nothing is stored, even if the system prefers dark", () => {
    const out = runInitScript(null, true)
    expect(out.dark).toBe(false)
    expect(out.colorScheme).toBe("light")
    expect(out.matchMedia).not.toHaveBeenCalled()
  })

  it("a stored dark value wins over a light system preference", () => {
    const out = runInitScript("dark", false)
    expect(out.dark).toBe(true)
    expect(out.colorScheme).toBe("dark")
  })

  it("a stored light value wins over a dark system preference", () => {
    const out = runInitScript("light", true)
    expect(out.dark).toBe(false)
    expect(out.colorScheme).toBe("light")
  })
})

describe("useTheme", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark")
    window.localStorage.clear()
  })
  afterEach(() => {
    document.documentElement.classList.remove("dark")
    document.documentElement.style.colorScheme = ""
  })

  it("starts light with no class and no stored value, ignoring a dark system preference", async () => {
    window.matchMedia = vi.fn(() => ({ matches: true })) as unknown as typeof window.matchMedia
    const { result } = renderHook(() => useTheme())
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5))
    })
    expect(result.current.theme).toBe("light")
  })

  it("reads the dark class the init script applied", async () => {
    document.documentElement.classList.add("dark")
    const { result } = renderHook(() => useTheme())
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5))
    })
    expect(result.current.theme).toBe("dark")
  })

  it("toggles, applies class + color-scheme and persists", async () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.toggleTheme())
    expect(result.current.theme).toBe("dark")
    expect(document.documentElement.classList.contains("dark")).toBe(true)
    expect(document.documentElement.style.colorScheme).toBe("dark")
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark")
    act(() => result.current.toggleTheme())
    expect(result.current.theme).toBe("light")
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light")
  })
})
