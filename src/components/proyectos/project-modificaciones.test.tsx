// S8 U6: sección "Modificaciones" (cola de solicitudes + decisión). Las queries y las mutaciones son reales;
// solo se burlan `fetch` y `sonner`. Los botones por rol son comodidad: la autoridad es la API (A-01).

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectListRow } from "@/hooks/projects"
import { ProjectModificaciones } from "./project-modificaciones"

const { toast } = vi.hoisted(() => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock("sonner", () => ({ toast }))

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

const PROYECTO: ProjectListRow = {
  id: "p1",
  codigo: "PRY-2026-001",
  nombre: "Fortalecimiento",
  estado: "EN_EJECUCION",
  origen: "INDEPENDIENTE",
  cliente: { id: "c1", nombre: "Alcaldía" },
  responsable: null,
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

const solicitud = (over: object = {}) => ({
  id: "s1",
  tipo: "TRASLADO",
  motivo: "Mover transporte a dotación",
  detalle: [
    { elemento: "presupuesto", clave: "R12", campo: "asignado", antes: "24000000.00", despues: "23000000" },
    { elemento: "actividad", clave: "1.4", campo: "semana_fin", antes: "6", despues: "8" },
  ],
  version_base_numero: 0,
  estado: "PENDIENTE",
  solicitado_por: { id: "c1", nombre: "Carla Coordinadora" },
  solicitado_at: "2026-10-12T15:00:00.000Z",
  decidido_por: null,
  decidido_at: null,
  comentario_decision: null,
  version_numero: null,
  ...over,
})

const SOLICITUDES = [
  solicitud({ id: "s0", estado: "APROBADA", motivo: "Ya aplicada", solicitado_at: "2026-10-09T15:00:00.000Z", decidido_por: { id: "g1", nombre: "Gina Gerente" }, decidido_at: "2026-10-10T15:00:00.000Z", version_numero: 1 }),
  solicitud({ id: "s2", estado: "RECHAZADA", motivo: "Muy grande", solicitado_at: "2026-10-11T15:00:00.000Z", decidido_por: { id: "g1", nombre: "Gina Gerente" }, decidido_at: "2026-10-11T18:00:00.000Z", comentario_decision: "No hay presupuesto" }),
  solicitud({ id: "s1" }),
]

describe("ProjectModificaciones", () => {
  const fetchMock = vi.fn()
  let queryClient: QueryClient

  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }

  type Setup = {
    rol?: string
    miembros?: { usuario: { id: string } }[]
    proyecto?: Partial<ProjectListRow>
    solicitudes?: unknown[]
    decide?: (url: string) => Response
  }

  function setup({ rol = "GERENCIA", miembros = [], proyecto = {}, solicitudes = SOLICITUDES, decide }: Setup = {}) {
    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith("/api/v1/auth/me")) return Promise.resolve(jsonResponse({ usuario: { id: "u1", nombre: "Ana", rol } }))
      if (url.endsWith("/members")) return Promise.resolve(jsonResponse({ miembros }))
      if (init?.method === "POST" && decide) return Promise.resolve(decide(url))
      if (url.endsWith("/modifications")) return Promise.resolve(jsonResponse({ solicitudes }))
      return Promise.resolve(jsonResponse({}))
    })
    return render(<ProjectModificaciones proyecto={{ ...PROYECTO, ...proyecto }} />, { wrapper })
  }

  const posts = () => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST") as [string, RequestInit][]

  beforeEach(() => {
    fetchMock.mockReset()
    toast.error.mockReset()
    toast.success.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  })
  afterEach(() => vi.unstubAllGlobals())

  it("only explains itself for a BORRADOR project, and reads nothing", () => {
    setup({ proyecto: { estado: "BORRADOR" } })
    expect(screen.getByTestId("modificaciones")).toHaveTextContent("Modificaciones")
    expect(screen.getByText(/línea base esté aprobada/i)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("lists the pending queue first, then the decided requests with their outcome", async () => {
    setup()

    const tarjetas = await screen.findAllByTestId("solicitud")
    expect(tarjetas.map((t) => t.getAttribute("data-estado"))).toEqual(["PENDIENTE", "RECHAZADA", "APROBADA"])
    expect(tarjetas[0]).toHaveTextContent("Mover transporte a dotación")
    expect(tarjetas[0]).toHaveTextContent("Traslado entre rubros")
    expect(tarjetas[0]).toHaveTextContent("Carla Coordinadora")
    expect(tarjetas[0]).toHaveTextContent("R12")
    expect(tarjetas[0]).toHaveTextContent("$ 24.000.000")
    expect(tarjetas[0]).toHaveTextContent("$ 23.000.000")
    expect(tarjetas[0]).toHaveTextContent("Semana final")
    expect(tarjetas[1]).toHaveTextContent("No hay presupuesto")
    expect(tarjetas[1]).toHaveTextContent("Gina Gerente")
    expect(tarjetas[2]).toHaveTextContent("Versión 1")
  })

  it("shows the empty state", async () => {
    setup({ solicitudes: [] })
    expect(await screen.findByText("Aún no hay solicitudes de modificación.")).toBeInTheDocument()
  })

  it("gives a manager the request button and Aprobar/Rechazar on the pending request only", async () => {
    setup()

    expect(await screen.findByRole("button", { name: "Solicitar modificación" })).toBeInTheDocument()
    const tarjetas = await screen.findAllByTestId("solicitud")
    expect(within(tarjetas[0]!).getByRole("button", { name: "Aprobar" })).toBeInTheDocument()
    expect(within(tarjetas[0]!).getByRole("button", { name: "Rechazar" })).toBeInTheDocument()
    expect(within(tarjetas[1]!).queryByRole("button", { name: "Aprobar" })).not.toBeInTheDocument()
    expect(within(tarjetas[2]!).queryByRole("button", { name: "Rechazar" })).not.toBeInTheDocument()
  })

  it("lets a member COORDINADOR request but not decide (A-01)", async () => {
    setup({ rol: "COORDINADOR", miembros: [{ usuario: { id: "u1" } }] })

    expect(await screen.findByRole("button", { name: "Solicitar modificación" })).toBeInTheDocument()
    await screen.findAllByTestId("solicitud")
    expect(screen.queryByRole("button", { name: "Aprobar" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Rechazar" })).not.toBeInTheDocument()
  })

  it("offers nothing to a COORDINADOR who is not a member, nor to a VISUALIZADOR", async () => {
    for (const rol of ["COORDINADOR", "VISUALIZADOR", "COLABORADOR"]) {
      queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
      const { unmount } = setup({ rol })
      await screen.findAllByTestId("solicitud")
      await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/api/v1/auth/me"))).toBe(true))
      expect(screen.queryByRole("button", { name: "Solicitar modificación" }), rol).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "Aprobar" }), rol).not.toBeInTheDocument()
      unmount()
      fetchMock.mockReset()
    }
  })

  it("does not offer a new request once the project is no longer EN_EJECUCION", async () => {
    setup({ proyecto: { estado: "CERRADO" } })
    await screen.findAllByTestId("solicitud")
    expect(screen.queryByRole("button", { name: "Solicitar modificación" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Aprobar" })).not.toBeInTheDocument()
  })

  it("approves in one click and toasts", async () => {
    const user = userEvent.setup()
    setup({ decide: () => jsonResponse({ version: { id: "v1", numero: 1, aprobado_at: "x" }, solicitud: solicitud({ estado: "APROBADA" }) }) })

    const [pendiente] = await screen.findAllByTestId("solicitud")
    await user.click(within(pendiente!).getByRole("button", { name: "Aprobar" }))

    await waitFor(() => expect(posts()).toHaveLength(1))
    expect(posts()[0]![0]).toBe("/api/v1/projects/p1/modifications/s1/approve")
    expect(toast.success).toHaveBeenCalledWith("Modificación aprobada.")
  })

  it("shows the rules that no longer hold when the approval is refused, inline", async () => {
    const user = userEvent.setup()
    setup({
      decide: () =>
        jsonResponse(
          {
            error: "El valor asignado de «R12» no puede quedar por debajo de lo ya ejecutado ($ 23.500.000).",
            code: "VALIDATION_ERROR",
            reglas: [{ codigo: "A_MENOR_QUE_EJECUTADO", mensaje: "El valor asignado de «R12» no puede quedar por debajo de lo ya ejecutado ($ 23.500.000)." }],
          },
          400,
        ),
    })

    const [pendiente] = await screen.findAllByTestId("solicitud")
    await user.click(within(pendiente!).getByRole("button", { name: "Aprobar" }))

    const reglas = await within(pendiente!).findByTestId("solicitud-reglas")
    expect(reglas).toHaveTextContent("«R12»")
    expect(toast.error).not.toHaveBeenCalled()
  })

  it("shows a stale request (409) inline", async () => {
    const user = userEvent.setup()
    setup({ decide: () => jsonResponse({ error: "La solicitud se basa en una versión anterior; vuelve a crearla.", code: "INVALID_STATE" }, 409) })

    const [pendiente] = await screen.findAllByTestId("solicitud")
    await user.click(within(pendiente!).getByRole("button", { name: "Aprobar" }))
    expect(await within(pendiente!).findByText("La solicitud se basa en una versión anterior; vuelve a crearla.")).toBeInTheDocument()
  })

  it("asks for a comment before rejecting", async () => {
    const user = userEvent.setup()
    setup({ decide: () => jsonResponse({ solicitud: solicitud({ estado: "RECHAZADA" }) }) })

    const [pendiente] = await screen.findAllByTestId("solicitud")
    await user.click(within(pendiente!).getByRole("button", { name: "Rechazar" }))
    const confirmar = within(pendiente!).getByRole("button", { name: "Confirmar rechazo" })
    expect(confirmar).toBeDisabled()
    expect(posts()).toHaveLength(0)

    await user.type(within(pendiente!).getByLabelText("Comentario del rechazo"), "No hay presupuesto")
    await user.click(confirmar)

    await waitFor(() => expect(posts()).toHaveLength(1))
    expect(posts()[0]![0]).toBe("/api/v1/projects/p1/modifications/s1/reject")
    expect(JSON.parse(String(posts()[0]![1].body))).toEqual({ comentario: "No hay presupuesto" })
    expect(toast.success).toHaveBeenCalledWith("Solicitud rechazada.")
  })

  it("shows the API error when the requests cannot be read", async () => {
    fetchMock.mockImplementation((input: unknown) =>
      Promise.resolve(
        String(input).endsWith("/modifications")
          ? jsonResponse({ error: "No tienes permisos sobre este proyecto.", code: "FORBIDDEN" }, 403)
          : jsonResponse({ usuario: { id: "u1", nombre: "Ana", rol: "COORDINADOR" }, miembros: [] }),
      ),
    )
    render(<ProjectModificaciones proyecto={PROYECTO} />, { wrapper })
    expect(await screen.findByRole("alert")).toHaveTextContent("No tienes permisos sobre este proyecto.")
  })
})
