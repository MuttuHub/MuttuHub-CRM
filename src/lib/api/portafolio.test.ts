// S14 P9: the pure per-line aggregate behind `agregado.por_linea` (the radar series).
// The grouping, the technical mean and the indicator mean are exercised without a DB:
// `cargarPortafolio` builds the inputs from the rows and the KPI map, and this file
// pins the aggregation rules (order, "Sin línea", nulls, rounding).
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({ db: {} }))
vi.mock("@/lib/settings", () => ({ getSemaforoParametrosV2: vi.fn() }))

import type { KpisProyecto } from "@/lib/proyectos/kpis"
import { agregarPorLinea, type LineaRef } from "./portafolio"

const LINEA = (id: string): LineaRef => ({ id, codigo: id.toUpperCase(), nombre: `Línea ${id}` })

/** Minimal KPI blocks; only the fields the aggregation reads are populated. */
const kpi = (over: Partial<KpisProyecto> = {}): KpisProyecto =>
  ({
    corte: "2026-03-15",
    estado: "EN_EJECUCION",
    medible: true,
    confirmado: false,
    tecnico: { corte: "2026-03-15", avance_real: 40, avance_programado: 50, desviacion_pp: -10, color: "rojo" },
    cronograma: null,
    entregables: null,
    indicadores: { corte: "2026-03-15", valor: 80, medidos: 2, en_meta: 1, sin_medir: 0, sin_medir_ids: [] },
    beneficiarios: null,
    financiero: null,
    ...over,
  }) as KpisProyecto

describe("agregarPorLinea", () => {
  it("groups by the principal line, preserving the first-appearance order and counting projects", () => {
    const out = agregarPorLinea([
      { kpis: kpi(), linea: LINEA("l1") },
      { kpis: kpi(), linea: LINEA("l2") },
      { kpis: kpi(), linea: LINEA("l1") },
    ])
    expect(out.map((l) => l.linea?.id)).toEqual(["l1", "l2"])
    expect(out.map((l) => l.proyectos)).toEqual([2, 1])
  })

  it("groups projects without a principal line under a null line", () => {
    const out = agregarPorLinea([
      { kpis: kpi(), linea: null },
      { kpis: kpi(), linea: LINEA("l1") },
    ])
    expect(out.find((l) => l.linea === null)?.proyectos).toBe(1)
    expect(out).toHaveLength(2)
  })

  it("means the technical advance over the measured projects, null when none is measured", () => {
    const conTecnico = kpi({ tecnico: { corte: "2026-03-15", avance_real: 30, avance_programado: 40, desviacion_pp: -10, color: "rojo" } })
    const out = agregarPorLinea([
      { kpis: conTecnico, linea: LINEA("l1") },
      { kpis: kpi(), linea: LINEA("l1") },
    ])
    expect(out[0].tecnico).toEqual({ avance_real: 35, avance_programado: 45 })
    const vacio = agregarPorLinea([{ kpis: kpi({ tecnico: null }), linea: LINEA("l1") }])
    expect(vacio[0].tecnico).toEqual({ avance_real: null, avance_programado: null })
  })

  it("means the indicator compliance and sums medidos and en_meta", () => {
    const sinIndicadores = kpi({ indicadores: { corte: "2026-03-15", valor: null, medidos: 0, en_meta: 0, sin_medir: 3, sin_medir_ids: [] } })
    const out = agregarPorLinea([
      { kpis: kpi({ indicadores: { corte: "2026-03-15", valor: 60, medidos: 1, en_meta: 0, sin_medir: 0, sin_medir_ids: [] } }), linea: LINEA("l1") },
      { kpis: kpi({ indicadores: { corte: "2026-03-15", valor: 90, medidos: 4, en_meta: 3, sin_medir: 0, sin_medir_ids: [] } }), linea: LINEA("l1") },
      { kpis: sinIndicadores, linea: LINEA("l1") },
    ])
    expect(out[0].indicadores).toEqual({ valor: 75, medidos: 5, en_meta: 3 })
  })

  it("returns an empty list for no entries and a null indicator mean when nothing is measured", () => {
    expect(agregarPorLinea([])).toEqual([])
    const out = agregarPorLinea([{ kpis: kpi({ indicadores: null }), linea: LINEA("l1") }])
    expect(out[0].indicadores).toEqual({ valor: null, medidos: 0, en_meta: 0 })
  })
})
