import { describe, expect, it } from "vitest"
import {
  acumuladoContable,
  avanceActividad,
  avanceEntregable,
  avanceProgramado,
  avanceReal,
  calcularTecnico,
  desviacionPp,
  estadoActividad,
  fechaCumplimiento,
  fraccionTiempo,
  tendencia,
  type AvanceInput,
} from "./avance"
import { colorTecnicoV2 } from "./semaforo-v2"
import { F_T1_CORTE, fixtureF_T1, fixtureF_T1b } from "./__fixtures__/tecnico"

const av = (fecha: string, cantidad: number, extra: Partial<AvanceInput> = {}): AvanceInput => ({
  fecha,
  cantidad,
  anulado: false,
  tieneMedio: true,
  createdAt: `${fecha}T00:00:00Z`,
  ...extra,
})

describe("avanceEntregable / avanceActividad / avanceReal", () => {
  it("caps a deliverable at 1 and treats a non-positive goal as 0", () => {
    expect(avanceEntregable(1, 2)).toBe(0.5)
    expect(avanceEntregable(5, 2)).toBe(1)
    expect(avanceEntregable(3, 0)).toBe(0)
    expect(avanceEntregable(3, -1)).toBe(0)
  })

  it("averages an activity and returns 0 (not NaN) without deliverables", () => {
    expect(avanceActividad([1, 0.5])).toBe(0.75)
    expect(avanceActividad([])).toBe(0)
  })

  it("weights the project and returns 0 when the total weight is 0", () => {
    expect(avanceReal([{ peso: 1, progreso: 1 }, { peso: 3, progreso: 0 }])).toBe(0.25)
    expect(avanceReal([])).toBe(0)
    expect(avanceReal([{ peso: 0, progreso: 1 }])).toBe(0)
  })
})

describe("fraccionTiempo / avanceProgramado / desviacionPp", () => {
  it("clamps the elapsed fraction of an activity to [0, 1]", () => {
    expect(fraccionTiempo("2026-10-04", "2026-10-05", "2026-10-11")).toBe(0)
    expect(fraccionTiempo("2026-10-05", "2026-10-05", "2026-10-11")).toBeCloseTo(1 / 7)
    expect(fraccionTiempo("2026-10-25", "2026-10-19", "2026-11-15")).toBe(0.25)
    expect(fraccionTiempo("2027-01-01", "2026-10-19", "2026-11-15")).toBe(1)
  })

  it("returns 0 programmed with no weight and the weighted fraction otherwise", () => {
    expect(avanceProgramado([], "2026-10-25")).toBe(0)
    expect(
      avanceProgramado(
        [
          { peso: 1, inicio: "2026-10-19", fin: "2026-10-25" },
          { peso: 3, inicio: "2026-10-26", fin: "2026-11-01" },
        ],
        "2026-10-25",
      ),
    ).toBe(0.25)
  })

  it("expresses the deviation in percentage points (negative when ahead)", () => {
    expect(desviacionPp(0.5, 0.25)).toBeCloseTo(25)
    expect(desviacionPp(0.2, 0.5)).toBeCloseTo(-30)
  })
})

describe("acumuladoContable", () => {
  const avances = [av("2026-10-01", 1), av("2026-10-02", 2, { tieneMedio: false }), av("2026-10-03", 4, { anulado: true })]

  it("excludes voided avances always and unsupported ones when a medio is required", () => {
    expect(acumuladoContable(avances, true)).toBe(1)
    expect(acumuladoContable(avances, false)).toBe(3)
    expect(acumuladoContable([], true)).toBe(0)
  })
})

describe("fechaCumplimiento", () => {
  it("is the date where the running counted sum first reaches the goal", () => {
    const avances = [av("2026-10-03", 1), av("2026-10-01", 1), av("2026-10-05", 1)]
    expect(fechaCumplimiento(avances, 2, true)).toBe("2026-10-03")
  })

  it("orders same-day avances by creation and returns null when never reached", () => {
    const avances = [
      av("2026-10-02", 1, { createdAt: "2026-10-02T10:00:00Z" }),
      av("2026-10-02", 1, { createdAt: "2026-10-02T09:00:00Z" }),
    ]
    expect(fechaCumplimiento(avances, 2, true)).toBe("2026-10-02")
    expect(fechaCumplimiento(avances, 3, true)).toBeNull()
    expect(fechaCumplimiento([av("2026-10-02", 5, { tieneMedio: false })], 2, true)).toBeNull()
    expect(fechaCumplimiento([], 0, true)).toBeNull()
  })
})

describe("estadoActividad", () => {
  const base = { inicio: "2026-10-05", fin: "2026-10-11" }

  it("derives the four estados", () => {
    expect(estadoActividad({ ...base, progreso: 1, corte: "2026-10-12", fechaCumplimiento: "2026-10-11" })).toBe("FINALIZADA")
    expect(estadoActividad({ ...base, progreso: 1, corte: "2026-10-20", fechaCumplimiento: "2026-10-12" })).toBe("FINALIZADA_CON_RETRASO")
    expect(estadoActividad({ ...base, progreso: 0, corte: "2026-10-04", fechaCumplimiento: null })).toBe("NO_INICIADA")
    expect(estadoActividad({ ...base, progreso: 0, corte: "2026-10-05", fechaCumplimiento: null })).toBe("EN_CURSO")
    expect(estadoActividad({ ...base, progreso: 0.3, corte: "2026-10-04", fechaCumplimiento: null })).toBe("EN_CURSO")
  })
})

describe("tendencia", () => {
  it("compares the last measurement with the previous one", () => {
    expect(tendencia(5, 3)).toBe("sube")
    expect(tendencia(2, 3)).toBe("baja")
    expect(tendencia(3, 3)).toBe("igual")
    expect(tendencia(3, null)).toBeNull()
    expect(tendencia(null, null)).toBeNull()
  })
})

describe("colorTecnicoV2 boundaries (float-safe)", () => {
  const u = { umbral1: 10, umbral2: 20 }
  it.each([
    [-5, "verde"],
    [0, "verde"],
    [10.0, "verde"],
    [10.1, "amarillo"],
    [20.0, "amarillo"],
    [20.1, "rojo"],
    [35.7, "rojo"],
    [(0.6 - 0.5) * 100, "verde"], // 9.999999999999998
    [(0.7 - 0.5) * 100, "amarillo"], // 19.999999999999996
  ])("deviation %s pp is %s", (pp, color) => {
    expect(colorTecnicoV2(pp, u)).toBe(color)
  })
})

describe("F-T1 golden", () => {
  it("is rojo: real 21.4 %, programmed 57.1 %, deviation 35.7 pp", () => {
    const r = calcularTecnico({ corte: F_T1_CORTE, requiereMedio: true, actividades: fixtureF_T1() })
    expect(r.avance_real).toBeCloseTo(1.5 / 7, 10)
    expect(r.avance_programado).toBeCloseTo(4 / 7, 10)
    expect(Math.round(r.avance_real * 1000) / 10).toBe(21.4)
    expect(Math.round(r.avance_programado * 1000) / 10).toBe(57.1)
    expect(Math.round(r.desviacion_pp * 10) / 10).toBe(35.7)
    expect(colorTecnicoV2(r.desviacion_pp, { umbral1: 10, umbral2: 20 })).toBe("rojo")
    expect(r.actividades.map((a) => [a.codigo, a.progreso, a.estado])).toEqual([
      ["1.1", 1, "FINALIZADA"],
      ["1.2", 0.5, "EN_CURSO"],
      ["1.3", 0, "EN_CURSO"],
      ["1.4", 0, "EN_CURSO"],
    ])
  })

  it("F-T1b: an uncounted avance changes nothing when a medio is required", () => {
    const r = calcularTecnico({ corte: F_T1_CORTE, requiereMedio: true, actividades: fixtureF_T1b() })
    expect(r.avance_real).toBeCloseTo(1.5 / 7, 10)
  })

  it("F-T1b: with requiereMedio=false the avance counts (1.3 = 0.25, real = 0.25)", () => {
    const r = calcularTecnico({ corte: F_T1_CORTE, requiereMedio: false, actividades: fixtureF_T1b() })
    expect(r.actividades.find((a) => a.codigo === "1.3")!.progreso).toBe(0.25)
    expect(r.avance_real).toBeCloseTo(0.25, 10)
  })

  it("returns zeros, not NaN, for a project without activities", () => {
    const r = calcularTecnico({ corte: F_T1_CORTE, requiereMedio: true, actividades: [] })
    expect(r).toMatchObject({ avance_real: 0, avance_programado: 0, desviacion_pp: 0, actividades: [] })
  })
})
