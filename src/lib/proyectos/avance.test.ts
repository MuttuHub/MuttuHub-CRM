import { describe, expect, it } from "vitest"
import {
  acumuladoContable,
  avanceActividad,
  avanceEntregable,
  avanceProgramado,
  avanceReal,
  calcularTecnico,
  desviacionPp,
  diferenciaRealPlanPp,
  entregableCompleto,
  entregablesCompletos,
  estadoActividad,
  fechaCumplimiento,
  fraccionTiempo,
  tendencia,
  validarNuevoReporte,
  type ActividadTecnicaInput,
  type AvanceInput,
  type ReporteActividadInput,
} from "./avance"
import { pesoActividad } from "./actividad"
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

describe("calcularTecnico — the project advance weights each activity by its weeks (AJ-02, S5)", () => {
  it("gives 46,7 % for a 4-week activity at 20 % plus a 2-week activity at 100 %", () => {
    const tecnico = calcularTecnico({
      corte: "2026-02-16",
      requiereMedio: false,
      actividades: [
        {
          id: "a1",
          codigo: "1.1",
          peso: pesoActividad({ semana_inicio: 1, semana_fin: 4 }),
          inicio: "2026-01-05",
          fin: "2026-02-01",
          entregables: [],
          reportes: [{ fecha: "2026-01-20", porcentaje: 20 }],
        },
        {
          id: "a2",
          codigo: "1.2",
          peso: pesoActividad({ semana_inicio: 5, semana_fin: 6 }),
          inicio: "2026-02-02",
          fin: "2026-02-15",
          entregables: [],
          reportes: [{ fecha: "2026-02-10", porcentaje: 100 }],
        },
      ],
    })

    // (4 × 0,20 + 2 × 1,00) / 6 = 46,67 %
    expect(tecnico.avance_real).toBeCloseTo(0.4667, 4)
  })
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

  it("exposes the user-facing difference as real - plan (positive when ahead), the sign flip of desviacionPp", () => {
    expect(diferenciaRealPlanPp(desviacionPp(0.204, 0.321))).toBeCloseTo(11.7)
    expect(diferenciaRealPlanPp(desviacionPp(0.5, 0.25))).toBeCloseTo(-25)
    expect(Object.is(diferenciaRealPlanPp(0), 0)).toBe(true)
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

  it("never returns to NO_INICIADA once there is a report, even before the elapsed-time trigger (S2/S3)", () => {
    expect(
      estadoActividad({
        ...base,
        progreso: 0.3,
        corte: "2026-10-01",
        fechaCumplimiento: null,
        hasReports: true,
        entregablesCompletos: false,
      }),
    ).toBe("EN_CURSO")
  })

  it("only finishes once entregablesCompletos is true, regardless of the reported percentage (S8)", () => {
    expect(
      estadoActividad({
        ...base,
        progreso: 1,
        corte: "2026-10-12",
        fechaCumplimiento: null,
        hasReports: true,
        entregablesCompletos: false,
      }),
    ).toBe("EN_CURSO")
    expect(
      estadoActividad({
        ...base,
        progreso: 1,
        corte: "2026-10-12",
        fechaCumplimiento: "2026-10-11",
        hasReports: true,
        entregablesCompletos: true,
      }),
    ).toBe("FINALIZADA")
    expect(
      estadoActividad({
        ...base,
        progreso: 1,
        corte: "2026-10-20",
        fechaCumplimiento: "2026-10-12",
        hasReports: true,
        entregablesCompletos: true,
      }),
    ).toBe("FINALIZADA_CON_RETRASO")
  })
})

describe("entregableCompleto / entregablesCompletos (S8)", () => {
  const completo = { id: "e1", meta: 2, avances: [av("2026-10-06", 2)] }
  const sinMedio = { id: "e2", meta: 2, avances: [av("2026-10-06", 2, { tieneMedio: false })] }
  const cantidadIncompleta = { id: "e3", meta: 2, avances: [av("2026-10-06", 1)] }

  it("is complete only when the goal is reached AND there is a live medio", () => {
    expect(entregableCompleto(completo, true)).toBe(true)
    // reaches the quantity but has no live medio at all — "whatever avance_requiere_medio says" (mirrors kpis.ts)
    expect(entregableCompleto(sinMedio, false)).toBe(false)
    expect(entregableCompleto(cantidadIncompleta, true)).toBe(false)
  })

  it("requires every deliverable complete, and is false without deliverables", () => {
    expect(entregablesCompletos([completo], true)).toBe(true)
    expect(entregablesCompletos([completo, cantidadIncompleta], true)).toBe(false)
    expect(entregablesCompletos([], true)).toBe(false)
  })
})

describe("validarNuevoReporte (S9.1-S9.4)", () => {
  it("accepts the exact accepted sequence 30% -> 70% -> 90% while incomplete (S3)", () => {
    expect(
      validarNuevoReporte({ porcentaje: 30, observacion: "inicio", reportes: [], entregablesCompletos: false, tope: 90 }),
    ).toEqual({ ok: true })
    expect(
      validarNuevoReporte({
        porcentaje: 70,
        observacion: "avance",
        reportes: [{ fecha: "2026-10-06", porcentaje: 30 }],
        entregablesCompletos: false,
        tope: 90,
      }),
    ).toEqual({ ok: true })
    expect(
      validarNuevoReporte({
        porcentaje: 90,
        observacion: "avance",
        reportes: [
          { fecha: "2026-10-06", porcentaje: 30 },
          { fecha: "2026-10-13", porcentaje: 70 },
        ],
        entregablesCompletos: false,
        tope: 90,
      }),
    ).toEqual({ ok: true })
  })

  it("rejects 70% and 50% against a last report of 70%, naming it exactly (S3)", () => {
    const reportes: ReporteActividadInput[] = [{ fecha: "2026-10-13", porcentaje: 70 }]
    expect(
      validarNuevoReporte({ porcentaje: 70, observacion: "x", reportes, entregablesCompletos: false, tope: 90 }),
    ).toEqual({ ok: false, message: "El avance debe ser mayor que el último reportado (70%)." })
    expect(
      validarNuevoReporte({ porcentaje: 50, observacion: "x", reportes, entregablesCompletos: false, tope: 90 }),
    ).toEqual({ ok: false, message: "El avance debe ser mayor que el último reportado (70%)." })
  })

  it("accepts the tope exactly and rejects over it while incomplete, naming the tope (S3)", () => {
    expect(
      validarNuevoReporte({ porcentaje: 90, observacion: "x", reportes: [], entregablesCompletos: false, tope: 90 }),
    ).toEqual({ ok: true })
    expect(
      validarNuevoReporte({ porcentaje: 95, observacion: "x", reportes: [], entregablesCompletos: false, tope: 90 }),
    ).toEqual({ ok: false, message: "El avance máximo sin entregables completos es 90%." })
  })

  it("allows exceeding the tope once deliverables are complete", () => {
    expect(
      validarNuevoReporte({ porcentaje: 100, observacion: "x", reportes: [], entregablesCompletos: true, tope: 90 }),
    ).toEqual({ ok: true })
  })

  it("rejects a missing or out-of-range percentage", () => {
    expect(
      validarNuevoReporte({ porcentaje: 0, observacion: "x", reportes: [], entregablesCompletos: false, tope: 90 }).ok,
    ).toBe(false)
    expect(
      validarNuevoReporte({ porcentaje: 101, observacion: "x", reportes: [], entregablesCompletos: false, tope: 90 }).ok,
    ).toBe(false)
  })

  it("rejects a missing observación (blank after trim)", () => {
    expect(
      validarNuevoReporte({ porcentaje: 30, observacion: "   ", reportes: [], entregablesCompletos: false, tope: 90 }).ok,
    ).toBe(false)
  })
})

describe("calcularTecnico with reportes (S8, full S3 accept-if list)", () => {
  function actividadConReportes(
    reportes: ReporteActividadInput[],
    entregables: ActividadTecnicaInput["entregables"],
  ): ActividadTecnicaInput {
    return { id: "x", codigo: "9.1", peso: 1, inicio: "2026-10-05", fin: "2026-10-11", entregables, reportes }
  }

  it("a 30% report on a Sin-iniciar activity moves it to En curso at 30%", () => {
    const actividades = [actividadConReportes([{ fecha: "2026-10-06", porcentaje: 30 }], [{ id: "e1", meta: 2, avances: [] }])]
    const r = calcularTecnico({ corte: "2026-10-07", requiereMedio: true, actividades })
    expect(r.actividades[0].progreso).toBe(0.3)
    expect(r.actividades[0].estado).toBe("EN_CURSO")
  })

  it("1 of 2 deliverables complete never reaches Terminada, even at a 100% report", () => {
    const actividades = [
      actividadConReportes(
        [{ fecha: "2026-10-06", porcentaje: 100 }],
        [
          { id: "e1", meta: 2, avances: [av("2026-10-06", 2)] },
          { id: "e2", meta: 2, avances: [av("2026-10-06", 1)] },
        ],
      ),
    ]
    const r = calcularTecnico({ corte: "2026-10-07", requiereMedio: true, actividades })
    expect(r.actividades[0].entregables_completos).toBe(false)
    expect(r.actividades[0].estado).toBe("EN_CURSO")
  })

  it("finishes once every deliverable is complete, progreso is the max of the report and the deliverable average", () => {
    const actividades = [
      actividadConReportes([{ fecha: "2026-10-06", porcentaje: 80 }], [{ id: "e1", meta: 2, avances: [av("2026-10-06", 2)] }]),
    ]
    const r = calcularTecnico({ corte: "2026-10-07", requiereMedio: true, actividades })
    expect(r.actividades[0].progreso).toBe(1)
    expect(r.actividades[0].entregables_completos).toBe(true)
    expect(r.actividades[0].estado).toBe("FINALIZADA")
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

  it("reports the date each finished activity was completed (latest deliverable), null otherwise", () => {
    const r = calcularTecnico({ corte: F_T1_CORTE, requiereMedio: true, actividades: fixtureF_T1() })
    expect(r.actividades.map((a) => [a.codigo, a.fecha_cumplimiento])).toEqual([
      ["1.1", "2026-10-09"],
      ["1.2", null],
      ["1.3", null],
      ["1.4", null],
    ])
  })

  it("returns zeros, not NaN, for a project without activities", () => {
    const r = calcularTecnico({ corte: F_T1_CORTE, requiereMedio: true, actividades: [] })
    expect(r).toMatchObject({ avance_real: 0, avance_programado: 0, desviacion_pp: 0, actividades: [] })
  })
})

describe("regression: hasReports=false computes byte-for-byte like before AJ-01 (S5.2)", () => {
  it("F-T1 (no `reportes` field on any activity) matches a recomputation via the pre-AJ-01 two-field path", () => {
    const requiereMedio = true
    const actividadesInput = fixtureF_T1()
    const nuevo = calcularTecnico({ corte: F_T1_CORTE, requiereMedio, actividades: actividadesInput })

    // Recomputed independently, the way `calcularTecnico` worked before this feature: plain
    // entregable-average progreso, and `estadoActividad` called with only its original fields
    // (no `hasReports`/`entregablesCompletos`), so this is the old EN_CURSO trigger verbatim.
    const viejo = actividadesInput.map((a) => {
      const progreso = avanceActividad(
        a.entregables.map((e) => avanceEntregable(acumuladoContable(e.avances, requiereMedio), e.meta)),
      )
      const fechas = a.entregables.map((e) => fechaCumplimiento(e.avances, e.meta, requiereMedio))
      const done = fechas.length > 0 && fechas.every((f) => f !== null)
      const cumplimiento = done ? (fechas as string[]).reduce((max, f) => ((f as string) > max ? (f as string) : max)) : null
      return {
        progreso,
        estado: estadoActividad({ progreso, inicio: a.inicio, fin: a.fin, corte: F_T1_CORTE, fechaCumplimiento: cumplimiento }),
      }
    })

    expect(nuevo.actividades.map((a) => ({ progreso: a.progreso, estado: a.estado }))).toEqual(viejo)
  })
})
