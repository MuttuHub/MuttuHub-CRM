// Read-only selector for the v3 ficha summary: the header and the KPI strip of one project, taken from
// the payloads the app already fetches. No rules and no wording: every number comes from the server.

import { describe, expect, it } from "vitest"
import type { ProjectKpis, ProjectListRow } from "@/hooks/projects"
import { ESTADO_PROYECTO_META } from "@/components/proyectos/project-display"
import { resumenFicha } from "./ficha"

const PROYECTO = {
  id: "p1",
  codigo: "PRY-2026-002",
  nombre: "Escuelas de liderazgo comunitario",
  estado: "EN_EJECUCION",
  cliente: { id: "c1", nombre: "Alcaldía de Puerto Sol" },
  responsable: { id: "u1", nombre: "Julián Restrepo" },
  fecha_inicio: "2026-08-03",
  fecha_fin: "2027-02-26",
  duracion_semanas: 30,
} as unknown as ProjectListRow

const KPIS = {
  corte: "2026-11-01",
  estado: "EN_EJECUCION",
  medible: true,
  confirmado: true,
  tecnico: { corte: "2026-11-01", avance_real: 46, avance_programado: 52, desviacion_pp: -6, color: "amarillo" },
  cronograma: { corte: "2026-11-01", vencidas: 3, a_tiempo: 2, atrasadas: 1, valor: 33 },
  entregables: { corte: "2026-11-01", programados: 9, logrados: 4, valor: 44 },
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
    alerta_retraso: true,
  },
} as unknown as ProjectKpis

describe("resumenFicha", () => {
  it("carries the header of the ficha with the shared state label", () => {
    const resumen = resumenFicha({ proyecto: PROYECTO, kpis: KPIS })
    expect(resumen.codigo).toBe("PRY-2026-002")
    expect(resumen.nombre).toBe("Escuelas de liderazgo comunitario")
    expect(resumen.cliente).toBe("Alcaldía de Puerto Sol")
    expect(resumen.responsable).toBe("Julián Restrepo")
    expect(resumen.estado.etiqueta).toBe(ESTADO_PROYECTO_META.EN_EJECUCION.label)
    expect(resumen.estado.tono).toBe(ESTADO_PROYECTO_META.EN_EJECUCION.tone)
  })

  it("keeps the dates as the calendar strings the API sends", () => {
    const resumen = resumenFicha({ proyecto: PROYECTO, kpis: KPIS })
    expect(resumen.fechas).toEqual({ inicio: "2026-08-03", fin: "2027-02-26", semanas: 30 })
  })

  it("takes avance, atrasadas, financiero and beneficiarios from the server payload", () => {
    const resumen = resumenFicha({ proyecto: PROYECTO, kpis: KPIS })
    expect(resumen.avance).toEqual({ real: 46, programado: 52, desviacion: -6, color: "amarillo" })
    expect(resumen.atrasadas).toBe(1)
    expect(resumen.financiero).toEqual({ delAsignado: 43, deLoProgramado: 93, color: "verde", alertaRetraso: true })
    expect(resumen.beneficiarios).toEqual({ total: 312, meta: 600 })
    expect(resumen.medible).toBe(true)
  })

  it("without kpis keeps the header and leaves the measures null, never zero", () => {
    const resumen = resumenFicha({ proyecto: PROYECTO, kpis: null })
    expect(resumen.nombre).toBe("Escuelas de liderazgo comunitario")
    expect(resumen.avance).toBeNull()
    expect(resumen.atrasadas).toBeNull()
    expect(resumen.financiero).toBeNull()
    expect(resumen.beneficiarios).toBeNull()
    expect(resumen.medible).toBe(false)
  })

  it("respects a non-measurable project even when the kpis payload arrives", () => {
    const borrador = { ...KPIS, medible: false, tecnico: null, cronograma: null, financiero: null, beneficiarios: null } as unknown as ProjectKpis
    const resumen = resumenFicha({ proyecto: PROYECTO, kpis: borrador })
    expect(resumen.medible).toBe(false)
    expect(resumen.avance).toBeNull()
    expect(resumen.atrasadas).toBeNull()
    expect(resumen.financiero).toBeNull()
    expect(resumen.beneficiarios).toBeNull()
  })
})
