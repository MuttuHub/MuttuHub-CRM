// S4 U6: read queries of the technical-execution section (technical status,
// per-deliverable avances, indicator measurements, beneficiaries). Real hooks,
// only `fetch` is mocked, same as projects.test.ts.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  projectQueryKeys,
  useDeliverableProgress,
  useIndicatorMeasurements,
  useProjectBeneficiaries,
  useProjectTechnicalStatus,
} from "./projects"

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
  wrapper.displayName = "QueryClientTestWrapper"
  return wrapper
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

const TECNICO = {
  base: "vigente",
  corte: "2026-10-25",
  estado: "EN_EJECUCION",
  avance_real: 21.4,
  avance_programado: 57.1,
  desviacion_pp: 35.7,
  color: "rojo",
  actividades: [
    { id: "a1", codigo: "1.1", peso: 1, progreso: 100, estado: "FINALIZADA", fecha_cumplimiento: "2026-10-20" },
  ],
  umbrales: { umbral1: 10, umbral2: 20, confirmado: false },
}

const AVANCE = {
  id: "av1",
  proyecto_id: "p1",
  entregable_id: "e1",
  fecha: "2026-10-20",
  cantidad: "2.00",
  observacion: null,
  justificacion_exceso: null,
  registrado_por_id: "u1",
  created_at: "2026-10-20T00:00:00.000Z",
  anulado_at: null,
  anulado_por_id: null,
  motivo_anulacion: null,
  medios: 1,
  cuenta: true,
}

const MEDICION = {
  id: "m1",
  proyecto_id: "p1",
  indicador_id: "i1",
  fecha: "2026-10-20",
  valor: "30.00",
  observacion: null,
  registrado_por_id: "u1",
  created_at: "2026-10-20T00:00:00.000Z",
  anulado_at: null,
  anulado_por_id: null,
  motivo_anulacion: null,
}

const BENEFICIARIO = {
  id: "b1",
  proyecto_id: "p1",
  actividad_id: null,
  fecha: "2026-10-20",
  cantidad: 40,
  observacion: null,
  registrado_por_id: "u1",
  created_at: "2026-10-20T00:00:00.000Z",
  anulado_at: null,
  anulado_por_id: null,
  motivo_anulacion: null,
}

describe("execution read hooks", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("useProjectTechnicalStatus reads the endpoint and keeps the API color verbatim", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(TECNICO)))

    const { result } = renderHook(() => useProjectTechnicalStatus("p1"), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.data).toEqual(TECNICO))
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/technical-status", expect.any(Object))
    expect(result.current.data?.color).toBe("rojo")
    expect(result.current.data?.umbrales.confirmado).toBe(false)
  })

  it("useProjectTechnicalStatus does not fetch with an empty id", () => {
    renderHook(() => useProjectTechnicalStatus(""), { wrapper: createWrapper() })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("useDeliverableProgress fans out one query per deliverable id", async () => {
    fetchMock.mockImplementation((input: unknown) => {
      const url = String(input)
      return Promise.resolve(
        jsonResponse({ estado: "EN_EJECUCION", meta: "2.00", avances: [AVANCE], url }),
      )
    })

    const { result } = renderHook(
      () => useDeliverableProgress("p1", ["e1", "e2"]),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.every((q) => q.data)).toBe(true))
    expect(result.current).toHaveLength(2)
    const urls = fetchMock.mock.calls.map((call) => String(call[0]))
    expect(urls).toContain("/api/v1/projects/p1/deliverables/e1/progress")
    expect(urls).toContain("/api/v1/projects/p1/deliverables/e2/progress")
  })

  it("useIndicatorMeasurements reads the measurements endpoint", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        jsonResponse({
          estado: "EN_EJECUCION",
          indicador: { id: "i1", codigo: "IND-1", nombre: "Personas", meta: "100.00", unidad: "personas" },
          mediciones: [MEDICION],
          ultima: MEDICION,
          tendencia: "sube",
        }),
      ),
    )

    const { result } = renderHook(() => useIndicatorMeasurements("p1", "i1"), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.data?.ultima).toEqual(MEDICION))
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/projects/p1/indicators/i1/measurements",
      expect.any(Object),
    )
    expect(result.current.data?.tendencia).toBe("sube")
  })

  it("useProjectBeneficiaries reads the beneficiaries endpoint with the live total", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ estado: "EN_EJECUCION", registros: [BENEFICIARIO], total: 40 })),
    )

    const { result } = renderHook(() => useProjectBeneficiaries("p1"), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.data?.total).toBe(40))
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/beneficiaries", expect.any(Object))
    expect(result.current.data?.registros).toHaveLength(1)
  })

  it("namespaces the execution keys under the `projects` prefix", () => {
    expect(projectQueryKeys.technicalStatus("p1")).toEqual(["projects", "technical-status", "p1"])
    expect(projectQueryKeys.deliverableProgress("p1", "e1")).toEqual([
      "projects",
      "deliverable-progress",
      "p1",
      "e1",
    ])
    expect(projectQueryKeys.indicatorMeasurements("p1", "i1")).toEqual([
      "projects",
      "indicator-measurements",
      "p1",
      "i1",
    ])
    expect(projectQueryKeys.beneficiaries("p1")).toEqual(["projects", "beneficiaries", "p1"])
  })
})
