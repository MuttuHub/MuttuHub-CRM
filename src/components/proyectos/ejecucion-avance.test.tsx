// S4 U6: progreso por actividad y por entregable. Presentacional puro; el color
// y el progreso llegan derivados del servidor.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { mockViewport } from "@/test/viewport"
import type {
  ProjectActivity,
  ProjectActivityReport,
  ProjectDeliverable,
  ProjectDeliverableProgress,
  ProjectTechnicalActivity,
} from "@/hooks/projects"
import { EjecucionAvance } from "./ejecucion-avance"

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
  wrapper.displayName = "QueryClientTestWrapper"
  return wrapper
}

const STAMP = { created_at: "2026-10-08T00:00:00.000Z", updated_at: "2026-10-08T00:00:00.000Z" }

const ACTIVIDAD: ProjectActivity = {
  ...STAMP,
  id: "a1",
  proyecto_id: "p1",
  objetivo_id: "o1",
  codigo: "1.1",
  nombre: "Taller de formación",
  semana_inicio: 1,
  semana_fin: 3,
  fecha_inicio: "2026-10-05",
  fecha_fin: "2026-10-25",
  peso: 1,
  peso_manual: false,
  responsable_id: null,
  fuera_de_duracion: false,
}

const TECNICO: ProjectTechnicalActivity = {
  id: "a1",
  codigo: "1.1",
  peso: 1,
  progreso: 100,
  estado: "FINALIZADA",
  fecha_cumplimiento: "2026-10-20",
}

const ENTREGABLE: ProjectDeliverable = {
  ...STAMP,
  id: "e1",
  proyecto_id: "p1",
  actividad_id: "a1",
  codigo: "ENT-1",
  descripcion: "Acta de asistencia",
  cantidad_meta: "2.00",
  unidad: "actas",
  tipo_medio_exigido: "PDF firmado",
}

const ENTREGABLE2: ProjectDeliverable = { ...ENTREGABLE, id: "e2", codigo: "ENT-2", descripcion: "Foto" }

function avance(overrides: Partial<ProjectDeliverableProgress["avances"][number]> = {}) {
  return {
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
    soportes: [],
    ...overrides,
  }
}

function reporte(overrides: Partial<ProjectActivityReport> = {}): ProjectActivityReport {
  return {
    id: "r1",
    proyecto_id: "p1",
    actividad_id: "a1",
    fecha: "2026-10-20",
    porcentaje: "30.00",
    observacion: "Se ejecutó el taller inicial; falta el acta firmada.",
    registrado_por_id: "u1",
    created_at: "2026-10-20T00:00:00.000Z",
    anulado_at: null,
    anulado_por_id: null,
    motivo_anulacion: null,
    medios: 0,
    ...overrides,
  }
}

describe("EjecucionAvance", () => {
  const fetchMock = vi.fn()

  function mockReportes(reportes: ProjectActivityReport[]) {
    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"
      if (url.endsWith("/activities/a1/progress") && method === "GET") {
        return Promise.resolve(jsonResponse({ estado: "EN_EJECUCION", reportes }))
      }
      return Promise.resolve(jsonResponse({}))
    })
  }

  beforeEach(() => {
    fetchMock.mockReset()
    mockReportes([])
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    mockViewport(false)
  })

  it("opens the avance form in a bottom sheet on phones", async () => {
    mockViewport(true)
    const user = userEvent.setup()
    render(
      <EjecucionAvance
        proyectoId="p1"
        actividad={ACTIVIDAD}
        canWrite
        canVoid={false}
        tecnico={TECNICO}
        entregables={[ENTREGABLE]}
        progreso={new Map()}
      />,
      { wrapper: createWrapper() },
    )
    await user.click(screen.getByRole("button", { name: "Registrar avance ENT-1" }))
    const dialog = await screen.findByRole("dialog", { name: "Registrar avance" })
    expect(within(dialog).getByRole("form", { name: "Registrar avance ENT-1" })).toBeInTheDocument()
  })

  it("renders the activity progress bar and its estado badge", () => {
    render(
      <EjecucionAvance
        proyectoId="p1"
        actividad={ACTIVIDAD}
        canWrite={false}
        canVoid={false}
        tecnico={TECNICO}
        entregables={[ENTREGABLE]}
        progreso={new Map([["e1", { estado: "EN_EJECUCION", meta: "2.00", avances: [avance()] }]])}
      />,
      { wrapper: createWrapper() },
    )

    const actividad = screen.getByTestId("ejecucion-actividad")
    expect(actividad).toHaveTextContent("1.1")
    expect(actividad).toHaveTextContent("Taller de formación")
    expect(actividad).toHaveTextContent("Finalizada")
    const barra = screen.getByRole("progressbar", { name: "Avance de la actividad 1.1" })
    expect(barra).toHaveAttribute("aria-valuenow", "100")
    expect(barra).toHaveAttribute("aria-valuemin", "0")
    expect(barra).toHaveAttribute("aria-valuemax", "100")
    expect(barra.tagName).not.toBe("PROGRESS")
  })

  it("shows each deliverable's goal and counted quantity", () => {
    render(
      <EjecucionAvance
        proyectoId="p1"
        actividad={ACTIVIDAD}
        canWrite={false}
        canVoid={false}
        tecnico={TECNICO}
        entregables={[ENTREGABLE]}
        progreso={
          new Map([
            ["e1", { estado: "EN_EJECUCION", meta: "2.00", avances: [avance(), avance({ id: "av2", cantidad: "1.00" })] }],
          ])
        }
      />,
      { wrapper: createWrapper() },
    )

    const entregable = screen.getByTestId("ejecucion-entregable")
    expect(entregable).toHaveTextContent("ENT-1")
    expect(entregable).toHaveTextContent("Meta 2 actas")
    expect(entregable).toHaveTextContent("Contado 3 actas")
    expect(within(entregable).queryByTestId("ejecucion-pendiente-soporte")).not.toBeInTheDocument()
  })

  it("flags non-voided avances without a live medio as pending support", () => {
    render(
      <EjecucionAvance
        proyectoId="p1"
        actividad={ACTIVIDAD}
        canWrite={false}
        canVoid={false}
        tecnico={TECNICO}
        entregables={[ENTREGABLE]}
        progreso={
          new Map([
            [
              "e1",
              {
                estado: "EN_EJECUCION",
                meta: "2.00",
                avances: [
                  avance(),
                  avance({ id: "av2", cantidad: "1.00", medios: 0, cuenta: false }),
                  avance({ id: "av3", cantidad: "5.00", anulado_at: "2026-10-21T00:00:00.000Z", motivo_anulacion: "error", cuenta: false }),
                ],
              },
            ],
          ])
        }
      />,
      { wrapper: createWrapper() },
    )

    const pendiente = screen.getByTestId("ejecucion-pendiente-soporte")
    expect(pendiente).toHaveTextContent("1 pendiente de soporte")
    // El anulado no cuenta como pendiente ni como contado.
    const entregable = screen.getByTestId("ejecucion-entregable")
    expect(entregable).toHaveTextContent("Contado 2 actas")
  })

  it("marks an uncounted deliverable as zero counted, even without progress loaded", () => {
    render(
      <EjecucionAvance
        proyectoId="p1"
        actividad={ACTIVIDAD}
        canWrite={false}
        canVoid={false}
        tecnico={{ ...TECNICO, progreso: 0, estado: "NO_INICIADA" }}
        entregables={[ENTREGABLE2]}
        progreso={new Map()}
      />,
      { wrapper: createWrapper() },
    )

    expect(screen.getByTestId("ejecucion-actividad")).toHaveTextContent("No iniciada")
    const entregable = screen.getByTestId("ejecucion-entregable")
    expect(entregable).toHaveTextContent("Contado 0 actas")
  })

  describe("adjuntar medio a un avance existente (AJ-06 T2)", () => {
    const fetchMock = vi.fn()

    beforeEach(() => {
      fetchMock.mockReset()
      fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({})))
      vi.stubGlobal("fetch", fetchMock)
    })
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it("shows an Adjuntar archivo control for each avance when canWrite", () => {
      render(
        <EjecucionAvance
          proyectoId="p1"
          actividad={ACTIVIDAD}
          canWrite
          canVoid={false}
          tecnico={TECNICO}
          entregables={[ENTREGABLE]}
          progreso={new Map([["e1", { estado: "EN_EJECUCION", meta: "2.00", avances: [avance(), avance({ id: "av2" })] }]])}
        />,
        { wrapper: createWrapper() },
      )

      const filas = screen.getAllByTestId("ejecucion-avance")
      expect(filas).toHaveLength(2)
      for (const fila of filas) {
        expect(within(fila).getByRole("button", { name: "Adjuntar archivo" })).toBeInTheDocument()
      }
    })

    it("does not show the attach control when the user cannot write, or on a voided avance", () => {
      render(
        <EjecucionAvance
          proyectoId="p1"
          actividad={ACTIVIDAD}
          canWrite={false}
          canVoid={false}
          tecnico={TECNICO}
          entregables={[ENTREGABLE]}
          progreso={new Map([["e1", { estado: "EN_EJECUCION", meta: "2.00", avances: [avance()] }]])}
        />,
        { wrapper: createWrapper() },
      )
      expect(screen.queryByRole("button", { name: "Adjuntar archivo" })).not.toBeInTheDocument()
    })

    it("attaches a second medio (link) to an existing avance with one POST to its attachments", async () => {
      const user = userEvent.setup()
      render(
        <EjecucionAvance
          proyectoId="p1"
          actividad={ACTIVIDAD}
          canWrite
          canVoid={false}
          tecnico={TECNICO}
          entregables={[ENTREGABLE]}
          progreso={new Map([["e1", { estado: "EN_EJECUCION", meta: "2.00", avances: [avance()] }]])}
        />,
        { wrapper: createWrapper() },
      )

      await user.click(screen.getByRole("button", { name: "Adjuntar archivo" }))
      await user.click(screen.getByRole("radio", { name: "Enlace" }))
      await user.type(screen.getByLabelText("URL"), "https://drive.example.com/f/1")
      await user.type(screen.getByLabelText("Nombre del enlace"), "Acta firmada")
      await user.click(screen.getByRole("button", { name: "Adjuntar" }))

      await waitFor(() => expect(screen.queryByRole("form", { name: "Adjuntar archivo" })).toBeNull())
      const attachCall = fetchMock.mock.calls.find(
        ([callUrl]) => String(callUrl) === "/api/v1/projects/p1/progress/av1/attachments",
      ) as [string, RequestInit] | undefined
      expect(attachCall).toBeDefined()
      const [url, init] = attachCall!
      expect(url).toBe("/api/v1/projects/p1/progress/av1/attachments")
      expect(JSON.parse(init.body as string)).toEqual({ url_externa: "https://drive.example.com/f/1", nombre: "Acta firmada" })
    })

    it("shows every soporte of an avance individually, not just a count (2 archivos + 1 enlace -> 3)", () => {
      const soportes = [
        { id: "m-1", proyecto_id: "p1", avance_id: "av1", nombre: "acta-1.pdf", tipo: "archivo" as const, url_externa: null, tipo_mime: "application/pdf", tamano_bytes: 10, subido_por_id: "u1", created_at: "2026-10-20T00:00:00.000Z" },
        { id: "m-2", proyecto_id: "p1", avance_id: "av1", nombre: "acta-2.pdf", tipo: "archivo" as const, url_externa: null, tipo_mime: "application/pdf", tamano_bytes: 12, subido_por_id: "u1", created_at: "2026-10-20T00:00:01.000Z" },
        { id: "m-3", proyecto_id: "p1", avance_id: "av1", nombre: "Carpeta Drive", tipo: "enlace" as const, url_externa: "https://drive.example/f", tipo_mime: null, tamano_bytes: null, subido_por_id: "u1", created_at: "2026-10-20T00:00:02.000Z" },
      ]
      render(
        <EjecucionAvance
          proyectoId="p1"
          actividad={ACTIVIDAD}
          canWrite={false}
          canVoid={false}
          tecnico={TECNICO}
          entregables={[ENTREGABLE]}
          progreso={new Map([["e1", { estado: "EN_EJECUCION", meta: "2.00", avances: [avance({ medios: 3, soportes })] }]])}
        />,
        { wrapper: createWrapper() },
      )

      const fila = screen.getByTestId("ejecucion-avance")
      expect(within(fila).getByText("acta-1.pdf")).toBeInTheDocument()
      expect(within(fila).getByText("acta-2.pdf")).toBeInTheDocument()
      expect(within(fila).getByText("Carpeta Drive")).toBeInTheDocument()
    })
  })

  /* ── AJ-01 (S2/S3): "Registrar avance" a nivel actividad ────────────── */

  it("shows the activity-level \"Registrar avance\" action only to its responsable", async () => {
    const { unmount } = render(
      <EjecucionAvance
        proyectoId="p1"
        actividad={ACTIVIDAD}
        canWrite
        canVoid={false}
        esResponsable={false}
        tecnico={TECNICO}
        entregables={[]}
        progreso={new Map()}
      />,
      { wrapper: createWrapper() },
    )
    await screen.findByTestId("ejecucion-actividad")
    expect(screen.queryByRole("button", { name: "Registrar avance 1.1" })).not.toBeInTheDocument()
    unmount()

    render(
      <EjecucionAvance
        proyectoId="p1"
        actividad={ACTIVIDAD}
        canWrite={false}
        canVoid={false}
        esResponsable
        tecnico={TECNICO}
        entregables={[]}
        progreso={new Map()}
      />,
      { wrapper: createWrapper() },
    )
    await screen.findByTestId("ejecucion-actividad")
    expect(screen.queryByRole("button", { name: "Registrar avance 1.1" })).not.toBeInTheDocument()

    render(
      <EjecucionAvance
        proyectoId="p1"
        actividad={ACTIVIDAD}
        canWrite
        canVoid={false}
        esResponsable
        tecnico={TECNICO}
        entregables={[]}
        progreso={new Map()}
      />,
      { wrapper: createWrapper() },
    )
    expect(screen.getByRole("button", { name: "Registrar avance 1.1" })).toBeInTheDocument()
  })

  it("registers an activity report and shows it in the history", async () => {
    const user = userEvent.setup()
    render(
      <EjecucionAvance
        proyectoId="p1"
        actividad={ACTIVIDAD}
        canWrite
        canVoid={false}
        esResponsable
        tecnico={TECNICO}
        entregables={[]}
        progreso={new Map()}
      />,
      { wrapper: createWrapper() },
    )

    await user.click(screen.getByRole("button", { name: "Registrar avance 1.1" }))
    const form = screen.getByRole("form", { name: "Registrar avance 1.1" })
    await user.type(within(form).getByLabelText("Porcentaje de avance"), "30")
    await user.type(within(form).getByLabelText("Observación"), "Se ejecutó el taller inicial.")

    mockReportes([reporte()])
    await user.click(within(form).getByRole("button", { name: "Registrar avance" }))

    const llamada = fetchMock.mock.calls.find(
      ([url, init]) => String(url).endsWith("/activities/a1/progress") && (init?.method ?? "GET") === "POST",
    )
    expect(llamada).toBeDefined()
    expect(JSON.parse(String(llamada?.[1]?.body))).toMatchObject({
      porcentaje: 30,
      observacion: "Se ejecutó el taller inicial.",
    })

    const historial = await screen.findByTestId("ejecucion-reportes")
    expect(within(historial).getByTestId("ejecucion-reporte")).toHaveTextContent("30 %")
  })

  it("rejects a report that is not strictly greater than the last one (S3)", async () => {
    const user = userEvent.setup()
    mockReportes([reporte({ porcentaje: "70.00" })])
    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"
      if (url.endsWith("/activities/a1/progress") && method === "GET") {
        return Promise.resolve(jsonResponse({ estado: "EN_EJECUCION", reportes: [reporte({ porcentaje: "70.00" })] }))
      }
      if (url.endsWith("/activities/a1/progress") && method === "POST") {
        const body = JSON.parse(String(init?.body))
        if (body.porcentaje <= 70) {
          return Promise.resolve(
            jsonResponse({ error: "El avance debe ser mayor que el último reportado (70 %)." }, 409),
          )
        }
        return Promise.resolve(jsonResponse({ reporte: reporte({ id: "r2", porcentaje: String(body.porcentaje) }) }, 201))
      }
      return Promise.resolve(jsonResponse({}))
    })

    render(
      <EjecucionAvance
        proyectoId="p1"
        actividad={ACTIVIDAD}
        canWrite
        canVoid={false}
        esResponsable
        tecnico={TECNICO}
        entregables={[]}
        progreso={new Map()}
      />,
      { wrapper: createWrapper() },
    )

    await user.click(screen.getByRole("button", { name: "Registrar avance 1.1" }))
    let form = screen.getByRole("form", { name: "Registrar avance 1.1" })
    await user.type(within(form).getByLabelText("Porcentaje de avance"), "70")
    await user.type(within(form).getByLabelText("Observación"), "Lo mismo de antes.")
    await user.click(within(form).getByRole("button", { name: "Registrar avance" }))
    await waitFor(() =>
      expect(form).toHaveTextContent("El avance debe ser mayor que el último reportado (70 %)."),
    )

    await user.clear(within(form).getByLabelText("Porcentaje de avance"))
    await user.type(within(form).getByLabelText("Porcentaje de avance"), "50")
    await user.click(within(form).getByRole("button", { name: "Registrar avance" }))
    form = screen.getByRole("form", { name: "Registrar avance 1.1" })
    await waitFor(() =>
      expect(form).toHaveTextContent("El avance debe ser mayor que el último reportado (70 %)."),
    )
  })

  it("accepts the cap and rejects above it while entregables are incomplete (S3)", async () => {
    const user = userEvent.setup()
    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"
      if (url.endsWith("/activities/a1/progress") && method === "GET") {
        return Promise.resolve(jsonResponse({ estado: "EN_EJECUCION", reportes: [] }))
      }
      if (url.endsWith("/activities/a1/progress") && method === "POST") {
        const body = JSON.parse(String(init?.body))
        if (body.porcentaje > 90) {
          return Promise.resolve(
            jsonResponse({ error: "El avance máximo sin entregables completos es 90 %." }, 409),
          )
        }
        return Promise.resolve(jsonResponse({ reporte: reporte({ porcentaje: String(body.porcentaje) }) }, 201))
      }
      return Promise.resolve(jsonResponse({}))
    })

    render(
      <EjecucionAvance
        proyectoId="p1"
        actividad={ACTIVIDAD}
        canWrite
        canVoid={false}
        esResponsable
        tecnico={TECNICO}
        entregables={[]}
        progreso={new Map()}
      />,
      { wrapper: createWrapper() },
    )

    await user.click(screen.getByRole("button", { name: "Registrar avance 1.1" }))
    const form = screen.getByRole("form", { name: "Registrar avance 1.1" })
    await user.type(within(form).getByLabelText("Porcentaje de avance"), "95")
    await user.type(within(form).getByLabelText("Observación"), "Casi todo listo.")
    await user.click(within(form).getByRole("button", { name: "Registrar avance" }))
    await waitFor(() =>
      expect(form).toHaveTextContent("El avance máximo sin entregables completos es 90 %."),
    )

    await user.clear(within(form).getByLabelText("Porcentaje de avance"))
    await user.type(within(form).getByLabelText("Porcentaje de avance"), "90")
    await user.click(within(form).getByRole("button", { name: "Registrar avance" }))

    await waitFor(() => {
      const llamadas = fetchMock.mock.calls.filter(
        ([callUrl, callInit]) =>
          String(callUrl).endsWith("/activities/a1/progress") && (callInit?.method ?? "GET") === "POST",
      )
      expect(llamadas).toHaveLength(2)
      expect(JSON.parse(String(llamadas[1][1]?.body)).porcentaje).toBe(90)
    })
  })

  it("shows the history with fecha, porcentaje, observación and usuario", async () => {
    mockReportes([reporte()])
    render(
      <EjecucionAvance
        proyectoId="p1"
        actividad={ACTIVIDAD}
        canWrite={false}
        canVoid={false}
        esResponsable={false}
        nombreUsuario={(id) => (id === "u1" ? "Ana Pérez" : id)}
        tecnico={TECNICO}
        entregables={[]}
        progreso={new Map()}
      />,
      { wrapper: createWrapper() },
    )

    const fila = await screen.findByTestId("ejecucion-reporte")
    expect(fila).toHaveTextContent("20 de oct de 2026")
    expect(fila).toHaveTextContent("30 %")
    expect(fila).toHaveTextContent("Se ejecutó el taller inicial; falta el acta firmada.")
    expect(fila).toHaveTextContent("Ana Pérez")
  })

  it("shows the attach control per report and the void action only on the most recent one", async () => {
    mockReportes([reporte({ id: "r1", fecha: "2026-10-10", porcentaje: "30.00" }), reporte({ id: "r2", fecha: "2026-10-20", porcentaje: "70.00" })])
    render(
      <EjecucionAvance
        proyectoId="p1"
        actividad={ACTIVIDAD}
        canWrite
        canVoid={false}
        esResponsable
        tecnico={TECNICO}
        entregables={[]}
        progreso={new Map()}
      />,
      { wrapper: createWrapper() },
    )

    const filas = await screen.findAllByTestId("ejecucion-reporte")
    expect(filas).toHaveLength(2)
    expect(within(filas[0]).getByRole("button", { name: "Adjuntar archivo" })).toBeInTheDocument()
    expect(within(filas[1]).getByRole("button", { name: "Adjuntar archivo" })).toBeInTheDocument()
    expect(within(filas[0]).queryByRole("button", { name: "Anular" })).not.toBeInTheDocument()
    expect(within(filas[1]).getByRole("button", { name: "Anular" })).toBeInTheDocument()
  })
})
