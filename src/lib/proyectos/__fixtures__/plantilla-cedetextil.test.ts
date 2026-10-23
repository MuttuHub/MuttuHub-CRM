// @vitest-environment node
import { describe, expect, it } from "vitest"
import { fromCents, toCents } from "../money"
import {
  F_X1_META_BENEFICIARIOS,
  F_X1_PERIODOS,
  F_X1_PRESUPUESTO,
  F_X1_SUMA_VALIDA,
  F_X1_VALOR_V12,
  F_X1_VALOR_VALIDO,
  fixtureF_X1,
} from "./plantilla-cedetextil"

describe("fixture F-X1 (CedeTextil)", () => {
  it("budget sums to the valid project total (177.360.000)", () => {
    expect(fromCents(F_X1_SUMA_VALIDA)).toBe("177360000.00")
    expect(fixtureF_X1().proyecto.valorTotal).toBe(F_X1_VALOR_VALIDO)
  })

  it("the v12 variant only moves valor_total, by exactly 50.000", () => {
    const v12 = fixtureF_X1("v12")
    expect(v12.proyecto.valorTotal).toBe(F_X1_VALOR_V12)
    expect(toCents(F_X1_VALOR_V12) - F_X1_SUMA_VALIDA).toBe(toCents("50000"))
    // Everything else is identical apart from the total.
    expect({ ...v12, proyecto: { ...v12.proyecto, valorTotal: F_X1_VALOR_VALIDO } }).toEqual(fixtureF_X1())
  })

  it("the v13 variant only moves R12's first month, by exactly 50.000", () => {
    const v13 = fixtureF_X1("v13")
    const valido = fixtureF_X1()
    const primero = F_X1_PERIODOS[0]
    expect(toCents(v13.programacion.R12[primero]) - toCents(valido.programacion.R12[primero])).toBe(toCents("50000"))
    expect({ ...v13, programacion: { ...v13.programacion, R12: valido.programacion.R12 } }).toEqual(valido)
  })

  it("programming splits each funded rubro into four equal periods", () => {
    const input = fixtureF_X1()
    for (const [codigo, valor] of Object.entries(F_X1_PRESUPUESTO)) {
      const cells = F_X1_PERIODOS.map((periodo) => input.programacion[codigo][periodo])
      const sum = cells.reduce((total, cell) => total + toCents(cell), toCents("0"))
      expect(sum).toBe(toCents(valor))
      expect(cells).toHaveLength(4)
    }
  })

  it("carries 1 objective, 4 activities, 7 deliverables and 2 indicators", () => {
    const { estructura } = fixtureF_X1()
    expect(estructura.objetivos).toHaveLength(1)
    expect(estructura.actividades).toHaveLength(4)
    expect(estructura.entregables).toHaveLength(7)
    expect(estructura.indicadores).toHaveLength(2)
    expect(estructura.actividades[3]).toMatchObject({ codigo: "1.4", semanaInicio: 3, semanaFin: 6, peso: null })
    expect(F_X1_META_BENEFICIARIOS).toBe(500)
  })

  it("exposes all 15 rubros and the seven golden units", () => {
    const input = fixtureF_X1()
    expect(input.catalogo.rubros.map((r) => r.codigo)).toEqual([
      "R01", "R02", "R03", "R04", "R05", "R06", "R07", "R08",
      "R09", "R10", "R11", "R12", "R13", "R14", "R15",
    ])
    expect(new Set(input.estructura.entregables.map((e) => e.unidad))).toEqual(
      new Set(["Memoria", "Informe", "Mapa", "Acta", "Estatuto", "Certificado", "RUT"]),
    )
  })
})
