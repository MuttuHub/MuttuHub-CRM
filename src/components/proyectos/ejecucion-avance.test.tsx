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
  ProjectDeliverable,
  ProjectDeliverableProgress,
  ProjectTechnicalActivity,
} from "@/hooks/projects"
import { EjecucionAvance } from "./ejecucion-avance"

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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

describe("EjecucionAvance", () => {
  afterEach(() => mockViewport(false))

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
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
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
})
