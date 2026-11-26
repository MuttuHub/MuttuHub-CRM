// S12 (odd/tasks/reportes-etiqueta-y-posicion-propia.md, L20): the one label every reader shows for a
// project's client, «Posición propia · N aliados» when it has none.
import { describe, expect, it } from "vitest"
import { etiquetaClienteProyecto, nombreClienteProyecto } from "./posicion-propia"

describe("etiquetaClienteProyecto", () => {
  it("shows the client's name when the project has a client, whatever the ally count", () => {
    expect(etiquetaClienteProyecto({ cliente: { nombre: "CedeTextil S.A." }, aliados_count: 3 })).toBe("CedeTextil S.A.")
  })

  it("shows only «Posición propia» without allies", () => {
    expect(etiquetaClienteProyecto({ cliente: null, aliados_count: 0 })).toBe("Posición propia")
    expect(etiquetaClienteProyecto({ cliente: null })).toBe("Posición propia")
  })

  it("uses the singular for one ally", () => {
    expect(etiquetaClienteProyecto({ cliente: null, aliados_count: 1 })).toBe("Posición propia · 1 aliado")
  })

  it("uses the plural for several allies", () => {
    expect(etiquetaClienteProyecto({ cliente: null, aliados_count: 4 })).toBe("Posición propia · 4 aliados")
  })
})

describe("nombreClienteProyecto (existing callers)", () => {
  it("keeps answering the client's name or «Posición propia»", () => {
    expect(nombreClienteProyecto({ nombre: "Comfama" })).toBe("Comfama")
    expect(nombreClienteProyecto(null)).toBe("Posición propia")
  })
})
