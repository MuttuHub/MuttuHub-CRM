import { describe, expect, it } from "vitest"
import { fromCents, sumCents, toCents } from "./money"
import { programacionDelPlan, proponerProgramacion } from "./programacion-propuesta"

const pesos = (celdas: { periodo: string; valor: bigint }[]) => celdas.map((c) => [c.periodo, fromCents(c.valor)])

describe("proponerProgramacion (T13, S7)", () => {
  it("splits by the days the activity occupies in each month: the PO example", () => {
    // «actividad del 19 de octubre al 15 de noviembre (28 días) con Transporte por $10.000.000: 13 días en octubre y
    // 15 en noviembre, se proponen $4.642.857 y $5.357.143.»
    const celdas = proponerProgramacion({
      valor: toCents("10000000"),
      actividad: { inicio: "2026-10-19", fin: "2026-11-15" },
      proyecto: { inicio: "2026-10-05", fin: "2027-01-29" },
      transversal: false,
    })
    expect(pesos(celdas)).toEqual([
      ["2026-10", "4642857.00"],
      ["2026-11", "5357143.00"],
    ])
  })

  it("adds what the rounding leaves to the last month, so the cells always sum the line value", () => {
    const valor = toCents("1000000.37")
    const celdas = proponerProgramacion({
      valor,
      actividad: { inicio: "2026-10-01", fin: "2026-12-31" },
      proyecto: { inicio: "2026-10-01", fin: "2026-12-31" },
      transversal: false,
    })
    expect(sumCents(celdas.map((c) => c.valor))).toBe(valor)
    // 31, 30 and 31 days of 92 over $1.000.000,37: whole pesos floored, the rest on December.
    expect(pesos(celdas)).toEqual([
      ["2026-10", "336956.00"],
      ["2026-11", "326087.00"],
      ["2026-12", "336957.37"],
    ])
  })

  it("splits a transversal activity evenly by month", () => {
    const celdas = proponerProgramacion({
      valor: toCents("1000000"),
      actividad: { inicio: "2026-10-05", fin: "2026-12-27" },
      proyecto: { inicio: "2026-10-05", fin: "2026-12-31" },
      transversal: true,
    })
    expect(pesos(celdas)).toEqual([
      ["2026-10", "333333.00"],
      ["2026-11", "333333.00"],
      ["2026-12", "333334.00"],
    ])
  })

  it("keeps the activity inside the project dates (its last week can run past fecha_fin)", () => {
    const celdas = proponerProgramacion({
      valor: toCents("300"),
      actividad: { inicio: "2026-12-28", fin: "2027-01-03" },
      proyecto: { inicio: "2026-10-05", fin: "2026-12-31" },
      transversal: false,
    })
    expect(pesos(celdas)).toEqual([["2026-12", "300.00"]])
  })

  it("proposes nothing for a zero line", () => {
    expect(
      proponerProgramacion({
        valor: toCents("0"),
        actividad: { inicio: "2026-10-19", fin: "2026-11-15" },
        proyecto: { inicio: "2026-10-05", fin: "2027-01-29" },
        transversal: false,
      }),
    ).toEqual([])
  })
})

describe("programacionDelPlan (T13.8, S7)", () => {
  // «En las transversales la propuesta sale pareja por mes, y el Gestor la ajusta.»
  it("proposes a Transversal activity evenly by month and a Normal one by days, from the plan's type", () => {
    const actividad = { objetivoCodigo: "", nombre: "", semanaInicio: 1, semanaFin: 17, responsableId: null }
    const propuesta = programacionDelPlan({
      proyecto: {
        fechaInicio: "2026-10-05",
        fechaFin: "2027-01-29",
        valorTotalCents: toCents("8000000"),
        beneficiariosMeta: 1,
        lineas: [],
        municipioIds: [],
      },
      actividades: [
        { ...actividad, codigo: "G.1", tipo: "TRANSVERSAL" },
        { ...actividad, codigo: "1.1", objetivoCodigo: "OE1", tipo: "NORMAL" },
      ],
      presupuesto: [
        { actividadCodigo: "G.1", rubroCodigo: "R01", cents: toCents("4000000") },
        { actividadCodigo: "1.1", rubroCodigo: "R01", cents: toCents("4000000") },
      ],
    })

    expect(pesos(propuesta.get("G.1|R01")!)).toEqual([
      ["2026-10", "1000000.00"],
      ["2026-11", "1000000.00"],
      ["2026-12", "1000000.00"],
      ["2027-01", "1000000.00"],
    ])
    // 27, 30, 31 and 29 days of 117.
    expect(pesos(propuesta.get("1.1|R01")!)).toEqual([
      ["2026-10", "923076.00"],
      ["2026-11", "1025641.00"],
      ["2026-12", "1059829.00"],
      ["2027-01", "991454.00"],
    ])
  })
})
