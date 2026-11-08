// S6 U6: sección "Gastos" de la ficha (lista, registro, validación). Las queries son
// reales; solo se burla `fetch`. La API es la autoridad: aquí se fija lo que se muestra y
// qué controles aparecen según rol, membresía, estado del proyecto y autoría del gasto.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
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
  subtotal: "1500000.00",
  iva: "0.00",
  estado: "REGISTRADO",
  alerta_sobregasto: false,
  periodo_modificado: false,
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
  soportes_count: 1,
  ...over,
})

/** Same reading the server makes: totals by estado plus the `resumen` block. */
function respuesta(gastos: ReturnType<typeof gasto>[]) {
  const totales = Object.fromEntries(
    ["REGISTRADO", "VALIDADO", "RECHAZADO", "ANULADO"].map((e) => {
      const delEstado = gastos.filter((g) => g.estado === e)
      return [e, { cantidad: delEstado.length, valor: delEstado.reduce((a, g) => a + Number(g.valor), 0).toFixed(2) }]
    }),
  )
  const vigentes = gastos.filter((g) => g.estado === "REGISTRADO" || g.estado === "VALIDADO")
  const observados = gastos.filter((g) => g.estado === "REGISTRADO" && (g.alerta_sobregasto || g.datos_incompletos))
  return {
    gastos,
    totales,
    resumen: {
      vigentes: vigentes.length,
      con_soporte: vigentes.filter((g) => (g.soportes_count ?? 0) > 0).length,
      observados: { cantidad: observados.length, valor: observados.reduce((a, g) => a + Number(g.valor), 0).toFixed(2) },
    },
  }
}

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
  gastos?: ReturnType<typeof gasto>[]
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
      if (url.endsWith("/expenses") && method === "GET") return Promise.resolve(jsonResponse(respuesta(gastos)))
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

    it("opens the form right away when the header asked to register an expense", async () => {
      fetchMock.mockImplementation((input: unknown) => {
        const url = String(input)
        if (url.endsWith("/api/v1/auth/me")) return Promise.resolve(jsonResponse({ usuario: { id: "yo", nombre: "Yo", rol: "GERENCIA" } }))
        if (url.endsWith("/members")) return Promise.resolve(jsonResponse({ miembros: [] }))
        if (url.endsWith("/budget")) return Promise.resolve(jsonResponse(BUDGET))
        if (url.endsWith("/expenses")) return Promise.resolve(jsonResponse(respuesta([])))
        return Promise.resolve(jsonResponse({}))
      })
      render(<ProjectGastos proyecto={PROYECTO} registrarAlAbrir />, { wrapper: createWrapper() })
      expect(await screen.findByRole("form", { name: "Registrar gasto" })).toBeInTheDocument()
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

    it("explains why a viewer outside the team cannot register, instead of only hiding the button", async () => {
      setup({ rol: "COORDINADOR" })
      const aviso = await screen.findByTestId("aviso-solo-consulta")
      expect(aviso).toHaveTextContent("Estás viendo este proyecto en modo consulta")
      expect(aviso).toHaveTextContent("pide que te agreguen al equipo del proyecto")
    })

    it("shows no read-only notice to whoever can register, nor outside execution", async () => {
      const gestor = setup({ rol: "GERENCIA" })
      await screen.findByRole("button", { name: "Registrar gasto" })
      expect(screen.queryByTestId("aviso-solo-consulta")).not.toBeInTheDocument()
      gestor.unmount()

      setup({ rol: "COORDINADOR", proyecto: { estado: "CERRADO" } })
      await screen.findByTestId("gastos-lista")
      expect(screen.queryByTestId("aviso-solo-consulta")).not.toBeInTheDocument()
    })
  })

  describe("import control (B8)", () => {
    it("is shown next to Registrar gasto: managers and active members on an EN_EJECUCION project", async () => {
      for (const config of [{ rol: "GERENCIA" }, { rol: "ADMINISTRADOR" }, { rol: "COORDINADOR", miembro: true }]) {
        const { unmount } = setup(config)
        expect(await screen.findByRole("button", { name: "Importar gastos" })).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Registrar gasto" })).toBeInTheDocument()
        unmount()
      }
    })

    it("is hidden wherever Registrar gasto is hidden", async () => {
      for (const config of [{ rol: "COORDINADOR" }, { rol: "COLABORADOR" }, { proyecto: { estado: "CERRADO" as const } }, { proyecto: { estado: "SUSPENDIDO" as const } }]) {
        const { unmount } = setup(config)
        await screen.findByTestId("gastos-lista")
        expect(screen.queryByRole("button", { name: "Importar gastos" })).not.toBeInTheDocument()
        expect(screen.queryByRole("button", { name: "Registrar gasto" })).not.toBeInTheDocument()
        unmount()
      }
    })

    it("opens the import dialog and leaves Registrar gasto working as before", async () => {
      const user = userEvent.setup()
      setup({ rol: "GERENCIA" })
      await user.click(await screen.findByRole("button", { name: "Importar gastos" }))
      expect(await screen.findByRole("dialog", { name: "Importar gastos" })).toBeInTheDocument()
      await user.click(screen.getByRole("button", { name: "Cancelar" }))
      await user.click(screen.getByRole("button", { name: "Registrar gasto" }))
      expect(screen.getByRole("form", { name: "Registrar gasto" })).toBeInTheDocument()
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
      expect(filas[0]).toHaveTextContent("Supera lo asignado")
      expect(within(filas[0]).getByRole("button", { name: "Ayuda: Supera lo asignado" })).toBeInTheDocument()
      expect(filas[1]).toHaveTextContent("Validado")
      expect(filas[1]).not.toHaveTextContent("Supera lo asignado")
    })

    it("keeps the Total in bold and breaks it down as «subtotal + IVA», or «Sin IVA» when the IVA is 0 (S1, S2)", async () => {
      setup({ gastos: [gasto("g1", { valor: "1190000.00", subtotal: "1000000.00", iva: "190000.00" }), gasto("g2")] })
      const lista = await screen.findByTestId("gastos-lista")
      const filas = await within(lista).findAllByTestId("gasto-fila")
      const total = within(filas[0]).getByText("$ 1.190.000")
      expect(total.closest("td")?.className).toContain("text-right")
      expect(total.closest("td")?.className).toContain("font-semibold")
      expect(within(filas[0]).getByText("$ 1.000.000 + IVA $ 190.000")).toBeInTheDocument()
      expect(within(filas[0]).queryByText("Sin IVA")).not.toBeInTheDocument()
      expect(within(filas[1]).getByText("Sin IVA")).toBeInTheDocument()
      expect(within(filas[1]).queryByText("IVA $ 0")).not.toBeInTheDocument()
    })

    it("shows the period in its own column, plus «Periodo modificado» only when it was edited (S5, S6)", async () => {
      setup({ gastos: [gasto("g1", { periodo: "2026-12", periodo_modificado: true }), gasto("g2")] })
      const lista = await screen.findByTestId("gastos-lista")
      const filas = await within(lista).findAllByTestId("gasto-fila")
      expect(filas[0]).toHaveTextContent("FE-0123 · 15/10/26")
      const periodo = within(filas[0]).getByText("2026-12").closest("td") as HTMLElement
      const marca = within(periodo).getByText("Periodo modificado")
      expect(marca).toHaveAttribute("title", "Periodo 2026-12")
      expect(within(filas[1]).getByText("2026-10")).toBeInTheDocument()
      expect(within(filas[1]).queryByText("Periodo modificado")).not.toBeInTheDocument()
    })

    it("shows the period and the IVA breakdown on the phone cards too", async () => {
      mockViewport(true)
      try {
        setup({
          gastos: [
            gasto("g1", { valor: "1190000.00", subtotal: "1000000.00", iva: "190000.00", periodo: "2026-12", periodo_modificado: true }),
            gasto("g2"),
          ],
        })
        const tarjetas = await within(await screen.findByTestId("gastos-cards")).findAllByTestId("gasto-fila")
        expect(within(tarjetas[0]).getByText("$ 1.000.000 + IVA $ 190.000")).toBeInTheDocument()
        expect(tarjetas[0]).toHaveTextContent("Periodo 2026-12")
        expect(within(tarjetas[0]).getByText("Periodo modificado")).toBeInTheDocument()
        expect(within(tarjetas[1]).getByText("Sin IVA")).toBeInTheDocument()
        expect(tarjetas[1]).toHaveTextContent("Periodo 2026-10")
      } finally {
        mockViewport(false)
      }
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
      delete (sinAcceso as Record<string, unknown>).soportes_count
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

  describe("ledger table", () => {
    const MIXTO = () => [
      gasto("g1", { alerta_sobregasto: true, valor: "450000.00" }),
      gasto("g2", { estado: "VALIDADO", valor: "500000.00" }),
      gasto("g3", { datos_incompletos: true, tercero_numero_id: null, soportes: [], soportes_count: 0 }),
      gasto("g4", { estado: "RECHAZADO", motivo_rechazo: "Soporte ilegible" }),
      gasto("g5"),
    ]

    it("renders a table with the ledger columns and numeric amounts", async () => {
      setup({ gastos: MIXTO() })
      const lista = await screen.findByTestId("gastos-lista")
      const tabla = within(lista).getByRole("table")
      const cabeceras = within(tabla).getAllByRole("columnheader").map((th) => th.textContent)
      expect(cabeceras).toEqual(["Gasto", "Rubro", "Periodo", "Total", "Estado", "Soporte", "Acción"])
      const filas = within(tabla).getAllByTestId("gasto-fila")
      expect(filas).toHaveLength(5)
      expect(filas[0]).toHaveTextContent("R12 · Transporte")
      expect(filas[0]).toHaveTextContent("Proveedor SAS")
      expect(filas[0]).toHaveTextContent("FE-0123")
      const monto = within(filas[0]).getByText("$ 450.000").closest("td")
      expect(monto?.className).toContain("text-right")
    })

    it("does not push Acción out of view: no fixed minimum width and one compact «Revisar» per pending expense", async () => {
      setup({ gastos: MIXTO() })
      const tabla = within(await screen.findByTestId("gastos-lista")).getByRole("table")
      expect(tabla.className).not.toMatch(/min-w-\[/)
      const filas = within(tabla).getAllByTestId("gasto-fila")
      expect(within(filas[0]).getByRole("button", { name: /^Revisar/ })).toBeInTheDocument()
      expect(within(tabla).queryByRole("button", { name: "Validar" })).not.toBeInTheDocument()
      expect(within(tabla).queryByRole("button", { name: "Rechazar" })).not.toBeInTheDocument()
    })

    it("shows one compact summary line above the list, plus the filter counts", async () => {
      setup({ gastos: MIXTO() })
      await screen.findByTestId("gastos-lista")
      expect(screen.queryByTestId("gastos-kpis")).not.toBeInTheDocument()
      expect(screen.getByTestId("gastos-resumen")).toHaveTextContent(/^\d+ gastos?/)
      // Los conteos por estado del filtro se quedan: sirven para filtrar.
      expect(screen.getByRole("button", { name: /^Registrado/ })).toHaveTextContent("3")
    })

    it("marks the support column: a button per support, or 'Sin soporte' when the viewer has none", async () => {
      setup({ gastos: MIXTO() })
      const filas = await screen.findAllByTestId("gasto-fila")
      expect(within(filas[0]).getByRole("button", { name: "Ver soporte factura.pdf" })).toBeInTheDocument()
      expect(within(filas[2]).getByText("Sin soporte")).toBeInTheDocument()
      expect(within(filas[0]).queryByText("Sin soporte")).not.toBeInTheDocument()
    })

    it("does not say 'Sin soporte' when the API hid the supports (RNF-03)", async () => {
      const oculto = gasto("g1")
      delete (oculto as Record<string, unknown>).soportes
      delete (oculto as Record<string, unknown>).soportes_count
      setup({ rol: "COLABORADOR", gastos: [oculto] })
      const fila = await screen.findByTestId("gasto-fila")
      expect(fila).not.toHaveTextContent("Sin soporte")
    })

    it("hides the actions column for someone who cannot validate", async () => {
      setup({ rol: "COORDINADOR", miembro: true, gastos: MIXTO() })
      const tabla = within(await screen.findByTestId("gastos-lista")).getByRole("table")
      expect(within(tabla).queryByRole("columnheader", { name: "Acciones" })).not.toBeInTheDocument()
    })
  })

  describe("filter chips", () => {
    const MIXTO = () => [
      gasto("g1", { alerta_sobregasto: true }),
      gasto("g2", { estado: "VALIDADO" }),
      gasto("g3", { datos_incompletos: true, tercero_numero_id: null }),
      gasto("g4", { estado: "RECHAZADO", motivo_rechazo: "Soporte ilegible" }),
      gasto("g5"),
    ]
    const chip = (nombre: RegExp) => screen.getByRole("button", { name: nombre })

    it("lists the chips with their counts and starts on Todos", async () => {
      setup({ gastos: MIXTO() })
      await screen.findByTestId("gastos-lista")
      expect(chip(/^Todos/)).toHaveTextContent("5")
      expect(chip(/^Registrado/)).toHaveTextContent("3")
      expect(chip(/^Validado/)).toHaveTextContent("1")
      expect(chip(/^Rechazado/)).toHaveTextContent("1")
      expect(chip(/^Pendiente por revisión/)).toHaveTextContent("2")
      expect(chip(/^Todos/)).toHaveAttribute("aria-pressed", "true")
      // T10 C10: the active chip is dark (ink), as in every filter of the ficha.
      expect(chip(/^Todos/).className).toMatch(/(^|\s)bg-ink-900(\s|$)/)
      expect(chip(/^Pendiente por revisión/)).toHaveAttribute("aria-pressed", "false")
      expect(screen.queryByRole("button", { name: /^Anulado/ })).not.toBeInTheDocument()
    })

    it("filters the loaded list by estado without calling the API again", async () => {
      const user = userEvent.setup()
      setup({ gastos: MIXTO() })
      await screen.findByTestId("gastos-lista")
      const antes = fetchMock.mock.calls.length
      await user.click(chip(/^Validado/))
      expect(screen.getAllByTestId("gasto-fila")).toHaveLength(1)
      expect(chip(/^Validado/)).toHaveAttribute("aria-pressed", "true")
      expect(chip(/^Todos/)).toHaveAttribute("aria-pressed", "false")
      expect(fetchMock.mock.calls.length).toBe(antes)
    })

    it("Pendiente por revisión keeps REGISTRADO expenses with the overspend alert or incomplete data (D5)", async () => {
      const user = userEvent.setup()
      setup({ gastos: MIXTO() })
      await screen.findByTestId("gastos-lista")
      await user.click(chip(/^Pendiente por revisión/))
      const filas = screen.getAllByTestId("gasto-fila")
      expect(filas).toHaveLength(2)
      expect(filas[0]).toHaveTextContent("Supera lo asignado")
      expect(filas[1]).toHaveTextContent("Datos incompletos")
    })

    it("shows the Anulado chip only when the list has voided expenses", async () => {
      setup({ gastos: [gasto("g1"), gasto("g2", { estado: "ANULADO", motivo_anulacion: "Duplicado" })] })
      await screen.findByTestId("gastos-lista")
      expect(chip(/^Anulado/)).toHaveTextContent("1")
    })

    it("says so when a filter has no expenses, and is reachable with the keyboard", async () => {
      setup({ gastos: [gasto("g1")] })
      await screen.findByTestId("gastos-lista")
      const rechazado = chip(/^Rechazado/)
      rechazado.focus()
      expect(rechazado).toHaveFocus()
      fireEvent.click(rechazado)
      expect(screen.getByText("No hay gastos con este filtro.")).toBeInTheDocument()
      expect(screen.queryByTestId("gasto-fila")).not.toBeInTheDocument()
    })
  })

  describe("below md", () => {
    afterEach(() => mockViewport(false))

    it("renders cards instead of the table, with the same actions", async () => {
      mockViewport(true)
      setup({ gastos: [gasto("g1"), gasto("g2", { estado: "VALIDADO" })] })
      const lista = await screen.findByTestId("gastos-lista")
      await within(lista).findAllByTestId("gasto-fila")
      expect(within(lista).queryByRole("table")).not.toBeInTheDocument()
      expect(within(lista).getByTestId("gastos-cards")).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /^Revisar/ })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Anular" })).toBeInTheDocument()
    })
  })

  describe("validation actions", () => {
    const revisar = async (user: ReturnType<typeof userEvent.setup>, n = 0) => {
      const botones = await screen.findAllByRole("button", { name: /^Revisar/ })
      await user.click(botones[n])
      return screen.findByRole("dialog", { name: "Validar gasto" })
    }

    it("hides Revisar on the actor's own expense and says why", async () => {
      setup({ usuarioId: "yo", gastos: [gasto("g1", { registrado_por_id: "yo" })] })
      const fila = await screen.findByTestId("gasto-fila")
      expect(fila).toHaveTextContent("Tú lo registraste")
      expect(within(fila).queryByRole("button", { name: /^Revisar/ })).not.toBeInTheDocument()
    })

    it("offers Revisar to a manager on another user's REGISTRADO expense, and it opens the «Validar gasto» panel", async () => {
      const user = userEvent.setup()
      setup({ gastos: [gasto("g1")] })
      const fila = await screen.findByTestId("gasto-fila")
      expect(within(fila).getByRole("button", { name: "Revisar el gasto FE-0123 de Proveedor SAS" })).toBeInTheDocument()
      const panel = await revisar(user)
      await waitFor(() => expect(within(panel).getByRole("heading", { name: "Proveedor SAS" })).toHaveFocus())
      expect(within(panel).getByRole("button", { name: "Validar gasto" })).toBeEnabled()
      expect(within(panel).getByRole("button", { name: "Rechazar" })).toBeEnabled()
      expect(within(panel).getByLabelText("Motivo (obligatorio si lo rechazas)")).toBeInTheDocument()
    })

    it("hides Revisar on a SUSPENDIDO project but keeps Anular (B7)", async () => {
      setup({ proyecto: { estado: "SUSPENDIDO" }, gastos: [gasto("g1", { estado: "VALIDADO" }), gasto("g2")] })
      const filas = await screen.findAllByTestId("gasto-fila")
      expect(within(filas[0]).getByRole("button", { name: "Anular" })).toBeInTheDocument()
      expect(within(filas[1]).queryByRole("button", { name: /^Revisar/ })).not.toBeInTheDocument()
    })

    it("disables Validar gasto with the reason when the expense has no support (S3), and keeps Rechazar", async () => {
      const user = userEvent.setup()
      setup({ gastos: [gasto("g1", { soportes: [], soportes_count: 0 })] })
      const panel = await revisar(user)
      const validar = within(panel).getByRole("button", { name: "Validar gasto" })
      expect(validar).toBeDisabled()
      expect(validar).toHaveAccessibleDescription("Adjunta un soporte para poder validarlo.")
      expect(within(panel).getByRole("button", { name: "Rechazar" })).toBeEnabled()
      expect(posts()).toHaveLength(0)
    })

    it("disables Validar gasto while the third party has no identification", async () => {
      const user = userEvent.setup()
      setup({ gastos: [gasto("g1", { datos_incompletos: true, tercero_tipo_id: null, tercero_numero_id: null })] })
      const panel = await revisar(user)
      expect(within(panel).getByRole("button", { name: "Validar gasto" })).toHaveAccessibleDescription(
        "Completa el tipo y número de identificación del tercero antes de validar.",
      )
      expect(within(panel).getByText("Sin identificación")).toBeInTheDocument()
      expect(within(panel).getByText("Datos incompletos")).toBeInTheDocument()
    })

    it("shows the rubro balance: assigned, already executed, this expense and what is left", async () => {
      const user = userEvent.setup()
      setup({ gastos: [gasto("g1"), gasto("g2", { estado: "VALIDADO", valor: "2000000.00" })] })
      const panel = await revisar(user)
      const rubro = await within(panel).findByTestId("validar-gasto-rubro")
      expect(rubro).toHaveTextContent("Rubro R12 · Transporte")
      expect(rubro).toHaveTextContent("Asignado$ 24.000.000")
      expect(rubro).toHaveTextContent("Ya ejecutado$ 2.000.000")
      expect(rubro).toHaveTextContent("Este gasto$ 1.500.000")
      expect(rubro).toHaveTextContent("Si lo validas, al rubro le quedan $ 20.500.000")
      expect(within(rubro).getByRole("button", { name: "Ayuda: Disponible del rubro" })).toBeInTheDocument()
    })

    it("keeps validating over the rubro blocked: says what the rubro would end at and disables Validar gasto", async () => {
      const user = userEvent.setup()
      setup({
        gastos: [
          gasto("g1", { alerta_sobregasto: true }),
          gasto("g2", { estado: "VALIDADO", valor: "23000000.00" }),
        ],
      })
      const panel = await revisar(user)
      const rubro = await within(panel).findByTestId("validar-gasto-rubro")
      expect(rubro).toHaveTextContent("Si lo validas, el rubro queda en -$ 500.000")
      expect(within(panel).getByRole("note")).toHaveTextContent("por ahora no se puede validar")
      expect(within(panel).getByRole("button", { name: "Validar gasto" })).toHaveAccessibleDescription(
        "Este gasto supera lo asignado al rubro: por ahora no se puede validar.",
      )
      expect(within(panel).getByRole("button", { name: "Rechazar" })).toBeEnabled()
    })

    it("never shows Revisar to a COORDINADOR member", async () => {
      setup({ rol: "COORDINADOR", miembro: true, gastos: [gasto("g1")] })
      const fila = await screen.findByTestId("gasto-fila")
      expect(within(fila).queryByRole("button", { name: /^Revisar/ })).not.toBeInTheDocument()
      expect(within(fila).queryByRole("button", { name: "Anular" })).not.toBeInTheDocument()
    })

    it("posts the validation, then moves to the next pending expense", async () => {
      const user = userEvent.setup()
      setup({ gastos: [gasto("g1"), gasto("g2", { tercero_nombre: "Logística Sinú", numero_documento: "FE-0200" })] })
      const panel = await revisar(user)
      await user.click(within(panel).getByRole("button", { name: "Validar gasto" }))
      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/expenses/g1/validate", expect.objectContaining({ method: "POST" })),
      )
      expect(await within(panel).findByRole("heading", { name: "Logística Sinú" })).toBeInTheDocument()
    })

    it("closes the panel after the last pending expense", async () => {
      const user = userEvent.setup()
      setup({ gastos: [gasto("g1")] })
      const panel = await revisar(user)
      await user.click(within(panel).getByRole("button", { name: "Validar gasto" }))
      await waitFor(() => expect(screen.queryByRole("dialog", { name: "Validar gasto" })).not.toBeInTheDocument())
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
      const panel = await revisar(user)
      await user.click(within(panel).getByRole("button", { name: "Validar gasto" }))
      expect(await within(panel).findByRole("alert")).toHaveTextContent("superaría el valor asignado")
    })

    it("requires a motivo to reject: error under the field and focus on it, then confirms", async () => {
      const user = userEvent.setup()
      setup({ gastos: [gasto("g1")] })
      const panel = await revisar(user)
      const motivo = within(panel).getByLabelText("Motivo (obligatorio si lo rechazas)")
      await user.click(within(panel).getByRole("button", { name: "Rechazar" }))
      expect(motivo).toHaveFocus()
      expect(motivo).toHaveAttribute("aria-invalid", "true")
      expect(motivo).toHaveAccessibleDescription("El motivo no puede estar vacío.")
      expect(posts()).toHaveLength(0)

      fireEvent.change(motivo, { target: { value: "x".repeat(501) } })
      await user.click(within(panel).getByRole("button", { name: "Rechazar" }))
      expect(motivo).toHaveAccessibleDescription("El motivo es demasiado largo.")

      await user.clear(motivo)
      await user.type(motivo, "Soporte ilegible")
      await user.click(within(panel).getByRole("button", { name: "Rechazar" }))
      await user.click(within(panel).getByRole("button", { name: "Confirmar rechazo" }))
      await waitFor(() => {
        const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/g1/reject"))
        expect(call).toBeDefined()
        expect(JSON.parse((call![1] as RequestInit).body as string)).toEqual({ motivo: "Soporte ilegible" })
      })
    })

    it("lists the pending expenses in the panel and moves between them with a click or the arrow keys", async () => {
      const user = userEvent.setup()
      setup({
        gastos: [
          gasto("g1"),
          gasto("g2", { tercero_nombre: "Logística Sinú", numero_documento: "FE-0200", periodo: "2026-11", periodo_modificado: true }),
          gasto("g3", { estado: "VALIDADO" }),
        ],
      })
      const panel = await revisar(user)
      const lista = within(panel).getByRole("navigation", { name: "Gastos por validar" })
      expect(lista).toHaveTextContent("Por validar · 2")
      const items = within(lista).getAllByRole("button")
      expect(items).toHaveLength(2)
      expect(items[0]).toHaveAttribute("aria-current", "true")
      expect(items[1]).toHaveTextContent("cuenta en 2026-11")

      await user.type(within(panel).getByLabelText("Motivo (obligatorio si lo rechazas)"), "borrador")
      await user.click(items[1])
      expect(within(panel).getByRole("heading", { name: "Logística Sinú" })).toBeInTheDocument()
      expect(within(lista).getAllByRole("button")[1]).toHaveAttribute("aria-current", "true")
      // Changing expense discards the motivo written for the previous one.
      expect(within(panel).getByLabelText("Motivo (obligatorio si lo rechazas)")).toHaveValue("")

      within(lista).getAllByRole("button")[1].focus()
      await user.keyboard("{ArrowUp}")
      expect(within(panel).getByRole("heading", { name: "Proveedor SAS" })).toBeInTheDocument()
      expect(within(lista).getAllByRole("button")[0]).toHaveFocus()
    })

    it("closes with Escape and gives the focus back to Revisar", async () => {
      const user = userEvent.setup()
      setup({ gastos: [gasto("g1")] })
      await revisar(user)
      await user.keyboard("{Escape}")
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
      await waitFor(() => expect(screen.getByRole("button", { name: /^Revisar/ })).toHaveFocus())
    })

    it("on the phone: support first, «1 de 2» with previous / next arrows, and 44 px actions", async () => {
      mockViewport(true)
      try {
        const user = userEvent.setup()
        setup({ gastos: [gasto("g1"), gasto("g2", { tercero_nombre: "Logística Sinú", numero_documento: "FE-0200" })] })
        const botones = await screen.findAllByRole("button", { name: /^Revisar/ })
        await user.click(botones[0])
        const panel = await screen.findByRole("dialog", { name: "Por validar · 1 de 2" })
        expect(within(panel).queryByRole("navigation")).not.toBeInTheDocument()
        expect(within(panel).getByRole("button", { name: "Gasto anterior" })).toBeDisabled()
        const siguiente = within(panel).getByRole("button", { name: "Siguiente gasto: Logística Sinú" })
        const soporte = within(panel).getByRole("complementary", { name: "Soporte" })
        const titulo = within(panel).getByRole("heading", { name: "Proveedor SAS" })
        expect(soporte.compareDocumentPosition(titulo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        for (const nombre of ["Rechazar", "Validar gasto"]) {
          expect(within(panel).getByRole("button", { name: nombre }).className).toMatch(/(^|\s)h-11(\s|$)/)
        }
        await user.click(siguiente)
        expect(await screen.findByRole("dialog", { name: "Por validar · 2 de 2" })).toBeInTheDocument()
      } finally {
        mockViewport(false)
      }
    })

    it("offers Anular only on VALIDADO expenses, to managers", async () => {
      setup({ gastos: [gasto("g1", { estado: "VALIDADO" }), gasto("g2")] })
      const filas = await screen.findAllByTestId("gasto-fila")
      expect(within(filas[0]).getByRole("button", { name: "Anular" })).toBeInTheDocument()
      expect(within(filas[1]).queryByRole("button", { name: "Anular" })).not.toBeInTheDocument()
    })

    it("downloads a support by fetching its signed URL, in the same tab (S4)", async () => {
      const user = userEvent.setup()
      const open = vi.fn()
      vi.stubGlobal("open", open)
      const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
      setup({ gastos: [gasto("g1")] })
      const base = fetchMock.getMockImplementation()!
      fetchMock.mockImplementation((input: unknown, init?: RequestInit) =>
        String(input).includes("/attachments/s1/download")
          ? Promise.resolve(jsonResponse({ tipo: "archivo", url: "https://s.example/dl", expires_in: 60 }))
          : base(input, init),
      )
      await user.click(await screen.findByRole("button", { name: "Ver soporte factura.pdf" }))
      await waitFor(() => expect(click).toHaveBeenCalledTimes(1))
      expect((click.mock.contexts[0] as HTMLAnchorElement).href).toBe("https://s.example/dl?download=")
      expect(open).not.toHaveBeenCalled()
      expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/expenses/g1/attachments/s1/download", expect.any(Object))
      expect(posts()).toHaveLength(0)
      click.mockRestore()
    })
  })

  describe("attach a support later (S2)", () => {
    const propio = (over: Record<string, unknown> = {}) => gasto("g1", { registrado_por_id: "yo", soportes: [], soportes_count: 0, ...over })

    it("offers Adjuntar archivo to the registrant on a REGISTRADO or RECHAZADO expense", async () => {
      setup({ usuarioId: "yo", gastos: [propio(), propio({ id: "g2", estado: "RECHAZADO", motivo_rechazo: "Falta el soporte" })] })
      const filas = await screen.findAllByTestId("gasto-fila")
      expect(within(filas[0]).getByRole("button", { name: "Adjuntar archivo" })).toBeInTheDocument()
      expect(within(filas[1]).getByRole("button", { name: "Adjuntar archivo" })).toBeInTheDocument()
    })

    it("keeps the support control also for a member COORDINADOR who registered the expense", async () => {
      setup({ rol: "COORDINADOR", miembro: true, usuarioId: "yo", gastos: [propio()] })
      expect(await screen.findByRole("button", { name: "Adjuntar archivo" })).toBeInTheDocument()
    })

    it("hides it on other users' expenses, VALIDADO and ANULADO ones, and at 5 supports", async () => {
      const cinco = Array.from({ length: 5 }, (_, i) => ({
        id: `s${i}`, nombre: `f${i}.pdf`, tipo: "archivo", url_externa: null, tipo_mime: "application/pdf", tamano_bytes: 1, subido_por_id: "yo", created_at: "2026-10-16T12:00:00.000Z",
      }))
      setup({
        usuarioId: "yo",
        gastos: [
          propio({ id: "a", registrado_por_id: "otro" }),
          propio({ id: "b", estado: "VALIDADO" }),
          propio({ id: "c", estado: "ANULADO" }),
          propio({ id: "d", soportes: cinco, soportes_count: 5 }),
        ],
      })
      await screen.findAllByTestId("gasto-fila")
      expect(screen.queryByRole("button", { name: "Adjuntar archivo" })).not.toBeInTheDocument()
    })

    it("hides it when the project is not EN_EJECUCION", async () => {
      setup({ usuarioId: "yo", proyecto: { estado: "CERRADO" }, gastos: [propio()] })
      await screen.findByTestId("gasto-fila")
      expect(screen.queryByRole("button", { name: "Adjuntar archivo" })).not.toBeInTheDocument()
    })

    it("attaches a link from the row and refreshes the list", async () => {
      const user = userEvent.setup()
      setup({ usuarioId: "yo", gastos: [propio()] })
      await user.click(await screen.findByRole("button", { name: "Adjuntar archivo" }))
      await user.click(screen.getByRole("radio", { name: "Enlace" }))
      await user.type(screen.getByLabelText("URL"), "https://drive.example.com/f/1")
      await user.type(screen.getByLabelText("Nombre del enlace"), "Carpeta")
      await user.click(screen.getByRole("button", { name: "Adjuntar" }))
      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/expenses/g1/attachments", expect.objectContaining({ method: "POST" })),
      )
      await waitFor(() => expect(fetchMock.mock.calls.filter(([url, init]) => String(url).endsWith("/expenses") && (init as RequestInit | undefined)?.method !== "POST").length).toBeGreaterThan(1))
    })
  })
})
