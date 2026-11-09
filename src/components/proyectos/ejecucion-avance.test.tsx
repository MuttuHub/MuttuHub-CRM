// Tarjeta de actividad de la Lista (S4 U6/U7; redesign T2 «Actividades-propuesta» e
// «Interacciones-Actividades»). El color y el progreso llegan derivados del servidor; solo se burla `fetch`.

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
  ProjectTechnicalActivityV6,
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
  responsable_id: null,
  fuera_de_duracion: false,
}

/** Corte before the activity's end: it is not overdue. */
const ANTES_DEL_FIN = "2026-10-15"
/** Corte after the activity's end: an unfinished activity is overdue. */
const DESPUES_DEL_FIN = "2026-11-05"

const TECNICO: ProjectTechnicalActivity = {
  id: "a1",
  codigo: "1.1",
  peso: 1,
  progreso: 50,
  estado: "EN_CURSO",
  fecha_cumplimiento: null,
}

const TECNICO_V6: ProjectTechnicalActivity & Partial<ProjectTechnicalActivityV6> = {
  ...TECNICO,
  programado: 67.9,
  dias: 28,
  al_corte: 19,
  color: "rojo",
  sin_soporte: true,
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
    registrado_por_id: "6e9fd0f1-a71e-46a3-bef1-cd53487deccd",
    registrado_por_nombre: "Ana Pérez",
    created_at: "2026-10-20T00:00:00.000Z",
    anulado_at: null,
    anulado_por_id: null,
    motivo_anulacion: null,
    medios: 0,
    ...overrides,
  }
}

type Props = Partial<Parameters<typeof EjecucionAvance>[0]>

function renderCard(props: Props = {}) {
  return render(
    <EjecucionAvance
      proyectoId="p1"
      actividad={ACTIVIDAD}
      canWrite={false}
      canVoid={false}
      tecnico={TECNICO}
      entregables={[]}
      progreso={new Map()}
      corte={ANTES_DEL_FIN}
      {...props}
    />,
    { wrapper: createWrapper() },
  )
}

const progresoDe = (avances: ReturnType<typeof avance>[], id = "e1") =>
  new Map<string, ProjectDeliverableProgress>([[id, { estado: "EN_EJECUCION", meta: "2.00", avances }]])

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

  describe("header", () => {
    it("shows the código, the name as a heading, the semáforo in words and the estado", () => {
      renderCard({ tecnico: TECNICO_V6 })
      const tarjeta = screen.getByTestId("ejecucion-actividad")
      expect(within(tarjeta).getByRole("heading", { level: 3, name: "Taller de formación" })).toBeInTheDocument()
      expect(tarjeta).toHaveTextContent("1.1")
      expect(within(tarjeta).getByText("Rojo")).toBeInTheDocument()
      expect(within(tarjeta).getByText("En curso")).toBeInTheDocument()
    })

    it("says «Responsable: … · N días, día X» for an activity in progress", () => {
      renderCard({ tecnico: TECNICO_V6, responsable: "Andrés Torres" })
      expect(screen.getByTestId("ejecucion-actividad")).toHaveTextContent("Responsable: Andrés Torres · 28 días, día 19")
    })

    it("marks an unfinished activity whose last day passed as «Vencida el …»", () => {
      renderCard({ tecnico: TECNICO_V6, corte: DESPUES_DEL_FIN, responsable: "Andrés Torres" })
      const tarjeta = screen.getByTestId("ejecucion-actividad")
      expect(within(tarjeta).getByText("Vencida el 25 oct")).toBeInTheDocument()
      expect(tarjeta).toHaveTextContent("Responsable: Andrés Torres · 28 días")
      expect(tarjeta).not.toHaveTextContent("día 19")
    })
  })

  describe("progress line", () => {
    it("compares an activity in progress with its plan, with its own help", async () => {
      const user = userEvent.setup()
      renderCard({ tecnico: TECNICO_V6 })
      const barra = screen.getByRole("progressbar", { name: "Avance de la actividad 1.1" })
      expect(barra).toHaveAttribute("aria-valuenow", "50")
      const tarjeta = screen.getByTestId("ejecucion-actividad")
      expect(tarjeta).toHaveTextContent("50 % registrado · debería ir en 67,9 %")
      await user.click(screen.getByRole("button", { name: "Ayuda: Real y programado" }))
      expect(
        await screen.findByText("Real es lo registrado; programado es lo que debería llevar a hoy según el cronograma."),
      ).toBeInTheDocument()
    })

    it("shows the tope (from the server's parameter) on an overdue activity", async () => {
      const user = userEvent.setup()
      renderCard({ tecnico: TECNICO_V6, corte: DESPUES_DEL_FIN, tope: 85 })
      expect(screen.getByTestId("ejecucion-actividad")).toHaveTextContent("50 % registrado · tope 85 %")
      await user.click(screen.getByRole("button", { name: "Ayuda: Tope del avance" }))
      expect(
        await screen.findByText(
          "Una actividad llega como máximo al 85 % con avances; el 15 % restante se completa cuando se cuentan sus entregables.",
        ),
      ).toBeInTheDocument()
    })

    it("drops the tope once every deliverable is complete: the API allows 100 %", () => {
      renderCard({
        tecnico: TECNICO_V6,
        corte: DESPUES_DEL_FIN,
        entregables: [ENTREGABLE],
        progreso: progresoDe([avance()]),
      })
      const tarjeta = screen.getByTestId("ejecucion-actividad")
      expect(tarjeta).toHaveTextContent("50 % registrado")
      expect(tarjeta).not.toHaveTextContent("tope")
    })
  })

  describe("one main action per card", () => {
    it("offers «Registrar avance» to anyone who can write, responsable or not", async () => {
      const { unmount } = renderCard({ canWrite: true, actividad: { ...ACTIVIDAD, responsable_id: "otro-usuario" } })
      expect(await screen.findByRole("button", { name: "Registrar avance 1.1" })).toBeInTheDocument()
      unmount()

      renderCard({ canWrite: false })
      await screen.findByTestId("ejecucion-actividad")
      expect(screen.queryByRole("button", { name: "Registrar avance 1.1" })).not.toBeInTheDocument()
    })

    it("offers no «Registrar avance» on a finished activity, says what to do and offers «Solicitar modificación»", async () => {
      const user = userEvent.setup()
      for (const estado of ["FINALIZADA", "FINALIZADA_CON_RETRASO"] as const) {
        const solicitar = vi.fn()
        const { unmount } = renderCard({
          canWrite: true,
          tecnico: { ...TECNICO, estado, progreso: 90 },
          onSolicitarModificacion: solicitar,
        })
        await screen.findByTestId("ejecucion-actividad")
        expect(screen.queryByRole("button", { name: "Registrar avance 1.1" }), estado).not.toBeInTheDocument()
        expect(
          screen.getByText("Ya no recibe avances. Para corregir, anula el último avance o solicita una modificación."),
        ).toBeInTheDocument()
        await user.click(screen.getByRole("button", { name: "Solicitar modificación" }))
        expect(solicitar).toHaveBeenCalledTimes(1)
        unmount()
      }
    })

    it("hides «Solicitar modificación» when the ficha does not offer it", async () => {
      renderCard({ canWrite: true, tecnico: { ...TECNICO, estado: "FINALIZADA", progreso: 90 } })
      await screen.findByTestId("ejecucion-actividad")
      expect(screen.queryByRole("button", { name: "Solicitar modificación" })).not.toBeInTheDocument()
    })
  })

  describe("finished activity at 100 %", () => {
    it("shows one compact row until «Ver historial», and folds back with «Ocultar historial»", async () => {
      const user = userEvent.setup()
      mockReportes([reporte({ porcentaje: "100.00", medios: 1 })])
      renderCard({ tecnico: { ...TECNICO, estado: "FINALIZADA_CON_RETRASO", progreso: 100 } })

      const tarjeta = screen.getByTestId("ejecucion-actividad")
      expect(tarjeta).toHaveTextContent("Finalizada con retraso")
      const ver = within(tarjeta).getByRole("button", { name: "Ver historial" })
      expect(ver).toHaveAttribute("aria-expanded", "false")
      expect(screen.queryByTestId("ejecucion-reportes")).not.toBeInTheDocument()

      await user.click(ver)
      expect(await screen.findByTestId("ejecucion-reportes")).toBeInTheDocument()
      const ocultar = screen.getByRole("button", { name: "Ocultar historial" })
      expect(ocultar).toHaveAttribute("aria-expanded", "true")
      expect(ocultar).toHaveFocus()

      await user.click(ocultar)
      expect(screen.queryByTestId("ejecucion-reportes")).not.toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Ver historial" })).toHaveFocus()
    })

    it("opens when the Tablero or the header asks to focus it", async () => {
      mockReportes([reporte({ porcentaje: "100.00" })])
      renderCard({ tecnico: { ...TECNICO, estado: "FINALIZADA", progreso: 100 }, enfocar: 1 })
      expect(await screen.findByTestId("ejecucion-reportes")).toBeInTheDocument()
      await waitFor(() => expect(screen.getByTestId("ejecucion-actividad")).toHaveFocus())
    })
  })

  describe("entregables", () => {
    it("are folded on an activity in progress behind «Ver N entregables»", async () => {
      const user = userEvent.setup()
      renderCard({ entregables: [ENTREGABLE, ENTREGABLE2] })
      const ver = screen.getByRole("button", { name: "Ver 2 entregables" })
      // T10 C12: underlined, as in the prototype.
      expect(ver.className).toMatch(/(^|\s)underline(\s|$)/)
      expect(ver).toHaveAttribute("aria-expanded", "false")
      expect(screen.queryByTestId("ejecucion-entregable")).not.toBeInTheDocument()

      await user.click(ver)
      expect(screen.getAllByTestId("ejecucion-entregable")).toHaveLength(2)
      const ocultar = screen.getByRole("button", { name: "Ocultar entregables" })
      expect(ocultar).toHaveAttribute("aria-expanded", "true")
      expect(document.getElementById(ocultar.getAttribute("aria-controls") ?? "")).toBeInTheDocument()
    })

    it("are open on an overdue activity, as a table with Meta, Contado, Falta and Soportes", () => {
      renderCard({
        corte: DESPUES_DEL_FIN,
        entregables: [ENTREGABLE, ENTREGABLE2],
        progreso: new Map([
          ["e1", { estado: "EN_EJECUCION", meta: "2.00", avances: [avance(), avance({ id: "av2", cantidad: "1.00" })] }],
          ["e2", { estado: "EN_EJECUCION", meta: "2.00", avances: [] }],
        ]),
      })
      expect(screen.getByText("Entregables · 1 de 2 completos")).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Ayuda: Entregables" })).toBeInTheDocument()
      const tabla = screen.getByRole("table")
      expect(within(tabla).getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
        "Entregable",
        "Meta",
        "Contado",
        "Falta",
        "Soportes",
        "Acción",
      ])
      const [primero, segundo] = screen.getAllByTestId("ejecucion-entregable")
      expect(primero).toHaveTextContent("ENT-1")
      expect(primero).toHaveTextContent("2 actas")
      expect(primero).toHaveTextContent("+1 sobre la meta")
      expect(within(primero).getAllByRole("cell")[3]).toHaveTextContent("0")
      expect(within(segundo).getAllByRole("cell")[2]).toHaveTextContent("0")
      expect(within(segundo).getAllByRole("cell")[3]).toHaveTextContent("2")
    })

    it("shows «—» instead of zeros while an entregable's progress has not arrived", () => {
      renderCard({
        corte: DESPUES_DEL_FIN,
        entregables: [ENTREGABLE, ENTREGABLE2],
        progreso: progresoDe([avance()]),
      })
      expect(screen.getByText("Entregables")).toBeInTheDocument()
      expect(screen.queryByText(/de 2 completos/)).not.toBeInTheDocument()
      const [primero, segundo] = screen.getAllByTestId("ejecucion-entregable")
      expect(within(primero).getAllByRole("cell")[2]).toHaveTextContent("2")
      const celdas = within(segundo).getAllByRole("cell")
      expect(celdas[2]).toHaveTextContent("—")
      expect(celdas[3]).toHaveTextContent("—")
      expect(celdas[4]).toHaveTextContent("—")
      expect(within(segundo).queryByRole("button", { name: /archivo/ })).not.toBeInTheDocument()
    })

    it("flags live quantities without a soporte as pending; a voided one counts for nothing", () => {
      renderCard({
        corte: DESPUES_DEL_FIN,
        entregables: [ENTREGABLE],
        progreso: progresoDe([
          avance(),
          avance({ id: "av2", cantidad: "1.00", medios: 0, cuenta: false }),
          avance({ id: "av3", cantidad: "5.00", anulado_at: "2026-10-21T00:00:00.000Z", motivo_anulacion: "error", cuenta: false }),
        ]),
      })
      expect(screen.getByTestId("ejecucion-pendiente-soporte")).toHaveTextContent("1 pendiente de soporte")
      const celdas = within(screen.getByTestId("ejecucion-entregable")).getAllByRole("cell")
      expect(celdas[2]).toHaveTextContent(/^Contados*2(?!d)/)
    })

    it("opens the registered quantities with their soportes from «N archivos»", async () => {
      const user = userEvent.setup()
      const soportes = [
        { id: "m-1", proyecto_id: "p1", avance_id: "av1", nombre: "acta-1.pdf", tipo: "archivo" as const, url_externa: null, tipo_mime: "application/pdf", tamano_bytes: 10, subido_por_id: "u1", created_at: "2026-10-20T00:00:00.000Z" },
        { id: "m-2", proyecto_id: "p1", avance_id: "av1", nombre: "Carpeta Drive", tipo: "enlace" as const, url_externa: "https://drive.example/f", tipo_mime: null, tamano_bytes: null, subido_por_id: "u1", created_at: "2026-10-20T00:00:02.000Z" },
      ]
      renderCard({
        corte: DESPUES_DEL_FIN,
        entregables: [ENTREGABLE],
        progreso: progresoDe([avance({ medios: 2, soportes })]),
      })
      const archivos = screen.getByRole("button", { name: "2 archivos" })
      expect(archivos).toHaveAttribute("aria-expanded", "false")
      expect(screen.queryByTestId("ejecucion-avance")).not.toBeInTheDocument()

      await user.click(archivos)
      expect(archivos).toHaveAttribute("aria-expanded", "true")
      const fila = screen.getByTestId("ejecucion-avance")
      expect(fila).toHaveTextContent("Cuenta")
      expect(within(fila).getByText("acta-1.pdf")).toBeInTheDocument()
      expect(within(fila).getByRole("link", { name: "Carpeta Drive" })).toHaveAttribute("href", "https://drive.example/f")
    })

    it("keeps «Anular» (managers) and «Adjuntar archivo» (writers) on a live quantity", async () => {
      const user = userEvent.setup()
      renderCard({ canWrite: true, canVoid: true, corte: DESPUES_DEL_FIN, entregables: [ENTREGABLE], progreso: progresoDe([avance()]) })
      await user.click(screen.getByRole("button", { name: "1 archivo" }))
      const fila = screen.getByTestId("ejecucion-avance")
      expect(within(fila).getByRole("button", { name: "Anular" })).toBeInTheDocument()
      expect(within(fila).getByRole("button", { name: "Adjuntar archivo" })).toBeInTheDocument()
    })

    it("offers no attach or void control without permission", async () => {
      const user = userEvent.setup()
      renderCard({ corte: DESPUES_DEL_FIN, entregables: [ENTREGABLE], progreso: progresoDe([avance()]) })
      await user.click(screen.getByRole("button", { name: "1 archivo" }))
      expect(screen.queryByRole("button", { name: "Adjuntar archivo" })).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "Anular" })).not.toBeInTheDocument()
    })

    it("attaches a second medio (link) to an existing quantity with one POST to its attachments", async () => {
      const user = userEvent.setup()
      renderCard({ canWrite: true, corte: DESPUES_DEL_FIN, entregables: [ENTREGABLE], progreso: progresoDe([avance()]) })
      await user.click(screen.getByRole("button", { name: "1 archivo" }))
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
      expect(JSON.parse(attachCall![1].body as string)).toEqual({ url_externa: "https://drive.example.com/f/1", nombre: "Acta firmada" })
    })

    it("offers «Registrar cantidad» while the activity takes progress, never once it is finished", async () => {
      const user = userEvent.setup()
      const { unmount } = renderCard({ canWrite: true, corte: DESPUES_DEL_FIN, entregables: [ENTREGABLE], progreso: progresoDe([]) })
      expect(screen.getByRole("button", { name: "Registrar cantidad ENT-1" })).toBeInTheDocument()
      unmount()

      renderCard({ canWrite: true, tecnico: { ...TECNICO, estado: "FINALIZADA", progreso: 90 }, entregables: [ENTREGABLE], progreso: progresoDe([]) })
      await user.click(screen.getByRole("button", { name: "Ver 1 entregable" }))
      expect(screen.getByTestId("ejecucion-entregable")).toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "Registrar cantidad ENT-1" })).not.toBeInTheDocument()
    })

    it("opens the Registrar cantidad form in a bottom sheet on phones", async () => {
      mockViewport(true)
      const user = userEvent.setup()
      renderCard({ canWrite: true, corte: DESPUES_DEL_FIN, entregables: [ENTREGABLE], progreso: progresoDe([]) })
      await user.click(screen.getByRole("button", { name: "Registrar cantidad ENT-1" }))
      const dialog = await screen.findByRole("dialog", { name: "Registrar cantidad ENT-1" })
      expect(within(dialog).getByRole("form", { name: "Registrar cantidad ENT-1" })).toBeInTheDocument()
    })
  })

  describe("historial de avances", () => {
    it("lists the reports newest first with porcentaje, author, date and what was done, never the author's id", async () => {
      mockReportes([
        reporte({ id: "r1", fecha: "2026-10-10", porcentaje: "30.00", medios: 1 }),
        reporte({ id: "r2", fecha: "2026-10-20", porcentaje: "70.00", registrado_por_nombre: "Laura Jiménez" }),
      ])
      renderCard()

      expect(await screen.findByText("Historial de avances")).toBeInTheDocument()
      const [primero, segundo] = await screen.findAllByTestId("ejecucion-reporte")
      expect(primero).toHaveTextContent("70 % · Laura Jiménez · 20 de oct de 2026")
      expect(primero).toHaveTextContent("Sin soporte")
      expect(segundo).toHaveTextContent("30 % · Ana Pérez · 10 de oct de 2026")
      expect(segundo).toHaveTextContent("Se ejecutó el taller inicial; falta el acta firmada.")
      expect(segundo).toHaveTextContent("Con soporte")
      expect(segundo).not.toHaveTextContent("6e9fd0f1-a71e-46a3-bef1-cd53487deccd")
    })

    it("shows a voided report as «Anulado» with its motivo, not struck through", async () => {
      mockReportes([
        reporte({ id: "r1", fecha: "2026-10-10", porcentaje: "30.00", anulado_at: "2026-10-12T00:00:00.000Z", motivo_anulacion: "Porcentaje mal digitado" }),
      ])
      renderCard({ canWrite: true })
      const fila = await screen.findByTestId("ejecucion-reporte")
      expect(fila).toHaveTextContent("30 % · Ana Pérez")
      expect(fila).toHaveTextContent("Anulado")
      expect(fila).toHaveTextContent("Motivo: Porcentaje mal digitado")
      expect(fila.innerHTML).not.toMatch(/line-through/)
      expect(within(fila).queryByRole("button", { name: "Adjuntar soporte" })).not.toBeInTheDocument()
      expect(within(fila).queryByRole("button", { name: "Anular" })).not.toBeInTheDocument()
    })

    it("offers «Adjuntar soporte» only on a live report without one, and «Anular» only on the latest live one", async () => {
      mockReportes([
        reporte({ id: "r1", fecha: "2026-10-10", porcentaje: "30.00" }),
        reporte({ id: "r2", fecha: "2026-10-20", porcentaje: "70.00", medios: 1 }),
      ])
      renderCard({ canWrite: true })
      const [ultimo, anterior] = await screen.findAllByTestId("ejecucion-reporte")
      expect(within(ultimo).queryByRole("button", { name: "Adjuntar soporte" })).not.toBeInTheDocument()
      expect(within(ultimo).getByRole("button", { name: "Anular" })).toBeInTheDocument()
      expect(within(anterior).getByRole("button", { name: "Adjuntar soporte" })).toBeInTheDocument()
      expect(within(anterior).queryByRole("button", { name: "Anular" })).not.toBeInTheDocument()
    })

    it("offers «Anular» on the latest live report even when a later one was voided, as the API decides", async () => {
      mockReportes([
        reporte({ id: "r1", fecha: "2026-10-11", porcentaje: "90.00", created_at: "2026-10-11T00:00:00.000Z" }),
        reporte({ id: "r2", fecha: "2026-11-03", porcentaje: "30.00", created_at: "2026-11-03T00:00:00.000Z", anulado_at: "2026-11-04T00:00:00.000Z", motivo_anulacion: "Error" }),
      ])
      renderCard({ canWrite: true, tecnico: { ...TECNICO, estado: "FINALIZADA", progreso: 90 } })
      const [anulado, vigente] = await screen.findAllByTestId("ejecucion-reporte")
      expect(within(anulado).queryByRole("button", { name: "Anular" })).not.toBeInTheDocument()
      expect(within(vigente).getByRole("button", { name: "Anular" })).toBeInTheDocument()
    })

    it("hides «Adjuntar soporte» and «Anular» from someone who cannot write", async () => {
      mockReportes([reporte()])
      renderCard({ canWrite: false })
      const fila = await screen.findByTestId("ejecucion-reporte")
      expect(fila).toHaveTextContent("Sin soporte")
      expect(within(fila).queryByRole("button")).not.toBeInTheDocument()
    })

    it("voids the latest report with a motivo", async () => {
      const user = userEvent.setup()
      mockReportes([reporte()])
      renderCard({ canWrite: true })
      const fila = await screen.findByTestId("ejecucion-reporte")
      await user.click(within(fila).getByRole("button", { name: "Anular" }))
      const confirmar = within(fila).getByRole("button", { name: "Confirmar anulación" })
      expect(confirmar).toBeDisabled()
      await user.type(within(fila).getByLabelText("Motivo de anulación"), "Porcentaje mal digitado")
      await user.click(confirmar)
      await waitFor(() => {
        const llamada = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/activities/a1/progress/r1/void"))
        expect(JSON.parse(String(llamada?.[1]?.body))).toEqual({ motivo: "Porcentaje mal digitado" })
      })
    })

    it("attaches a soporte to a report without one", async () => {
      const user = userEvent.setup()
      mockReportes([reporte()])
      renderCard({ canWrite: true })
      const fila = await screen.findByTestId("ejecucion-reporte")
      await user.click(within(fila).getByRole("button", { name: "Adjuntar soporte" }))
      const form = within(fila).getByRole("form", { name: "Adjuntar soporte" })
      await user.click(within(form).getByRole("radio", { name: "Enlace" }))
      await user.type(within(form).getByLabelText("URL"), "https://drive.example.com/r1")
      await user.type(within(form).getByLabelText("Nombre del enlace"), "Lista de asistencia")
      await user.click(within(form).getByRole("button", { name: "Adjuntar" }))
      await waitFor(() => {
        const llamada = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/activities/a1/progress/r1/attachments"))
        expect(JSON.parse(String(llamada?.[1]?.body))).toEqual({ url_externa: "https://drive.example.com/r1", nombre: "Lista de asistencia" })
      })
    })

    it("explains a failing history read", async () => {
      fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ error: "Falla", code: "INTERNAL_ERROR" }, 500)))
      renderCard()
      expect(await screen.findByRole("alert")).toHaveTextContent("Falla")
    })
  })

  describe("Registrar avance form", () => {
    function mockPost(options: { reportes?: ProjectActivityReport[]; post?: (body: { porcentaje: number }) => Response } = {}) {
      fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
        const url = String(input)
        const method = init?.method ?? "GET"
        if (url.endsWith("/activities/a1/progress") && method === "GET") {
          return Promise.resolve(jsonResponse({ estado: "EN_EJECUCION", reportes: options.reportes ?? [] }))
        }
        if (url.endsWith("/activities/a1/progress") && method === "POST") {
          const body = JSON.parse(String(init?.body))
          return Promise.resolve(
            options.post?.(body) ?? jsonResponse({ reporte: reporte({ id: "r9", porcentaje: String(body.porcentaje) }) }, 201),
          )
        }
        return Promise.resolve(jsonResponse({}))
      })
    }

    const posts = () =>
      fetchMock.mock.calls.filter(
        ([url, init]) => String(url).endsWith("/activities/a1/progress") && (init?.method ?? "GET") === "POST",
      )

    it("opens inline with the design's fields, focuses the date and gives the focus back on Cancelar", async () => {
      const user = userEvent.setup()
      renderCard({ canWrite: true, tecnico: TECNICO_V6 })
      await user.click(screen.getByRole("button", { name: "Registrar avance 1.1" }))
      const form = screen.getByRole("form", { name: "Registrar avance 1.1" })
      expect(within(form).getByLabelText("Fecha del avance")).toHaveFocus()
      expect(within(form).getByLabelText("Avance total de la actividad (%)")).toBeInTheDocument()
      expect(within(form).getByLabelText("Qué se hizo")).toHaveAttribute(
        "placeholder",
        "Ejemplo: segunda visita de acompañamiento a dos unidades.",
      )
      expect(within(form).getByLabelText("Archivo del soporte")).toBeInTheDocument()
      expect(form).toHaveTextContent(
        "Hoy va en 50 %. Escribe hasta dónde llega con este avance; con avances se llega como máximo al 90 %.",
      )

      await user.click(within(form).getByRole("button", { name: "Cancelar" }))
      expect(screen.queryByRole("form", { name: "Registrar avance 1.1" })).not.toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Registrar avance 1.1" })).toHaveFocus()
    })

    it("warns live above the tope and disables «Guardar avance» until the value fits", async () => {
      const user = userEvent.setup()
      mockPost()
      renderCard({ canWrite: true })
      await user.click(screen.getByRole("button", { name: "Registrar avance 1.1" }))
      const form = screen.getByRole("form", { name: "Registrar avance 1.1" })
      const pct = within(form).getByLabelText("Avance total de la actividad (%)")
      await user.type(pct, "95")
      expect(within(form).getByRole("alert")).toHaveTextContent(
        "El avance llega como máximo al 90 %. El 10 % restante se completa cuando se cuentan los entregables de la actividad.",
      )
      expect(pct).toHaveAttribute("aria-invalid", "true")
      expect(within(form).getByRole("button", { name: "Guardar avance" })).toBeDisabled()

      await user.clear(pct)
      await user.type(pct, "90")
      expect(within(form).queryByRole("alert")).not.toBeInTheDocument()
      await user.type(within(form).getByLabelText("Qué se hizo"), "Casi todo listo.")
      await user.click(within(form).getByRole("button", { name: "Guardar avance" }))
      await waitFor(() => expect(posts()).toHaveLength(1))
      expect(JSON.parse(String(posts()[0][1]?.body)).porcentaje).toBe(90)
    })

    it("lets the activity reach 100 % once its deliverables are complete", async () => {
      const user = userEvent.setup()
      mockPost()
      renderCard({ canWrite: true, entregables: [ENTREGABLE], progreso: progresoDe([avance()]) })
      await user.click(screen.getByRole("button", { name: "Registrar avance 1.1" }))
      const form = screen.getByRole("form", { name: "Registrar avance 1.1" })
      expect(form).toHaveTextContent("Sus entregables están completos: puede llegar hasta 100 %.")
      await user.type(within(form).getByLabelText("Avance total de la actividad (%)"), "100")
      expect(within(form).queryByRole("alert")).not.toBeInTheDocument()
      expect(within(form).getByRole("button", { name: "Guardar avance" })).toBeEnabled()
    })

    it("shows each error under its field, in order, and focuses the first one", async () => {
      const user = userEvent.setup()
      renderCard({ canWrite: true })
      await user.click(screen.getByRole("button", { name: "Registrar avance 1.1" }))
      const form = screen.getByRole("form", { name: "Registrar avance 1.1" })
      await user.click(within(form).getByRole("button", { name: "Guardar avance" }))

      const pct = within(form).getByLabelText("Avance total de la actividad (%)")
      const obs = within(form).getByLabelText("Qué se hizo")
      expect(pct).toHaveAttribute("aria-invalid", "true")
      expect(pct).toHaveAccessibleDescription(expect.stringContaining("El porcentaje debe ser mayor que 0 y menor o igual a 100."))
      expect(obs).toHaveAttribute("aria-invalid", "true")
      expect(obs).toHaveAccessibleDescription("La observación es obligatoria.")
      expect(pct).toHaveFocus()
      expect(posts()).toHaveLength(0)
    })

    it("rejects a value that is not above the last live report before calling the API", async () => {
      const user = userEvent.setup()
      mockPost({ reportes: [reporte({ porcentaje: "70.00" })] })
      renderCard({ canWrite: true })
      await screen.findByTestId("ejecucion-reporte")
      await user.click(screen.getByRole("button", { name: "Registrar avance 1.1" }))
      const form = screen.getByRole("form", { name: "Registrar avance 1.1" })
      await user.type(within(form).getByLabelText("Avance total de la actividad (%)"), "70")
      await user.type(within(form).getByLabelText("Qué se hizo"), "Lo mismo de antes.")
      await user.click(within(form).getByRole("button", { name: "Guardar avance" }))
      expect(form).toHaveTextContent("El avance debe ser mayor que el último reportado (70 %).")
      expect(posts()).toHaveLength(0)
    })

    it("shows the API's own message when it refuses the report", async () => {
      const user = userEvent.setup()
      mockPost({ post: () => jsonResponse({ error: "El proyecto aún no tiene línea base aprobada." }, 409) })
      renderCard({ canWrite: true })
      await user.click(screen.getByRole("button", { name: "Registrar avance 1.1" }))
      const form = screen.getByRole("form", { name: "Registrar avance 1.1" })
      await user.type(within(form).getByLabelText("Avance total de la actividad (%)"), "30")
      await user.type(within(form).getByLabelText("Qué se hizo"), "Taller inicial.")
      await user.click(within(form).getByRole("button", { name: "Guardar avance" }))
      await waitFor(() => expect(form).toHaveTextContent("El proyecto aún no tiene línea base aprobada."))
    })

    it("saves, closes, announces the new value and marks the entry as «Nuevo»", async () => {
      const user = userEvent.setup()
      mockPost()
      renderCard({ canWrite: true })
      await user.click(screen.getByRole("button", { name: "Registrar avance 1.1" }))
      const form = screen.getByRole("form", { name: "Registrar avance 1.1" })
      await user.type(within(form).getByLabelText("Avance total de la actividad (%)"), "70")
      await user.type(within(form).getByLabelText("Qué se hizo"), "Se ejecutó el taller inicial.")

      mockPost({ reportes: [reporte({ id: "r9", porcentaje: "70.00" })] })
      await user.click(within(form).getByRole("button", { name: "Guardar avance" }))

      expect(await screen.findByRole("status")).toHaveTextContent("Avance registrado: la 1.1 queda en 70 %.")
      expect(screen.queryByRole("form", { name: "Registrar avance 1.1" })).not.toBeInTheDocument()
      expect(JSON.parse(String(posts()[0][1]?.body))).toMatchObject({ porcentaje: 70, observacion: "Se ejecutó el taller inicial." })
      const fila = await screen.findByTestId("ejecucion-reporte")
      expect(within(fila).getByText("Nuevo")).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Registrar avance 1.1" })).toHaveFocus()
    })

    it("creates the report first and then attaches the pasted link to it", async () => {
      const user = userEvent.setup()
      mockPost()
      renderCard({ canWrite: true })
      await user.click(screen.getByRole("button", { name: "Registrar avance 1.1" }))
      const form = screen.getByRole("form", { name: "Registrar avance 1.1" })
      await user.type(within(form).getByLabelText("Avance total de la actividad (%)"), "40")
      await user.type(within(form).getByLabelText("Qué se hizo"), "Visita a dos unidades.")
      const pegar = within(form).getByRole("button", { name: "o pega un enlace" })
      await user.click(pegar)
      expect(pegar).toHaveAttribute("aria-expanded", "true")
      await user.type(within(form).getByLabelText("URL del enlace"), "https://drive.example.com/visita")
      await user.type(within(form).getByLabelText("Nombre del enlace"), "Fotos de la visita")
      await user.click(within(form).getByRole("button", { name: "Guardar avance" }))

      await waitFor(() => {
        const urls = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST").map(([url]) => String(url))
        expect(urls).toEqual([
          "/api/v1/projects/p1/activities/a1/progress",
          "/api/v1/projects/p1/activities/a1/progress/r9/attachments",
        ])
      })
      const adjunto = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/r9/attachments"))
      expect(JSON.parse(String(adjunto?.[1]?.body))).toEqual({ url_externa: "https://drive.example.com/visita", nombre: "Fotos de la visita" })
      expect(await screen.findByRole("status")).toHaveTextContent("Avance registrado: la 1.1 queda en 40 %.")
    })

    it("refuses a link that is not https before saving anything", async () => {
      const user = userEvent.setup()
      mockPost()
      renderCard({ canWrite: true })
      await user.click(screen.getByRole("button", { name: "Registrar avance 1.1" }))
      const form = screen.getByRole("form", { name: "Registrar avance 1.1" })
      await user.type(within(form).getByLabelText("Avance total de la actividad (%)"), "40")
      await user.type(within(form).getByLabelText("Qué se hizo"), "Visita.")
      await user.click(within(form).getByRole("button", { name: "o pega un enlace" }))
      await user.type(within(form).getByLabelText("URL del enlace"), "http://inseguro.example.com")
      await user.type(within(form).getByLabelText("Nombre del enlace"), "Fotos")
      await user.click(within(form).getByRole("button", { name: "Guardar avance" }))
      expect(form).toHaveTextContent("El enlace debe ser una URL https válida (máximo 2000 caracteres).")
      expect(posts()).toHaveLength(0)
    })

    it("keeps the report when the soporte upload fails, and says so", async () => {
      const user = userEvent.setup()
      fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
        const url = String(input)
        const method = init?.method ?? "GET"
        if (url.endsWith("/activities/a1/progress") && method === "GET") {
          return Promise.resolve(jsonResponse({ estado: "EN_EJECUCION", reportes: [] }))
        }
        if (url.endsWith("/activities/a1/progress") && method === "POST") {
          return Promise.resolve(jsonResponse({ reporte: reporte({ id: "r9", porcentaje: "40.00" }) }, 201))
        }
        if (url.endsWith("/attachments")) return Promise.resolve(jsonResponse({ error: "Falla" }, 500))
        return Promise.resolve(jsonResponse({}))
      })
      renderCard({ canWrite: true })
      await user.click(screen.getByRole("button", { name: "Registrar avance 1.1" }))
      const form = screen.getByRole("form", { name: "Registrar avance 1.1" })
      await user.type(within(form).getByLabelText("Avance total de la actividad (%)"), "40")
      await user.type(within(form).getByLabelText("Qué se hizo"), "Visita.")
      await user.click(within(form).getByRole("button", { name: "o pega un enlace" }))
      await user.type(within(form).getByLabelText("URL del enlace"), "https://drive.example.com/visita")
      await user.type(within(form).getByLabelText("Nombre del enlace"), "Fotos")
      await user.click(within(form).getByRole("button", { name: "Guardar avance" }))

      expect(await screen.findByRole("status")).toHaveTextContent(
        "Avance registrado: la 1.1 queda en 40 %. El avance quedó guardado, pero no pudimos subir el soporte.",
      )
    })

    it("opens in a bottom sheet titled with the activity on phones", async () => {
      mockViewport(true)
      const user = userEvent.setup()
      renderCard({ canWrite: true })
      await user.click(screen.getByRole("button", { name: "Registrar avance 1.1" }))
      const dialog = await screen.findByRole("dialog", { name: "Registrar avance 1.1 · Taller de formación" })
      expect(within(dialog).getByRole("form", { name: "Registrar avance 1.1" })).toBeInTheDocument()
      expect(within(dialog).getByRole("button", { name: "Guardar avance" }).className).toMatch(/(^|\s)h-11(\s|$)/)
    })
  })
})
