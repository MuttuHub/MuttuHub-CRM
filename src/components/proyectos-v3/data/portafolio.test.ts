// Read-only selectors for the v3 portfolio rows. They only pick fields the server already computed
// (semáforo, avance, ejecución) and label the state with the shared presentation module: no rules, no
// fetch, no wording. Sample data only; the shapes mirror `GET /api/v1/dashboard/portfolio`.

import { describe, expect, it } from "vitest"
import type { PortfolioProject, ProjectKpis, ProjectsPortfolio } from "@/hooks/projects"
import { ESTADO_PROYECTO_META } from "@/components/proyectos/project-display"
import { filasPortafolio } from "./portafolio"

const KPIS_MEDIBLE = {
  corte: "2026-11-01",
  estado: "EN_EJECUCION",
  medible: true,
  confirmado: true,
  tecnico: { corte: "2026-11-01", avance_real: 46, avance_programado: 52, desviacion_pp: -6, color: "amarillo" },
  cronograma: { corte: "2026-11-01", vencidas: 3, a_tiempo: 2, atrasadas: 1, valor: 33 },
  entregables: null,
  indicadores: null,
  beneficiarios: { corte: "2026-11-01", total: 312, meta: 600, valor: 52 },
  financiero: {
    corte: "2026-11-01",
    asignado: "420000000.00",
    programado: "194000000.00",
    ejecutado: "180000000.00",
    ea: 43,
    ep: 93,
    color: "verde",
    alerta_retraso: false,
  },
} as unknown as ProjectKpis

const KPIS_BORRADOR = {
  corte: "2026-11-01",
  estado: "BORRADOR",
  medible: false,
  confirmado: false,
  tecnico: null,
  cronograma: null,
  entregables: null,
  indicadores: null,
  beneficiarios: null,
  financiero: null,
} as unknown as ProjectKpis

const MEDIBLE = {
  id: "p1",
  codigo: "PRY-2026-002",
  nombre: "Escuelas de liderazgo comunitario",
  estado: "EN_EJECUCION",
  cliente: { id: "c1", nombre: "Alcaldía de Puerto Sol" },
  responsable: { id: "u1", nombre: "Julián Restrepo" },
  linea_principal: null,
  fecha_inicio: "2026-08-03",
  fecha_fin: "2027-02-26",
  semaforo_tecnico: "amarillo",
  semaforo_financiero: "verde",
  alerta_retraso: false,
  atrasadas: 1,
  kpis: KPIS_MEDIBLE,
} as unknown as PortfolioProject

const BORRADOR = {
  id: "p2",
  codigo: "PRY-2026-007",
  nombre: "Huertas escolares en Puerto Sol",
  estado: "BORRADOR",
  cliente: { id: "c1", nombre: "Alcaldía de Puerto Sol" },
  responsable: null,
  linea_principal: null,
  fecha_inicio: null,
  fecha_fin: null,
  semaforo_tecnico: null,
  semaforo_financiero: null,
  alerta_retraso: null,
  atrasadas: null,
  kpis: KPIS_BORRADOR,
} as unknown as PortfolioProject

const PORTAFOLIO = { proyectos: [MEDIBLE, BORRADOR] } as unknown as ProjectsPortfolio

describe("filasPortafolio", () => {
  it("keeps one row per project, in the order the server sent them", () => {
    const filas = filasPortafolio(PORTAFOLIO)
    expect(filas).toHaveLength(2)
    expect(filas.map((f) => f.codigo)).toEqual(["PRY-2026-002", "PRY-2026-007"])
  })

  it("carries the identification and the shared state label", () => {
    const [fila] = filasPortafolio(PORTAFOLIO)
    expect(fila.id).toBe("p1")
    expect(fila.nombre).toBe("Escuelas de liderazgo comunitario")
    expect(fila.cliente).toBe("Alcaldía de Puerto Sol")
    expect(fila.responsable).toBe("Julián Restrepo")
    expect(fila.estado.etiqueta).toBe(ESTADO_PROYECTO_META.EN_EJECUCION.label)
    expect(fila.estado.tono).toBe(ESTADO_PROYECTO_META.EN_EJECUCION.tone)
  })

  it("reuses the numbers the server computed instead of recalculating them", () => {
    const [fila] = filasPortafolio(PORTAFOLIO)
    expect(fila.avance).toEqual({ real: 46, programado: 52, desviacion: -6 })
    expect(fila.semaforoTecnico).toBe("amarillo")
    expect(fila.atrasadas).toBe(1)
    expect(fila.financiero).toEqual({ delAsignado: 43, deLoProgramado: 93, color: "verde", alertaRetraso: false })
  })

  it("leaves a non-measurable project with nulls instead of inventing zeros", () => {
    const [, borrador] = filasPortafolio(PORTAFOLIO)
    expect(borrador.responsable).toBeNull()
    expect(borrador.avance).toBeNull()
    expect(borrador.semaforoTecnico).toBeNull()
    expect(borrador.atrasadas).toBeNull()
    expect(borrador.financiero).toBeNull()
    expect(borrador.estado.etiqueta).toBe(ESTADO_PROYECTO_META.BORRADOR.label)
  })
})
