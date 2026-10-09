// S6 U6: sección "Gastos" de la ficha (lista, registro, validación). Las queries son
// reales; solo se burla `fetch`. La API es la autoridad: aquí se fija lo que se muestra y
// qué controles aparecen según rol, membresía, estado del proyecto y autoría del gasto.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectListRow } from "@/hooks/projects"
import { expectTouchTargets, mockViewport } from "@/test/viewport"
import { ProjectGastos } from "./project-gastos"

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
  nombre: "Fortalecimiento",
  estado: "EN_EJECUCION",
  origen: "INDEPENDIENTE",
  cliente: { id: "c1", nombre: "Alcaldía" },
  responsable: null,
  fecha_inicio: "2026-10-05",
  fecha_fin: "2027-01-29",
  duracion_semanas: 17,
  valor_total: "83500000.00",
  diferencia_valor_oportunidad: null,
  alertas: [],
  beneficiarios_meta: null,
  lineas: [],
  municipios: [],
}

const gasto = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  proyecto_id: "p1",
  rubro: { id: "r12", codigo: "R12", nombre: "Transporte" },
  fecha_documento: "2026-10-15",
  periodo: "2026-10",
  tipo_soporte: "FACTURA_PROVEEDOR",
  tercero_nombre: "Proveedor SAS",
  tercero_tipo_id: "NIT",
  tercero_numero_id: "900123456",
  numero_documento: "FE-0123",
  descripcion: "Tiquetes del equipo",
  valor: "1500000.00",
  estado: "REGISTRADO",
  alerta_sobregasto: false,
  datos_incompletos: false,
  registrado_por_id: "otro",
  created_at: "2026-10-16T12:00:00.000Z",
  validado_por_id: null,
  validado_at: null,
  rechazado_por_id: null,
  rechazado_at: null,
  motivo_rechazo: null,
  anulado_por_id: null,
  anulado_at: null,
  motivo_anulacion: null,
  soportes: [
    { id: "s1", nombre: "factura.pdf", tipo: "archivo", url_externa: null, tipo_mime: "application/pdf", tamano_bytes: 100, subido_por_id: "otro", created_at: "2026-10-16T12:00:00.000Z" },
  ],
  ...over,
})

const TOTALES = Object.fromEntries(
  ["REGISTRADO", "VALIDADO", "RECHAZADO", "ANULADO"].map((e) => [e, { cantidad: 0, valor: "0.00" }]),
)

const BUDGET = {
  estado: "EN_EJECUCION",
  rubros: [
    { rubro_id: "r12", codigo: "R12", nombre: "Transporte", activo: true, linea_id: "l12", asignado: "24000000.00", heredado_pendiente: false },
    { rubro_id: "r99", codigo: "R99", nombre: "Sin asignar", activo: true, linea_id: null, asignado: "0.00", heredado_pendiente: false },
  ],
  suma: "24000000.00",
  valor_total: "83500000.00",
  diferencia: "59500000.00",
}

type Setup = {
  rol?: string
  usuarioId?: string
  miembro?: boolean
  proyecto?: Partial<ProjectListRow>
  gastos?: unknown[]
  conSoportes?: boolean
}

describe("ProjectGastos", () => {
  const fetchMock = vi.fn()

  function setup({ rol = "GERENCIA", usuarioId = "yo", miembro = false, proyecto = {}, gastos = [] }: Setup = {}) {
    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"
      if (url.endsWith("/api/v1/auth/me")) return Promise.resolve(jsonResponse({ usuario: { id: usuarioId, nombre: "Yo", rol } }))
      if (url.endsWith("/members")) {
        return Promise.resolve(
          jsonResponse({ miembros: miembro ? [{ id: "m1", usuario: { id: usuarioId, nombre: "Yo", rol }, agregado_por_id: "x", created_at: "2026-10-07T13:00:00.000Z", removed_at: null }] : [] }),
        )
      }
      if (url.endsWith("/budget")) return Promise.resolve(jsonResponse(BUDGET))
      if (url.endsWith("/expenses") && method === "GET") return Promise.resolve(jsonResponse({ gastos, totales: TOTALES }))
      return Promise.resolve(jsonResponse({}))
    })
    return render(<ProjectGastos proyecto={{ ...PROYECTO, ...proyecto }} />, { wrapper: createWrapper() })
  }

  const posts = () => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST")

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe("mobile capture", () => {
    afterEach(() => mockViewport(false))

    it("opens the expense form in a bottom sheet on phones, with 44 px controls", async () => {
      mockViewport(true)
      const user = userEvent.setup()
      setup({ rol: "GERENCIA" })
      await user.click(await screen.findByRole("button", { name: "Registrar gasto" }))
      const dialog = await screen.findByRole("dialog", { name: "Registrar gasto" })
      expectTouchTargets(dialog.querySelector("form") as HTMLElement)
    })

    it("keeps the expense form inline on desktop", async () => {
      const user = userEvent.setup()
      setup({ rol: "GERENCIA" })
      await user.click(await screen.findByRole("button", { name: "Registrar gasto" }))
      expect(screen.queryByRole("dialog")).toBeNull()
    })
  })

  describe("register control", () => {
    it("is shown to a manager on an EN_EJECUCION project", async () => {
      setup({ rol: "GERENCIA" })
      expect(await screen.findByRole("button", { name: "Registrar gasto" })).toBeInTheDocument()
    })

    it("is shown to a COORDINADOR who is an active member", async () => {
      setup({ rol: "COORDINADOR", miembro: true })
      expect(await screen.findByRole("button", { name: "Registrar gasto" })).toBeInTheDocument()
    })

    it("is hidden for a COORDINADOR who is not a member and for a COLABORADOR", async () => {
      for (const rol of ["COORDINADOR", "COLABORADOR"]) {
        const { unmount } = setup({ rol })
        await screen.findByTestId("gastos-lista")
        expect(screen.queryByRole("button", { name: "Registrar gasto" })).not.toBeInTheDocument()
        unmount()
      }
    })

    it("is hidden when the project is not EN_EJECUCION", async () => {
      for (const estado of ["BORRADOR", "SUSPENDIDO", "CERRADO"] as const) {
        const { unmount } = setup({ proyecto: { estado } })
        await screen.findByTestId("gastos-lista")
        expect(screen.queryByRole("button", { name: "Registrar gasto" })).not.toBeInTheDocument()
        unmount()
      }
    })
  })

  describe("list", () => {
    it("shows state chips, the amount and the red overspend flag", async () => {
      setup({
        gastos: [
          gasto("g1", { alerta_sobregasto: true }),
          gasto("g2", { estado: "VALIDADO", valor: "500000.00" }),
        ],
      })
      const lista = await screen.findByTestId("gastos-lista")
      const filas = await within(lista).findAllByTestId("gasto-fila")
      expect(filas).toHaveLength(2)
      expect(filas[0]).toHaveTextContent("Registrado")
      expect(filas[0]).toHaveTextContent("$ 1.500.000")
      expect(filas[0]).toHaveTextContent("Supera el asignado")
      expect(filas[1]).toHaveTextContent("Validado")
      expect(filas[1]).not.toHaveTextContent("Supera el asignado")
    })

    it("shows the third-party number and the support control only when the API sent them", async () => {
      setup({ gastos: [gasto("g1")] })
      const fila = await screen.findByTestId("gasto-fila")
      expect(fila).toHaveTextContent("900123456")
      expect(within(fila).getByRole("button", { name: "Ver soporte factura.pdf" })).toBeInTheDocument()
    })

    it("renders no identification number and no support for an actor without access (RNF-03)", async () => {
      const sinAcceso = gasto("g1")
      delete (sinAcceso as Record<string, unknown>).tercero_numero_id
      delete (sinAcceso as Record<string, unknown>).soportes
      setup({ rol: "COLABORADOR", gastos: [sinAcceso] })
      const fila = await screen.findByTestId("gasto-fila")
      expect(fila).not.toHaveTextContent("900123456")
      expect(within(fila).queryByRole("button", { name: /Ver soporte/ })).not.toBeInTheDocument()
    })

    it("shows the empty state", async () => {
      setup({ gastos: [] })
      const vacio = await screen.findByText("Aún no hay gastos registrados.")
      expect(vacio.closest("[data-slot='empty-state']")).not.toBeNull()
    })

    it("shows the rejection motivo and the void motivo", async () => {
      setup({
        gastos: [
          gasto("g1", { estado: "RECHAZADO", motivo_rechazo: "Soporte ilegible" }),
          gasto("g2", { estado: "ANULADO", motivo_anulacion: "Factura duplicada" }),
        ],
      })
      const filas = await screen.findAllByTestId("gasto-fila")
      expect(filas[0]).toHaveTextContent("Soporte ilegible")
      expect(filas[1]).toHaveTextContent("Factura duplicada")
    })
  })

  describe("validation actions", () => {
    it("hides Validar and Rechazar on the actor's own expense and says why", async () => {
      setup({ usuarioId: "yo", gastos: [gasto("g1", { registrado_por_id: "yo" })] })
      const fila = await screen.findByTestId("gasto-fila")
      expect(fila).toHaveTextContent("Tú lo registraste")
      expect(within(fila).queryByRole("button", { name: "Validar" })).not.toBeInTheDocument()
      expect(within(fila).queryByRole("button", { name: "Rechazar" })).not.toBeInTheDocument()
    })

    it("shows Validar and Rechazar to a manager on another user's REGISTRADO expense", async () => {
      setup({ gastos: [gasto("g1")] })
      const fila = await screen.findByTestId("gasto-fila")
      expect(within(fila).getByRole("button", { name: "Validar" })).toBeInTheDocument()
      expect(within(fila).getByRole("button", { name: "Rechazar" })).toBeInTheDocument()
    })

    it("never shows validation controls to a COORDINADOR member", async () => {
      setup({ rol: "COORDINADOR", miembro: true, gastos: [gasto("g1")] })
      const fila = await screen.findByTestId("gasto-fila")
      expect(within(fila).queryByRole("button", { name: "Validar" })).not.toBeInTheDocument()
      expect(within(fila).queryByRole("button", { name: "Anular" })).not.toBeInTheDocument()
    })

    it("posts the validation and refreshes", async () => {
      const user = userEvent.setup()
      setup({ gastos: [gasto("g1")] })
      await user.click(await screen.findByRole("button", { name: "Validar" }))
      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/expenses/g1/validate", expect.objectContaining({ method: "POST" })),
      )
    })

    it("shows the overspend block message inline when validation answers 409", async () => {
      const user = userEvent.setup()
      setup({ gastos: [gasto("g1")] })
      const base = fetchMock.getMockImplementation()!
      fetchMock.mockImplementation((input: unknown, init?: RequestInit) =>
        String(input).endsWith("/validate")
          ? Promise.resolve(
              jsonResponse(
                { error: "Validar este gasto superaría el valor asignado al rubro. Se notificó a Gerencia.", code: "OVERSPEND_BLOCKED" },
                409,
              ),
            )
          : base(input, init),
      )
      await user.click(await screen.findByRole("button", { name: "Validar" }))
      expect(await screen.findByRole("alert")).toHaveTextContent("superaría el valor asignado")
    })

    it("requires a motivo to reject", async () => {
      const user = userEvent.setup()
      setup({ gastos: [gasto("g1")] })
      await user.click(await screen.findByRole("button", { name: "Rechazar" }))
      const confirmar = screen.getByRole("button", { name: "Confirmar rechazo" })
      expect(confirmar).toBeDisabled()
      await user.type(screen.getByRole("textbox", { name: "Motivo del rechazo" }), "Soporte ilegible")
      await user.click(confirmar)
      await waitFor(() => {
        const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/g1/reject"))
        expect(call).toBeDefined()
        expect(JSON.parse((call![1] as RequestInit).body as string)).toEqual({ motivo: "Soporte ilegible" })
      })
    })

    it("offers Anular only on VALIDADO expenses, to managers", async () => {
      setup({ gastos: [gasto("g1", { estado: "VALIDADO" }), gasto("g2")] })
      const filas = await screen.findAllByTestId("gasto-fila")
      expect(within(filas[0]).getByRole("button", { name: "Anular" })).toBeInTheDocument()
      expect(within(filas[1]).queryByRole("button", { name: "Anular" })).not.toBeInTheDocument()
    })

    it("downloads a support by fetching its signed URL", async () => {
      const user = userEvent.setup()
      const open = vi.fn()
      vi.stubGlobal("open", open)
      setup({ gastos: [gasto("g1")] })
      const base = fetchMock.getMockImplementation()!
      fetchMock.mockImplementation((input: unknown, init?: RequestInit) =>
        String(input).includes("/attachments/s1/download")
          ? Promise.resolve(jsonResponse({ tipo: "archivo", url: "https://s.example/dl", expires_in: 60 }))
          : base(input, init),
      )
      await user.click(await screen.findByRole("button", { name: "Ver soporte factura.pdf" }))
      await waitFor(() => expect(open).toHaveBeenCalledWith("https://s.example/dl", "_blank", "noopener,noreferrer"))
      expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/expenses/g1/attachments/s1/download", expect.any(Object))
      expect(posts()).toHaveLength(0)
    })
  })
})
