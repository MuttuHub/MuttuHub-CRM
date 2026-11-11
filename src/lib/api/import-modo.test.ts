import { describe, expect, it } from "vitest"
import { leerModoImport } from "./import-modo"

describe("leerModoImport (X2)", () => {
  it("accepts validar and aplicar, treats a missing modo as aplicar, and rejects anything else", () => {
    expect(leerModoImport("validar")).toBe("validar")
    expect(leerModoImport("aplicar")).toBe("aplicar")
    expect(leerModoImport(null)).toBe("aplicar")
    expect(leerModoImport("aplicarr")).toBeNull()
    expect(leerModoImport("")).toBeNull()
    expect(leerModoImport("VALIDAR")).toBeNull()
  })
})
