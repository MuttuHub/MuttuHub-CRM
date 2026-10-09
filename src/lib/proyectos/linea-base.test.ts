import { describe, expect, it } from "vitest"
import { precondicionesLineaBase, type EntradaLineaBase } from "./linea-base"
import { toCents } from "./money"

const c = (v: string) => toCents(v)
const periodos = ["2026-10", "2026-11"]

/** A baseline that satisfies every REQ-VER-01 item. */
function valida(): EntradaLineaBase {
  return {
    valorTotal: c("300"),
    fechaInicio: "2026-10-05",
    fechaFin: "2026-11-27",
    beneficiariosMeta: 500,
    objetivos: [{ codigo: "OE1" }],
    actividades: [{ codigo: "1.1", objetivoCodigo: "OE1" }],
    entregables: [{ codigo: "1.1-E1", actividadCodigo: "1.1" }],
    lineas: [{ rubroId: "r1", nombre: "Personal", asignado: c("300"), activo: true }],
    programacion: periodos.map((periodo) => ({ rubroId: "r1", periodo, valor: c("150") })),
  }
}

const codigos = (entrada: EntradaLineaBase) => precondicionesLineaBase(entrada).map((f) => f.codigo)

describe("precondicionesLineaBase", () => {
  it("returns no failure for a complete project", () => {
    expect(precondicionesLineaBase(valida())).toEqual([])
  })

  it("SIN_VALOR_TOTAL when valor_total is null", () => {
    expect(codigos({ ...valida(), valorTotal: null })).toContain("SIN_VALOR_TOTAL")
  })

  it("SIN_VALOR_TOTAL when valor_total is zero", () => {
    expect(codigos({ ...valida(), valorTotal: c("0") })).toContain("SIN_VALOR_TOTAL")
  })

  it("SIN_FECHAS when a date is missing, without cascading range failures", () => {
    const fallas = codigos({ ...valida(), fechaFin: null })
    expect(fallas).toContain("SIN_FECHAS")
    expect(fallas).not.toContain("PERIODO_FUERA_DE_RANGO")
  })

  it("SIN_FECHAS when the end is before the start", () => {
    expect(codigos({ ...valida(), fechaInicio: "2026-12-01", fechaFin: "2026-10-01" })).toContain("SIN_FECHAS")
  })

  it("META_BENEFICIARIOS_INVALIDA for null and for zero", () => {
    expect(codigos({ ...valida(), beneficiariosMeta: null })).toContain("META_BENEFICIARIOS_INVALIDA")
    expect(codigos({ ...valida(), beneficiariosMeta: 0 })).toContain("META_BENEFICIARIOS_INVALIDA")
  })

  it("SIN_OBJETIVOS when the project has none", () => {
    const entrada = { ...valida(), objetivos: [], actividades: [], entregables: [] }
    expect(codigos(entrada)).toContain("SIN_OBJETIVOS")
  })

  it("OBJETIVO_SIN_ACTIVIDADES names the objective", () => {
    const entrada = { ...valida(), objetivos: [{ codigo: "OE1" }, { codigo: "OE2" }] }
    const falla = precondicionesLineaBase(entrada).find((f) => f.codigo === "OBJETIVO_SIN_ACTIVIDADES")
    expect(falla?.mensaje).toBe("El objetivo OE2 no tiene actividades.")
  })

  it("ACTIVIDAD_SIN_ENTREGABLES names the activity", () => {
    const entrada = { ...valida(), actividades: [...valida().actividades, { codigo: "1.2", objetivoCodigo: "OE1" }] }
    const falla = precondicionesLineaBase(entrada).find((f) => f.codigo === "ACTIVIDAD_SIN_ENTREGABLES")
    expect(falla?.mensaje).toBe("La actividad 1.2 no tiene entregables.")
  })

  it("includes the budget preconditions (sum, control, pending programming)", () => {
    const entrada = { ...valida(), valorTotal: c("400"), programacion: [] }
    expect(codigos(entrada)).toEqual(
      expect.arrayContaining(["SUMA_DISTINTA_VALOR_TOTAL", "PROGRAMACION_PENDIENTE", "CONTROL_PROGRAMACION"]),
    )
  })

  it("flags a programming cell outside the project range", () => {
    const entrada = { ...valida(), programacion: [...valida().programacion, { rubroId: "r1", periodo: "2027-05", valor: c("0") }] }
    expect(codigos(entrada)).toContain("PERIODO_FUERA_DE_RANGO")
  })

  it("lists every failed precondition at once, structure first", () => {
    const entrada: EntradaLineaBase = {
      valorTotal: null,
      fechaInicio: null,
      fechaFin: null,
      beneficiariosMeta: null,
      objetivos: [],
      actividades: [],
      entregables: [],
      lineas: [],
      programacion: [],
    }
    expect(codigos(entrada)).toEqual([
      "SIN_VALOR_TOTAL",
      "SIN_FECHAS",
      "META_BENEFICIARIOS_INVALIDA",
      "SIN_OBJETIVOS",
      "PROGRAMACION_PENDIENTE",
    ])
  })
})
