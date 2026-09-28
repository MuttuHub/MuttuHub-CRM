import { describe, expect, it } from "vitest"
import { isNavActive, NAV_GROUPS, PAGE_HEADERS, resolvePageHeader } from "./nav"

describe("isNavActive", () => {
  it("treats the root as exact-match only", () => {
    expect(isNavActive("/", "/")).toBe(true)
    expect(isNavActive("/clientes", "/")).toBe(false)
    expect(isNavActive("/clientes/123", "/")).toBe(false)
    expect(isNavActive("", "/")).toBe(false)
  })

  it("matches a section on itself and on nested subpaths", () => {
    expect(isNavActive("/clientes", "/clientes")).toBe(true)
    expect(isNavActive("/clientes/123", "/clientes")).toBe(true)
    expect(isNavActive("/clientes/123/contactos", "/clientes")).toBe(true)
  })

  it("does not match unrelated sections", () => {
    expect(isNavActive("/", "/clientes")).toBe(false)
    expect(isNavActive("/documentos", "/clientes")).toBe(false)
    expect(isNavActive("/tablero", "/administracion")).toBe(false)
  })

  it("matches by raw prefix, so sibling sections sharing a prefix also match (current behavior)", () => {
    expect(isNavActive("/clientes-nuevo", "/clientes")).toBe(true)
    expect(isNavActive("/tablero-old", "/tablero")).toBe(true)
  })

  it("with exact, does not highlight the parent when a listed sibling subroute is active", () => {
    expect(isNavActive("/administracion", "/administracion", true)).toBe(true)
    expect(isNavActive("/administracion/solicitudes", "/administracion", true)).toBe(false)
    expect(isNavActive("/administracion/solicitudes", "/administracion/solicitudes", true)).toBe(true)
  })

  it("does not highlight Tablero (Kanban) when Tablero Gerencial is active", () => {
    const tableroKanban = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.href === "/tablero")!
    expect(tableroKanban.exact).toBe(true)
    expect(isNavActive("/tablero", tableroKanban.href, tableroKanban.exact)).toBe(true)
  })

  it("matches a `cara=` query param when the href carries one (F1.6: /?cara=management)", () => {
    expect(isNavActive("/", "/?cara=management", false, new URLSearchParams())).toBe(false)
    expect(
      isNavActive("/", "/?cara=management", false, new URLSearchParams("cara=management")),
    ).toBe(true)
    expect(
      isNavActive("/", "/?cara=management", false, new URLSearchParams("cara=pipeline")),
    ).toBe(false)
  })

  it("does not require a `cara` match for an href with no query (unaffected by unrelated search params)", () => {
    expect(isNavActive("/clientes", "/clientes", false, new URLSearchParams("cara=management"))).toBe(true)
  })

  it("the 'Tablero Gerencial' nav item points at the unified route (F1.6)", () => {
    const tableroGerencial = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.label === "Tablero Gerencial")!
    expect(tableroGerencial.href).toBe("/?cara=management")
  })
})

describe("resolvePageHeader", () => {
  it("returns the exact PAGE_HEADERS entry for a known pathname", () => {
    expect(resolvePageHeader("/proyectos")).toBe(PAGE_HEADERS["/proyectos"])
    expect(resolvePageHeader("/clientes")).toBe(PAGE_HEADERS["/clientes"])
  })

  it("falls back to the /proyectos prefix entry for a dynamic workspace route", () => {
    expect(resolvePageHeader("/proyectos/abc-123")).toBe(PAGE_HEADERS["/proyectos"])
    expect(resolvePageHeader("/proyectos/abc-123/cronograma")).toBe(PAGE_HEADERS["/proyectos"])
  })

  it("falls back to Muttu Hub for an unrelated pathname", () => {
    expect(resolvePageHeader("/no-existe")).toEqual({ title: "Muttu Hub", subtitle: "" })
  })
})