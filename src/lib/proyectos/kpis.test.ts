import { describe, expect, it } from "vitest"
import { PARAMETROS_V2_DEFAULT, type ParametrosV2 } from "./semaforo-v2"
import { toCents } from "./money"
import {
  beneficiariosVsMeta,
  cumplimientoCronograma,
  cumplimientoIndicadores,
  entregablesLogrados,
  kpisPortafolio,
  kpisProyecto,
  type KpiActividadInput,
  type KpiProyectoInput,
} from "./kpis"

const CORTE = "2026-03-31"

const avance = (fecha: string, cantidad: number, tieneMedio = true) => ({
  fecha,
  cantidad,
  anulado: false,
  tieneMedio,
  createdAt: `${fecha}T12:00:00.000Z`,
})

function actividad(over: Partial<KpiActividadInput> & { id: string }): KpiActividadInput {
  return {
    codigo: over.id,
    peso: 1,
    inicio: "2026-01-01",
    fin: "2026-02-28",
    entregables: [{ id: `${over.id}-e1`, meta: 10, avances: [avance("2026-02-10", 10)] }],
    ...over,
  }
}

const CONFIRMADOS: ParametrosV2 = {
  ...PARAMETROS_V2_DEFAULT,
  umbral1: { valor: 10, confirmado: true },
  umbral2: { valor: 20, confirmado: true },
  tolerancia: { valor: 10, confirmado: true },
  retraso: { valor: 70, confirmado: true },
}

function proyecto(over: Partial<KpiProyectoInput> = {}): KpiProyectoInput {
  return {
    corte: CORTE,
    estado: "EN_EJECUCION",
    parametros: PARAMETROS_V2_DEFAULT,
    actividades: [actividad({ id: "A1" })],
    indicadores: [],
    beneficiarios: { total: 50, meta: 100 },
    financiero: { asignado: toCents("1000"), programado: toCents("500"), ejecutado: toCents("400") },
    ...over,
  }
}

describe("cumplimientoCronograma", () => {
  const base = { corte: CORTE }
  it("ignores activities ending after the corte", () => {
    const r = cumplimientoCronograma([{ fin: "2026-02-28", estado: "FINALIZADA" }, { fin: "2026-04-30", estado: "NO_INICIADA" }], base.corte)
    expect(r.vencidas).toBe(1)
    expect(r.valor).toBe(100)
  })
  it("counts FINALIZADA_CON_RETRASO as late (not on time)", () => {
    const r = cumplimientoCronograma([{ fin: "2026-02-28", estado: "FINALIZADA" }, { fin: "2026-03-01", estado: "FINALIZADA_CON_RETRASO" }], base.corte)
    expect(r).toMatchObject({ vencidas: 2, a_tiempo: 1, valor: 50, corte: CORTE })
  })
  it("denominator 0 yields null, never 0", () => {
    expect(cumplimientoCronograma([{ fin: "2026-04-30", estado: "EN_CURSO" }], base.corte).valor).toBeNull()
    expect(cumplimientoCronograma([], base.corte).valor).toBeNull()
  })
  it("the corte day itself is due", () => {
    expect(cumplimientoCronograma([{ fin: CORTE, estado: "EN_CURSO" }], CORTE).vencidas).toBe(1)
  })
})

describe("atrasadas (D3)", () => {
  it("counts due activities below 100 % and never the ones finished late", () => {
    const r = cumplimientoCronograma(
      [
        { fin: "2026-02-28", estado: "FINALIZADA" },
        { fin: "2026-02-28", estado: "FINALIZADA_CON_RETRASO" },
        { fin: "2026-03-10", estado: "EN_CURSO" },
        { fin: "2026-03-31", estado: "NO_INICIADA" },
        { fin: "2026-04-30", estado: "EN_CURSO" },
      ],
      CORTE,
    )
    expect(r).toMatchObject({ vencidas: 4, a_tiempo: 1, atrasadas: 2 })
  })
  it("kpisProyecto exposes it, 0 when everything due is finished", () => {
    const tarde = actividad({ id: "T", fin: "2026-03-01", entregables: [{ id: "T-e", meta: 10, avances: [avance("2026-03-20", 10)] }] })
    const abierta = actividad({ id: "O", fin: "2026-03-15", entregables: [{ id: "O-e", meta: 10, avances: [avance("2026-03-10", 4)] }] })
    expect(kpisProyecto(proyecto({ actividades: [tarde, abierta] })).cronograma?.atrasadas).toBe(1)
    expect(kpisProyecto(proyecto()).cronograma?.atrasadas).toBe(0)
  })
})

describe("entregablesLogrados", () => {
  it("requires the goal met AND a live support", () => {
    const acts = [
      actividad({
        id: "A1",
        entregables: [
          { id: "ok", meta: 10, avances: [avance("2026-02-01", 10)] },
          { id: "sinSoporte", meta: 10, avances: [avance("2026-02-01", 10, false)] },
          { id: "incompleto", meta: 10, avances: [avance("2026-02-01", 4)] },
        ],
      }),
    ]
    const r = entregablesLogrados(acts, CORTE, false)
    expect(r).toMatchObject({ programados: 3, logrados: 1, valor: 33.3, corte: CORTE })
  })
  it("only counts deliverables of activities due by the corte (D2)", () => {
    const acts = [actividad({ id: "A1" }), actividad({ id: "A2", fin: "2026-06-30" })]
    expect(entregablesLogrados(acts, CORTE, true).programados).toBe(1)
  })
  it("no programados yields null", () => {
    expect(entregablesLogrados([actividad({ id: "A2", fin: "2026-06-30" })], CORTE, true).valor).toBeNull()
  })
  it("a voided avance does not count", () => {
    const acts = [actividad({ id: "A1", entregables: [{ id: "e", meta: 5, avances: [{ ...avance("2026-02-01", 5), anulado: true }] }] })]
    expect(entregablesLogrados(acts, CORTE, true).logrados).toBe(0)
  })
  it("a non-positive goal is never achieved", () => {
    const acts = [actividad({ id: "A1", entregables: [{ id: "e", meta: 0, avances: [avance("2026-02-01", 1)] }] })]
    expect(entregablesLogrados(acts, CORTE, true).logrados).toBe(0)
  })
})

describe("cumplimientoIndicadores", () => {
  const med = (fecha: string, valor: number, anulado = false) => ({ fecha, valor, anulado, createdAt: `${fecha}T00:00:00Z` })
  it("caps each indicator at 1 and averages the measured ones", () => {
    const r = cumplimientoIndicadores(
      [
        { id: "i1", meta: 100, mediciones: [med("2026-01-10", 150)] },
        { id: "i2", meta: 100, mediciones: [med("2026-01-10", 50)] },
      ],
      CORTE,
    )
    expect(r).toMatchObject({ valor: 75, medidos: 2, sin_medir: 0, corte: CORTE })
  })
  it("uses the last measurement by fecha", () => {
    const r = cumplimientoIndicadores([{ id: "i1", meta: 100, mediciones: [med("2026-02-01", 90), med("2026-01-01", 10)] }], CORTE)
    expect(r.valor).toBe(90)
  })
  it("excludes unmeasured (none, voided, after corte, meta <= 0) and reports them", () => {
    const r = cumplimientoIndicadores(
      [
        { id: "i1", meta: 100, mediciones: [med("2026-01-10", 100)] },
        { id: "sin", meta: 100, mediciones: [] },
        { id: "anulada", meta: 100, mediciones: [med("2026-01-10", 100, true)] },
        { id: "futura", meta: 100, mediciones: [med("2026-05-10", 100)] },
        { id: "meta0", meta: 0, mediciones: [med("2026-01-10", 5)] },
      ],
      CORTE,
    )
    expect(r).toMatchObject({ valor: 100, medidos: 1, sin_medir: 4 })
    expect(r.sin_medir_ids).toEqual(["sin", "anulada", "futura", "meta0"])
  })
  it("nothing measured yields null", () => {
    expect(cumplimientoIndicadores([{ id: "x", meta: 1, mediciones: [] }], CORTE).valor).toBeNull()
  })
  it("counts en_meta: measured indicators whose last measurement reaches the goal", () => {
    const r = cumplimientoIndicadores(
      [
        { id: "ok", meta: 100, mediciones: [med("2026-01-10", 100)] },
        { id: "sobre", meta: 100, mediciones: [med("2026-01-10", 150)] },
        { id: "debajo", meta: 100, mediciones: [med("2026-01-10", 99)] },
        { id: "cayo", meta: 100, mediciones: [med("2026-01-10", 120), med("2026-02-10", 80)] },
        { id: "sin-medicion", meta: 100, mediciones: [] },
        { id: "sin-meta", meta: 0, mediciones: [med("2026-01-10", 5)] },
      ],
      CORTE,
    )
    expect(r.en_meta).toBe(2)
    expect(r.medidos).toBe(4)
  })
  it("en_meta is 0 when nothing is measured", () => {
    expect(cumplimientoIndicadores([{ id: "x", meta: 1, mediciones: [] }], CORTE).en_meta).toBe(0)
  })
})

describe("beneficiariosVsMeta", () => {
  it("ratio with 1 decimal, not capped", () => {
    expect(beneficiariosVsMeta(150, 100, CORTE)).toEqual({ corte: CORTE, total: 150, meta: 100, valor: 150 })
    expect(beneficiariosVsMeta(1, 3, CORTE).valor).toBe(33.3)
  })
  it("meta null or 0 yields null", () => {
    expect(beneficiariosVsMeta(10, null, CORTE).valor).toBeNull()
    expect(beneficiariosVsMeta(10, 0, CORTE).valor).toBeNull()
  })
})

describe("kpisProyecto", () => {
  it("every KPI carries the corte", () => {
    const k = kpisProyecto(proyecto())
    expect(k.corte).toBe(CORTE)
    for (const part of [k.tecnico, k.cronograma, k.entregables, k.indicadores, k.beneficiarios, k.financiero]) {
      expect(part).not.toBeNull()
      expect(part?.corte).toBe(CORTE)
    }
  })
  it("technical block mirrors calcularTecnico and the color", () => {
    const k = kpisProyecto(proyecto({ corte: "2026-01-31", actividades: [actividad({ id: "A1", entregables: [{ id: "e", meta: 10, avances: [] }] })] }))
    expect(k.tecnico?.avance_real).toBe(0)
    expect(k.tecnico?.avance_programado).toBeGreaterThan(0)
    expect(k.tecnico?.color).toBe("rojo")
  })
  it("financial block uses the totals of A/P/E", () => {
    const k = kpisProyecto(proyecto())
    expect(k.financiero).toMatchObject({ ea: 40, ep: 80, color: "verde", alerta_retraso: false })
  })
  it("a zero denominator in A or P yields null percentages", () => {
    const k = kpisProyecto(proyecto({ financiero: { asignado: toCents("0"), programado: toCents("0"), ejecutado: toCents("0") } }))
    expect(k.financiero).toMatchObject({ ea: null, ep: null })
  })
  it("BORRADOR yields null financials and no measurement", () => {
    const k = kpisProyecto(proyecto({ estado: "BORRADOR" }))
    expect(k.medible).toBe(false)
    expect(k.financiero).toBeNull()
    expect(k.tecnico).toBeNull()
    expect(k.corte).toBe(CORTE)
  })
  it("states outside EN_EJECUCION/SUSPENDIDO/CERRADO are not measured", () => {
    for (const estado of ["PLANIFICACION", "CANCELADO"] as const) expect(kpisProyecto(proyecto({ estado })).medible).toBe(false)
    for (const estado of ["EN_EJECUCION", "SUSPENDIDO", "CERRADO"] as const) expect(kpisProyecto(proyecto({ estado })).medible).toBe(true)
  })
  it("confirmado is true only when every semaforo parameter is confirmed", () => {
    expect(kpisProyecto(proyecto()).confirmado).toBe(false)
    expect(kpisProyecto(proyecto({ parametros: CONFIRMADOS })).confirmado).toBe(true)
    expect(kpisProyecto(proyecto({ parametros: { ...CONFIRMADOS, retraso: { valor: 70, confirmado: false } } })).confirmado).toBe(false)
  })
  it("the delay alert fires when spending is far below programmed and the technical color is not verde", () => {
    const k = kpisProyecto(
      proyecto({
        corte: "2026-01-31",
        actividades: [actividad({ id: "A1", entregables: [{ id: "e", meta: 10, avances: [] }] })],
        financiero: { asignado: toCents("1000"), programado: toCents("500"), ejecutado: toCents("100") },
      }),
    )
    expect(k.financiero?.alerta_retraso).toBe(true)
  })
})

describe("kpisPortafolio", () => {
  const fin = (A: string, P: string, E: string) => ({ asignado: toCents(A), programado: toCents(P), ejecutado: toCents(E) })
  it("financial percentages are money-weighted (ΣE/ΣA), not the mean of ratios", () => {
    const chico = kpisProyecto(proyecto({ financiero: fin("100", "100", "100") })) // 100 %
    const grande = kpisProyecto(proyecto({ financiero: fin("900", "900", "0") })) // 0 %
    const p = kpisPortafolio([chico, grande], CORTE)
    expect(p.financiero.ea).toBe(10) // 100/1000, the simple mean would be 50
    expect(p.financiero.asignado).toBe(toCents("1000"))
    expect(p.financiero.ejecutado).toBe(toCents("100"))
  })
  it("technical is the simple mean of the measured projects", () => {
    const sinAvance = kpisProyecto(proyecto({ actividades: [actividad({ id: "A", entregables: [{ id: "e", meta: 10, avances: [] }] })] }))
    const completo = kpisProyecto(proyecto())
    const p = kpisPortafolio([sinAvance, completo], CORTE)
    expect(p.tecnico.avance_real).toBe(((sinAvance.tecnico?.avance_real ?? 0) + (completo.tecnico?.avance_real ?? 0)) / 2)
    expect(p.tecnico.proyectos).toBe(2)
  })
  it("non-measured projects are counted by estado but excluded from the means", () => {
    const p = kpisPortafolio([kpisProyecto(proyecto()), kpisProyecto(proyecto({ estado: "BORRADOR" }))], CORTE)
    expect(p.por_estado).toEqual({ EN_EJECUCION: 1, BORRADOR: 1 })
    expect(p.tecnico.proyectos).toBe(1)
    expect(p.financiero.proyectos).toBe(1)
  })
  it("counts semaforo colors and echoes the corte", () => {
    const p = kpisPortafolio([kpisProyecto(proyecto())], CORTE)
    expect(p.corte).toBe(CORTE)
    expect(p.por_color_financiero.verde).toBe(1)
    expect(p.por_color_tecnico.verde + p.por_color_tecnico.amarillo + p.por_color_tecnico.rojo).toBe(1)
  })
  it("sums atrasadas and beneficiaries over the measured projects only", () => {
    const abierta = actividad({ id: "O", fin: "2026-03-15", entregables: [{ id: "O-e", meta: 10, avances: [] }] })
    const a = kpisProyecto(proyecto({ actividades: [abierta], beneficiarios: { total: 40, meta: 100 } }))
    const b = kpisProyecto(proyecto({ actividades: [abierta, { ...abierta, id: "O2" }], beneficiarios: { total: 10, meta: null } }))
    const borrador = kpisProyecto(proyecto({ estado: "BORRADOR" }))
    const p = kpisPortafolio([a, b, borrador], CORTE)
    expect(p.atrasadas).toBe(3)
    // M5: the aggregate is the sum of the project numbers (goal field), never the attended count.
    expect(p.beneficiarios).toEqual({ total: 100 })
  })
  it("beneficiaries total is 0 when no measured project has a number; empty portfolio is 0", () => {
    const sinMeta = kpisProyecto(proyecto({ beneficiarios: { total: 5, meta: null } }))
    expect(kpisPortafolio([sinMeta], CORTE).beneficiarios).toEqual({ total: 0 })
    const vacio = kpisPortafolio([], CORTE)
    expect(vacio.atrasadas).toBe(0)
    expect(vacio.beneficiarios).toEqual({ total: 0 })
  })
  it("empty portfolio yields nulls", () => {
    const p = kpisPortafolio([], CORTE)
    expect(p.tecnico.avance_real).toBeNull()
    expect(p.financiero.ea).toBeNull()
  })
})

describe("kpisNoMedible", () => {
  it("lists the state with null KPIs and the corte", async () => {
    const { kpisNoMedible } = await import("./kpis")
    expect(kpisNoMedible(CORTE, "BORRADOR", PARAMETROS_V2_DEFAULT)).toMatchObject({
      corte: CORTE,
      estado: "BORRADOR",
      medible: false,
      tecnico: null,
      financiero: null,
    })
  })
})
