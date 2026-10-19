// Pure S-curve math (S14 P7). The two curves are asserted SEPARATE: the
// technical one measures schedule progress, the financial one measures spend;
// they are never blended into a single number. `ejecutado` is null after the corte.

import { describe, expect, it } from "vitest"
import { avanceProgramado } from "./avance"
import {
  acumular,
  construirCurva,
  fechaMedicion,
  finDeMes,
  tecnicoPlaneado,
  type CurvaPunto,
} from "./curva"
import {
  F_C1_CORTE,
  F_C1_FINANCIERO_EJECUTADO,
  F_C1_FINANCIERO_PLANEADO,
  F_C1_PERIODOS,
  F_C1_TECNICO_EJECUTADO,
  fixtureF_C1Actividades,
} from "./__fixtures__/curva"

describe("finDeMes", () => {
  it("returns the last calendar day of a period", () => {
    expect(finDeMes("2026-01")).toBe("2026-01-31")
    expect(finDeMes("2026-04")).toBe("2026-04-30")
    expect(finDeMes("2026-12")).toBe("2026-12-31")
  })

  it("knows February, leap or not", () => {
    expect(finDeMes("2026-02")).toBe("2026-02-28")
    expect(finDeMes("2028-02")).toBe("2028-02-29")
  })
})

describe("fechaMedicion", () => {
  it("is the month end while the corte is later", () => {
    expect(fechaMedicion("2026-08", "2026-11-15")).toBe("2026-08-31")
  })

  it("is the corte date itself for the corte month (never a future date)", () => {
    expect(fechaMedicion("2026-11", "2026-11-15")).toBe("2026-11-15")
    expect(fechaMedicion("2026-11", "2026-11-30")).toBe("2026-11-30")
  })
})

describe("tecnicoPlaneado (D1: linear by days at month end)", () => {
  const periodos = F_C1_PERIODOS
  const actividades = fixtureF_C1Actividades()

  it("weights the elapsed fraction of every activity at each month end", () => {
    const planeado = tecnicoPlaneado(actividades, periodos).map((f) => Math.round(f * 1000) / 10)
    expect(planeado).toEqual([12.9, 27.1, 49.3, 70.7, 97.3])
  })

  it("stays within 0..1", () => {
    for (const fraccion of tecnicoPlaneado(actividades, periodos)) {
      expect(fraccion).toBeGreaterThanOrEqual(0)
      expect(fraccion).toBeLessThanOrEqual(1)
    }
  })

  it("is zero before the project starts and one once every activity ended", () => {
    expect(tecnicoPlaneado(actividades, ["2026-07"])).toEqual([0])
    expect(tecnicoPlaneado(actividades, ["2027-02"])).toEqual([1])
  })
})

describe("tecnicoPlaneado with a corte (D13: the corte month is evaluated at the corte date)", () => {
  const periodos = F_C1_PERIODOS
  const actividades = fixtureF_C1Actividades()
  const corte = { periodo: F_C1_CORTE, fecha: "2026-11-15" }
  const pct = (fracciones: number[]) => fracciones.map((f) => Math.round(f * 1000) / 10)

  it("evaluates only the corte month at the corte date; past and future months keep the month end", () => {
    // 2026-11-15: A1 done, A2 (09-28..12-06, 70 days) 49 days in = 0.7, A3 not started
    // -> (2 * 1 + 4 * 0.7) / 8 = 60 %. Month end (11-30) would be 70.7 %.
    expect(pct(tecnicoPlaneado(actividades, periodos, corte))).toEqual([12.9, 27.1, 49.3, 60, 97.3])
  })

  it("uses the very same formula as the technical KPI at that date", () => {
    const fila = tecnicoPlaneado(actividades, periodos, corte)[periodos.indexOf(F_C1_CORTE)]
    expect(fila).toBe(avanceProgramado([...actividades], "2026-11-15"))
  })

  it("is the month end when the corte is the last day of the month", () => {
    const alFin = tecnicoPlaneado(actividades, periodos, { periodo: F_C1_CORTE, fecha: "2026-11-30" })
    expect(alFin).toEqual(tecnicoPlaneado(actividades, periodos))
  })

  it("never plans past the month-end value of the same month and keeps the series monotonic", () => {
    const conCorte = tecnicoPlaneado(actividades, periodos, corte)
    const finDeMesSerie = tecnicoPlaneado(actividades, periodos)
    conCorte.forEach((valor, i) => expect(valor).toBeLessThanOrEqual(finDeMesSerie[i]))
    for (let i = 1; i < conCorte.length; i += 1) expect(conCorte[i]).toBeGreaterThanOrEqual(conCorte[i - 1])
  })

  it("leaves every month at month end when the corte period is not among the periods", () => {
    expect(tecnicoPlaneado(actividades, periodos, { periodo: "2027-03", fecha: "2027-03-10" })).toEqual(
      tecnicoPlaneado(actividades, periodos),
    )
  })
})

describe("acumular", () => {
  it("turns a monthly series into its cumulative one, index-aligned", () => {
    expect(acumular([1, 2, 3, 4])).toEqual([1, 3, 6, 10])
    expect(acumular([])).toEqual([])
    expect(acumular([5])).toEqual([5])
  })
})

describe("construirCurva with the D13 planned technical series", () => {
  it("paints the planned value at the corte in the corte month and keeps ejecutado null after it", () => {
    const filas = construirCurva({
      periodos: F_C1_PERIODOS,
      corte: F_C1_CORTE,
      tecnico: {
        planeado: tecnicoPlaneado(fixtureF_C1Actividades(), F_C1_PERIODOS, { periodo: F_C1_CORTE, fecha: "2026-11-15" }),
        ejecutado: F_C1_TECNICO_EJECUTADO,
      },
      financiero: { planeado: F_C1_FINANCIERO_PLANEADO, ejecutado: F_C1_FINANCIERO_EJECUTADO },
    })
    expect(filas.map((f) => f.tecnico.planeado)).toEqual([12.9, 27.1, 49.3, 60, 97.3])
    expect(filas.map((f) => f.tecnico.ejecutado)).toEqual([5, 20, 40, 65, null])
    // The financial plan is untouched by D13.
    expect(filas.map((f) => f.financiero.planeado)).toEqual([10, 30, 55, 80, 100])
  })
})

describe("construirCurva", () => {
  const periodos = F_C1_PERIODOS
  const entrada = {
    periodos,
    corte: F_C1_CORTE,
    tecnico: { planeado: tecnicoPlaneado(fixtureF_C1Actividades(), periodos), ejecutado: F_C1_TECNICO_EJECUTADO },
    financiero: { planeado: F_C1_FINANCIERO_PLANEADO, ejecutado: F_C1_FINANCIERO_EJECUTADO },
  }

  it("returns one row per period, in order, as percentages with one decimal", () => {
    const filas = construirCurva(entrada)
    expect(filas.map((f) => f.periodo)).toEqual(periodos)
    expect(filas.map((f) => f.tecnico.planeado)).toEqual([12.9, 27.1, 49.3, 70.7, 97.3])
    expect(filas.map((f) => f.financiero.planeado)).toEqual([10, 30, 55, 80, 100])
  })

  it("nulls the executed line for every period after the corte", () => {
    const filas = construirCurva(entrada)
    expect(filas.map((f) => f.tecnico.ejecutado)).toEqual([5, 20, 40, 65, null])
    expect(filas.map((f) => f.financiero.ejecutado)).toEqual([8, 25, 45, 60, null])
  })

  it("keeps the two curves separate: a change in one never moves the other", () => {
    const soloTecnico = construirCurva({
      ...entrada,
      tecnico: { ...entrada.tecnico, ejecutado: [0, 0, 0, 0, 0] },
    })
    const base = construirCurva(entrada)
    expect(soloTecnico.map((f) => f.financiero)).toEqual(base.map((f) => f.financiero))
    expect(soloTecnico.map((f) => f.tecnico.ejecutado)).not.toEqual(base.map((f) => f.tecnico.ejecutado))
  })

  it("paints the whole plan even after the corte, and no execution", () => {
    const filas: CurvaPunto[] = construirCurva(entrada)
    const ultima = filas[filas.length - 1]
    expect(ultima.tecnico.planeado).toBeGreaterThan(0)
    expect(ultima.tecnico.ejecutado).toBeNull()
    expect(ultima.financiero.ejecutado).toBeNull()
  })

  it("throws when a series does not line up with the periods", () => {
    expect(() =>
      construirCurva({ ...entrada, financiero: { planeado: [1], ejecutado: [1] } }),
    ).toThrow(RangeError)
  })

  it("rounds half-up at one decimal (13.55 -> 13.6)", () => {
    const filas = construirCurva({
      periodos: ["2026-08"],
      corte: "2026-08",
      tecnico: { planeado: [0.1355], ejecutado: [0.1004] },
      financiero: { planeado: [0.1349], ejecutado: [0.0996] },
    })
    expect(filas[0].tecnico.planeado).toBe(13.6)
    expect(filas[0].tecnico.ejecutado).toBe(10)
    expect(filas[0].financiero.planeado).toBe(13.5)
    expect(filas[0].financiero.ejecutado).toBe(10)
  })
})
