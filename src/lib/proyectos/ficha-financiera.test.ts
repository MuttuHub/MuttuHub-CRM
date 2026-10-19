import { describe, expect, it } from "vitest"
import { formatPercent, fromCents, toCents } from "./money"
import {
  computeFicha,
  controlProgramacion,
  excederiaAsignado,
  precondicionesPresupuesto,
  validadoAcumulado,
} from "./ficha-financiera"
import { F_F1_CORTE, F_F1_PERIODOS, F_F1_TOLERANCIA_BP, fixtureF_F1 } from "./__fixtures__/financiero"

const sheet = () => computeFicha({ rubros: fixtureF_F1(), corte: F_F1_CORTE, toleranciaBp: F_F1_TOLERANCIA_BP })
const money = (c: bigint) => fromCents(c)

describe("computeFicha F-F1 (corte 2026-11)", () => {
  it("G1 Personal: P and E cumulative, verde because E <= P", () => {
    const r = sheet().rubros[0]
    expect(r.codigo).toBe("R01")
    expect(money(r.asignado)).toBe("59500000.00")
    expect(money(r.programado)).toBe("29750000.00")
    expect(money(r.ejecutado)).toBe("27000000.00")
    expect(money(r.diferencia)).toBe("-2750000.00")
    expect(r.epTenths).toBe(BigInt(908))
    expect(r.eaTenths).toBe(BigInt(454))
    expect(money(r.umbralRojo)).toBe("32725000.00")
    expect(r.color).toBe("verde")
  })

  it("G2 Transporte: E above the tolerance threshold is rojo", () => {
    const r = sheet().rubros[1]
    expect(money(r.programado)).toBe("12000000.00")
    expect(money(r.ejecutado)).toBe("13500000.00")
    expect(money(r.diferencia)).toBe("1500000.00")
    expect(r.epTenths).toBe(BigInt(1125))
    expect(money(r.umbralRojo)).toBe("13200000.00")
    expect(r.color).toBe("rojo")
  })

  it("56,25 rounds up to 56,3", () => {
    const r = sheet().rubros[1]
    expect(r.eaTenths).toBe(BigInt(563))
    expect(formatPercent(r.eaTenths)).toBe("56,3 %")
  })

  it("G7 total row applies the same formulas to the sums", () => {
    const t = sheet().total
    expect(t.rubroId).toBeNull()
    expect(money(t.asignado)).toBe("83500000.00")
    expect(money(t.programado)).toBe("41750000.00")
    expect(money(t.ejecutado)).toBe("40500000.00")
    expect(money(t.diferencia)).toBe("-1250000.00")
    expect(t.epTenths).toBe(BigInt(970))
    expect(t.eaTenths).toBe(BigInt(485))
    expect(money(t.umbralRojo)).toBe("45925000.00")
    expect(t.color).toBe("verde")
  })

  it("REGISTRADO, RECHAZADO, ANULADO and later periods never move E", () => {
    const rubros = fixtureF_F1()
    rubros[0].gastos.push({ periodo: "2026-10", valor: toCents("1000"), estado: "ANULADO" })
    const r = computeFicha({ rubros, corte: F_F1_CORTE, toleranciaBp: F_F1_TOLERANCIA_BP }).rubros[0]
    expect(money(r.ejecutado)).toBe("27000000.00")
  })

  it("G5 corte 2027-01: E above A is rojo", () => {
    const rubros = fixtureF_F1()
    rubros[1].gastos.push({ periodo: "2027-01", valor: toCents("11000000"), estado: "VALIDADO" })
    const r = computeFicha({ rubros, corte: "2027-01", toleranciaBp: F_F1_TOLERANCIA_BP }).rubros[1]
    expect(money(r.programado)).toBe("24000000.00")
    expect(money(r.ejecutado)).toBe("24500000.00")
    expect(r.color).toBe("rojo")
  })

  it("null percentages when P or A is zero", () => {
    const r = computeFicha({
      rubros: [{ rubroId: "x", codigo: null, nombre: "Heredado", asignado: toCents("0"), programacion: [], gastos: [] }],
      corte: F_F1_CORTE,
      toleranciaBp: F_F1_TOLERANCIA_BP,
    }).rubros[0]
    expect(r.epTenths).toBeNull()
    expect(r.eaTenths).toBeNull()
    expect(r.codigo).toBeNull()
    expect(r.color).toBe("verde")
  })

  it("no float: 0.1 + 0.2 amounts are exact", () => {
    const r = computeFicha({
      rubros: [
        {
          rubroId: "x",
          codigo: "R99",
          nombre: "Float",
          asignado: toCents("1"),
          programacion: [
            { periodo: "2026-10", valor: toCents("0.1") },
            { periodo: "2026-11", valor: toCents("0.2") },
          ],
          gastos: [],
        },
      ],
      corte: "2026-11",
      toleranciaBp: F_F1_TOLERANCIA_BP,
    }).rubros[0]
    expect(money(r.programado)).toBe("0.30")
  })
})

describe("validadoAcumulado and excederiaAsignado", () => {
  const gastos = [
    { periodo: "2026-10", valor: toCents("100"), estado: "VALIDADO" as const },
    { periodo: "2027-01", valor: toCents("50"), estado: "VALIDADO" as const },
    { periodo: "2026-10", valor: toCents("999"), estado: "REGISTRADO" as const },
  ]
  it("sums VALIDADO of any period", () => {
    expect(money(validadoAcumulado(gastos))).toBe("150.00")
  })
  it("flags validado + nuevo > asignado only when strictly above", () => {
    const asignado = toCents("200")
    expect(excederiaAsignado({ asignado, validado: toCents("150"), nuevo: toCents("50") })).toBe(false)
    expect(excederiaAsignado({ asignado, validado: toCents("150"), nuevo: toCents("50.01") })).toBe(true)
  })
})

describe("controlProgramacion", () => {
  it("is the sum of cells minus the assigned amount", () => {
    expect(money(controlProgramacion(toCents("100"), [toCents("60"), toCents("30")]))).toBe("-10.00")
    expect(money(controlProgramacion(toCents("100"), [toCents("60"), toCents("40")]))).toBe("0.00")
  })
})

describe("precondicionesPresupuesto", () => {
  const base = () => ({
    valorTotal: toCents("100"),
    lineas: [{ rubroId: "a", nombre: "A", asignado: toCents("100"), activo: true }],
    programacion: [
      { rubroId: "a", periodo: "2026-10", valor: toCents("60") },
      { rubroId: "a", periodo: "2026-11", valor: toCents("40") },
    ],
    periodosProyecto: F_F1_PERIODOS,
  })

  it("is empty for a balanced budget", () => {
    expect(precondicionesPresupuesto(base())).toEqual([])
  })

  it("lists the sum mismatch with its Spanish copy", () => {
    const input = base()
    input.valorTotal = toCents("150")
    const [fail] = precondicionesPresupuesto(input)
    expect(fail.codigo).toBe("SUMA_DISTINTA_VALOR_TOTAL")
    expect(fail.mensaje).toBe(
      "La suma del presupuesto ($ 100) no es igual al valor total del proyecto ($ 150); diferencia -$ 50.",
    )
  })

  it("lists a control != 0, pending programming, a suspended line with A > 0 and out-of-range periods", () => {
    const input = base()
    input.programacion = [{ rubroId: "a", periodo: "2030-01", valor: toCents("10") }]
    input.lineas.push({ rubroId: "s", nombre: "Suspendido", asignado: toCents("0.01"), activo: false })
    input.valorTotal = toCents("100.01")
    const codes = precondicionesPresupuesto(input).map((f) => f.codigo)
    expect(codes).toContain("CONTROL_PROGRAMACION")
    expect(codes).toContain("RUBRO_SUSPENDIDO_CON_ASIGNADO")
    expect(codes).toContain("PERIODO_FUERA_DE_RANGO")
    expect(codes).not.toContain("SUMA_DISTINTA_VALOR_TOTAL")

    input.programacion = []
    expect(precondicionesPresupuesto(input).map((f) => f.codigo)).toContain("PROGRAMACION_PENDIENTE")
  })
})
