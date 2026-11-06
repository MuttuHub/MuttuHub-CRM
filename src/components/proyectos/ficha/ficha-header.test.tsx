// Cabecera de la ficha (rediseño S2/S6): código, nombre, estado y «Cliente · Responsable»; los semáforos solo
// cuando quien la monta lo pide; «Registrar avance» y «Registrar gasto» en la cabecera de escritorio y en una
// barra inferior fija en el teléfono. Las queries son reales; solo se burla `fetch`.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectListRow } from "@/hooks/projects"
import { mockViewport } from "@/test/viewport"
import { FichaHeader } from "./ficha-header"

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
  wrapper.displayName = "QueryClientTestWrapper"
  return wrapper
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

const PROYECTO: ProjectListRow = {
  id: "p1",
  codigo: "PRY-2026-001",
  nombre: "Demo CedeTextil",
  estado: "EN_EJECUCION",
  origen: "OPORTUNIDAD",
  cliente: { id: "c1", nombre: "Instituto Andino" },
  responsable: { id: "u1", nombre: "Laura Jiménez" },
  fecha_inicio: "2026-10-05",
  fecha_fin: "2027-01-29",
  duracion_semanas: 17,
  valor_total: "177360000.00",
  diferencia_valor_oportunidad: null,
  alertas: [],
  beneficiarios_meta: 500,
  lineas: [],
  municipios: [],
}

const KPIS = {
  base: "vigente", corte: "2026-11-05", estado: "EN_EJECUCION", medible: true, confirmado: false,
  tecnico: { corte: "2026-11-05", avance_real: 35.7, avance_programado: 77.3, desviacion_pp: 41.6, color: "rojo" },
  cronograma: null, entregables: null, indicadores: null, beneficiarios: null,
  financiero: {
    corte: "2026-11-05", asignado: "100.00", programado: "50.00", ejecutado: "12.45", ea: 12.4, ep: 24.9, color: "verde",
    alerta_retraso: false,
  },
}

const fetchMock = vi.fn()

function mockApi(rol: string | null = "GERENCIA") {
  fetchMock.mockImplementation((input: unknown) => {
    const url = String(input)
    if (url.endsWith("/auth/me")) {
      return Promise.resolve(jsonResponse({ usuario: rol ? { id: "u9", nombre: "Gestor", rol } : null }))
    }
    if (url.includes("/kpis")) return Promise.resolve(jsonResponse(KPIS))
    if (url.endsWith("/members")) return Promise.resolve(jsonResponse({ miembros: [] }))
    return Promise.resolve(jsonResponse({}))
  })
}

type Props = Partial<React.ComponentProps<typeof FichaHeader>>

function renderHeader(props: Props = {}) {
  const onIrA = vi.fn()
  const onRegistrarAvance = vi.fn()
  const { unmount } = render(
    <FichaHeader proyecto={PROYECTO} onIrA={onIrA} onRegistrarAvance={onRegistrarAvance} {...props} />,
    { wrapper: createWrapper() },
  )
  return { onIrA, onRegistrarAvance, unmount }
}

describe("FichaHeader", () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    mockViewport(false)
  })

  afterEach(() => vi.unstubAllGlobals())

  it("shows the code, the name as the focusable page title, the state and «Cliente · Responsable»", async () => {
    mockApi()

    renderHeader()

    const header = screen.getByTestId("ficha-header")
    expect(within(header).getByText("PRY-2026-001")).toBeInTheDocument()
    const titulo = within(header).getByRole("heading", { level: 1, name: "Demo CedeTextil" })
    expect(titulo).toHaveAttribute("id", "ficha-titulo")
    expect(titulo).toHaveAttribute("tabindex", "-1")
    expect(within(header).getByText("En ejecución")).toBeInTheDocument()
    expect(within(header).getByTestId("ficha-header-cliente")).toHaveTextContent(
      "Instituto Andino · Responsable: Laura Jiménez",
    )
  })

  it("says «Sin asignar» when the project has no responsible", () => {
    mockApi()

    renderHeader({ proyecto: { ...PROYECTO, responsable: null } })

    expect(screen.getByTestId("ficha-header-cliente")).toHaveTextContent("Responsable: Sin asignar")
  })

  it("keeps the semáforo chips by default and leaves them out when asked (the Resumen shows the figures)", async () => {
    mockApi()

    const conSemaforos = renderHeader()
    expect(await screen.findByRole("button", { name: "Semáforo técnico: Rojo" })).toBeInTheDocument()
    conSemaforos.unmount()

    renderHeader({ mostrarSemaforos: false })
    await screen.findByRole("button", { name: "Registrar avance" })
    expect(screen.queryByText(/Semáforo técnico/)).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/kpis"))).toHaveLength(1)
  })

  it("opens the expense form when the caller handles «Registrar gasto», and the Finanzas tab otherwise", async () => {
    mockApi()
    const user = userEvent.setup()
    const onRegistrarGasto = vi.fn()

    const conFormulario = renderHeader({ onRegistrarGasto })
    await user.click(await screen.findByRole("button", { name: "Registrar gasto" }))
    expect(onRegistrarGasto).toHaveBeenCalledTimes(1)
    expect(conFormulario.onIrA).not.toHaveBeenCalled()
    conFormulario.unmount()

    const sinFormulario = renderHeader()
    await user.click(await screen.findByRole("button", { name: "Registrar gasto" }))
    expect(sinFormulario.onIrA).toHaveBeenCalledWith("finanzas")
  })

  it("has no bottom bar on desktop", async () => {
    mockApi()

    renderHeader()

    await screen.findByRole("button", { name: "Registrar avance" })
    expect(screen.queryByTestId("ficha-barra-acciones")).not.toBeInTheDocument()
  })

  it("moves both execution actions to a fixed bottom bar of 44 px buttons on a phone, once each", async () => {
    mockViewport(true)
    mockApi()
    const user = userEvent.setup()

    const { onRegistrarAvance } = renderHeader()

    const barra = await screen.findByTestId("ficha-barra-acciones")
    expect(barra.className).toMatch(/(^|\s)fixed(\s|$)/)
    const avance = within(barra).getByRole("button", { name: "Registrar avance" })
    const gasto = within(barra).getByRole("button", { name: "Registrar gasto" })
    for (const boton of [avance, gasto]) expect(boton.className).toMatch(/(^|\s)h-11(\s|$)/)
    expect(screen.getAllByRole("button", { name: "Registrar avance" })).toHaveLength(1)
    await user.click(avance)
    expect(onRegistrarAvance).toHaveBeenCalledTimes(1)
  })

  it("hides the bottom bar on a phone when neither action is allowed", async () => {
    mockViewport(true)
    mockApi("COLABORADOR")

    renderHeader()

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/members", expect.any(Object)))
    expect(screen.queryByTestId("ficha-barra-acciones")).not.toBeInTheDocument()
  })

  it("hides the client line on a phone, where the header keeps code, name and state", () => {
    mockApi()

    renderHeader()

    expect(screen.getByTestId("ficha-header-cliente").className).toMatch(/(^|\s)hidden(\s|$)/)
    expect(screen.getByTestId("ficha-header-cliente").className).toMatch(/(^|\s)sm:block(\s|$)/)
  })
})
