import { describe, expect, it } from "vitest"

import { liveF_V1 } from "./__fixtures__/versiones"
import { validarModificacion } from "./modificaciones"
import { toCents } from "./money"
import { construirTrasladoSimple, periodosAbiertos, type RubroTraslado } from "./traslado-simple"

const PERIODOS = ["2026-10", "2026-11", "2026-12", "2027-01"]
/** Today is November: October is closed; November, December and January are open. */
const ABIERTOS = periodosAbiertos(PERIODOS, "2026-11")

const rubro = (codigo: string, asignado: string, celdas: Record<string, string>): RubroTraslado => ({
  codigo,
  asignado,
  celdas: Object.entries(celdas).map(([periodo, valor]) => ({ periodo, valor })),
})

/** R12: 3M closed in October, 2M + 1M open, nothing in January. R13: 1M closed, 1M + 3M open. */
const LINEAS = [
  rubro("R12", "6000000.00", { "2026-10": "3000000.00", "2026-11": "2000000.00", "2026-12": "1000000.00" }),
  rubro("R13", "5000000.00", { "2026-10": "1000000.00", "2026-12": "1000000.00", "2027-01": "3000000.00" }),
  rubro("R15", "400000.00", { "2026-10": "400000.00" }),
]

const construir = (origen: string, destino: string, valor: string, lineas: readonly RubroTraslado[] = LINEAS) =>
  construirTrasladoSimple({ lineas, periodosAbiertos: ABIERTOS, origen, destino, valor: toCents(valor) })

const detalleDe = (resultado: ReturnType<typeof construirTrasladoSimple>) => {
  if (!resultado.ok) throw new Error(`Expected a detalle, got ${resultado.error.codigo}`)
  return resultado.detalle
}
const errorDe = (resultado: ReturnType<typeof construirTrasladoSimple>) => {
  if (resultado.ok) throw new Error("Expected an error, got a detalle")
  return resultado.error
}

describe("periodosAbiertos", () => {
  it("keeps the current period and the later ones, in order, and drops the elapsed ones", () => {
    expect(periodosAbiertos(PERIODOS, "2026-11")).toEqual(["2026-11", "2026-12", "2027-01"])
    expect(periodosAbiertos(PERIODOS, "2026-09")).toEqual(PERIODOS)
    expect(periodosAbiertos(PERIODOS, "2027-02")).toEqual([])
  })
})

describe("construirTrasladoSimple", () => {
  it("lowers the origin in proportion to its open cells, leaves the closed ones alone and puts the rounding cent on the last programmed one", () => {
    const detalle = detalleDe(construir("R12", "R13", "1000000"))

    // 1.000.000 over 2M : 1M -> 666.666,66 and 333.333,33; the missing cent goes to December, the last
    // open period WITH programming (January has none). October is closed: it is not in the detalle.
    expect(detalle.filter((d) => d.clave.startsWith("R12"))).toEqual([
      { elemento: "presupuesto", clave: "R12", campo: "asignado", antes: "6000000.00", despues: "5000000.00" },
      { elemento: "programacion", clave: "R12|2026-11", campo: "valor", antes: "2000000.00", despues: "1333333.34" },
      { elemento: "programacion", clave: "R12|2026-12", campo: "valor", antes: "1000000.00", despues: "666666.66" },
    ])
  })

  it("raises the destination in proportion to its open cells and puts the rounding cent on the last of them", () => {
    const detalle = detalleDe(construir("R12", "R13", "1000001.01"))

    // 1.000.001,01 over 1M : 3M -> 250.000,25 and 750.000,75 (floored); the missing cent goes to January.
    expect(detalle.filter((d) => d.clave.startsWith("R13"))).toEqual([
      { elemento: "presupuesto", clave: "R13", campo: "asignado", antes: "5000000.00", despues: "6000001.01" },
      { elemento: "programacion", clave: "R13|2026-12", campo: "valor", antes: "1000000.00", despues: "1250000.25" },
      { elemento: "programacion", clave: "R13|2027-01", campo: "valor", antes: "3000000.00", despues: "3750000.76" },
    ])
  })

  it("puts the whole amount on the current period when the destination has nothing programmed in open periods", () => {
    const detalle = detalleDe(construir("R12", "R15", "1000000"))

    expect(detalle.filter((d) => d.clave.startsWith("R15"))).toEqual([
      { elemento: "presupuesto", clave: "R15", campo: "asignado", antes: "400000.00", despues: "1400000.00" },
      { elemento: "programacion", clave: "R15|2026-11", campo: "valor", antes: "0.00", despues: "1000000.00" },
    ])
  })

  it("refuses an amount larger than what the origin has programmed in open periods, in Spanish, without a detalle", () => {
    // R12 has 3M open (the other 3M are in closed October); R15 has nothing open at all.
    expect(errorDe(construir("R12", "R13", "3000000.01"))).toEqual({
      codigo: "ORIGEN_INSUFICIENTE",
      mensaje:
        "El rubro «R12» solo tiene $ 3.000.000 programados desde el periodo actual: no se pueden trasladar $ 3.000.000,01.",
    })
    expect(errorDe(construir("R15", "R13", "1")).codigo).toBe("ORIGEN_INSUFICIENTE")
    // Exactly what is open can still be moved.
    expect(construir("R12", "R13", "3000000").ok).toBe(true)
  })

  it("never drives an origin cell below zero when the rounding cents do not fit in the last one", () => {
    const centavos = [rubro("R12", "0.03", { "2026-11": "0.01", "2026-12": "0.01", "2027-01": "0.01" }), LINEAS[1]!]
    const detalle = detalleDe(construir("R12", "R13", "0.02", centavos))

    // Every floored share is 0, so both cents are rounding: January absorbs one, December the other.
    expect(detalle.filter((d) => d.clave.startsWith("R12|"))).toEqual([
      { elemento: "programacion", clave: "R12|2026-12", campo: "valor", antes: "0.01", despues: "0.00" },
      { elemento: "programacion", clave: "R12|2027-01", campo: "valor", antes: "0.01", despues: "0.00" },
    ])
  })

  it("refuses the same rubro on both sides, a rubro outside the budget and an amount that is not positive", () => {
    expect(errorDe(construir("R12", "R12", "1000")).codigo).toBe("MISMO_RUBRO")
    expect(errorDe(construir("R12", "R99", "1000")).codigo).toBe("RUBRO_INEXISTENTE")
    expect(errorDe(construir("R12", "R13", "0")).codigo).toBe("VALOR_INVALIDO")
    expect(errorDe(construirTrasladoSimple({ lineas: LINEAS, periodosAbiertos: [], origen: "R12", destino: "R13", valor: toCents("1") })).codigo).toBe(
      "SIN_PERIODOS_ABIERTOS",
    )
  })

  it("builds a request the server rules accept: balanced programming, zero-sum and no elapsed period touched", () => {
    const live = liveF_V1()
    const lineas = live.presupuesto.map((r) =>
      rubro(
        r.rubro_codigo ?? "",
        r.asignado,
        Object.fromEntries(live.programacion.filter((c) => c.rubro_codigo === r.rubro_codigo).map((c) => [c.periodo, c.valor])),
      ),
    )
    const detalle = detalleDe(construir("R12", "R13", "1000000", lineas))

    const reglas = validarModificacion(live, { tipo: "TRASLADO", detalle }, new Map(), "2026-11", { bloqueaPeriodosPasados: true })
    expect(reglas).toEqual([])
    expect(detalle.some((d) => d.clave.endsWith("|2026-10"))).toBe(false)
  })
})
