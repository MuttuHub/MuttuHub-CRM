import { describe, expect, it } from "vitest"
import { isNavActive } from "./nav"

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
})