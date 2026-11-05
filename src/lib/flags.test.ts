import { describe, expect, it } from "vitest"
import { leerBanderaProyectosV3, puedeVerProyectosV3 } from "./flags"

describe("bandera FEATURE_PROYECTOS_V3", () => {
  it("arranca apagada cuando la variable no está o no se reconoce", () => {
    // Una bandera mal escrita nunca enciende nada: es la diferencia entre un typo y una fuga.
    expect(leerBanderaProyectosV3(undefined)).toBe("off")
    expect(leerBanderaProyectosV3("")).toBe("off")
    expect(leerBanderaProyectosV3("encendida")).toBe("off")
    expect(leerBanderaProyectosV3("true")).toBe("off")
  })

  it("acepta solo sus tres valores, sin importar mayúsculas ni espacios", () => {
    expect(leerBanderaProyectosV3("off")).toBe("off")
    expect(leerBanderaProyectosV3("admin")).toBe("admin")
    expect(leerBanderaProyectosV3("  ON ")).toBe("on")
  })

  it("en off no entra nadie, ni siquiera administración", () => {
    for (const rol of ["ADMINISTRADOR", "GERENCIA", "COORDINADOR", "COLABORADOR", null, undefined]) {
      expect(puedeVerProyectosV3("off", rol)).toBe(false)
    }
  })

  it("en admin entran solo Administración y Gerencia", () => {
    expect(puedeVerProyectosV3("admin", "ADMINISTRADOR")).toBe(true)
    expect(puedeVerProyectosV3("admin", "GERENCIA")).toBe(true)
    expect(puedeVerProyectosV3("admin", "COORDINADOR")).toBe(false)
    expect(puedeVerProyectosV3("admin", "COLABORADOR")).toBe(false)
    expect(puedeVerProyectosV3("admin", null)).toBe(false)
  })

  it("en on entra cualquiera con sesión, y sin sesión no", () => {
    expect(puedeVerProyectosV3("on", "COLABORADOR")).toBe(true)
    expect(puedeVerProyectosV3("on", "COORDINADOR")).toBe(true)
    expect(puedeVerProyectosV3("on", null)).toBe(false)
    expect(puedeVerProyectosV3("on", undefined)).toBe(false)
  })
})
