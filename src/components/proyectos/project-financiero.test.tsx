// Finanzas › Resumen (redesign T3): three key figures, the delay notice, the gastos por validar, the rubros and the
// folded detail. The queries are real; only `fetch` is mocked. The colour comes from the server and is painted verbatim.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectListRow } from "@/hooks/projects"
import { mockViewport } from "@/test/viewport"
import { ProjectFinanciero } from "./project-financiero"

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

// F-F1 at corte 2026-11 (map section 4).
const FICHA = {
  base: "vigente",
  corte: "2026-11",
  estado: "EN_EJECUCION",
  ejecucion_disponible: true,
  rubros: [
    {
      rubro_id: "r1", codigo: "R01", nombre: "Personal",
      asignado: "59500000.00", programado: "29750000.00", ejecutado: "27000000.00", diferencia: "-2750000.00",
      ep_decimas: 908, ea_decimas: 454, umbral_rojo: "32725000.00", color: "verde",
    },
    {
      rubro_id: "r12", codigo: "R12", nombre: "Transporte",
      asignado: "24000000.00", programado: "12000000.00", ejecutado: "13500000.00", diferencia: "1500000.00",
      ep_decimas: 1125, ea_decimas: 563, umbral_rojo: "13200000.00", color: "rojo",
    },
  ],
  total: {
    rubro_id: null, codigo: null, nombre: "Total",
    asignado: "83500000.00", programado: "41750000.00", ejecutado: "40500000.00", diferencia: "-1250000.00",
    ep_decimas: 970, ea_decimas: 485, umbral_rojo: "45925000.00", color: "verde",
  },
  alerta_retraso: false,
  parametros: { tolerancia: 10, retraso: 70, confirmado: true },
}

const SIN_GASTOS = {
  ...FICHA,
  ejecucion_disponible: false,
  rubros: FICHA.rubros.map((r) => ({ ...r, ejecutado: "0.00", ep_decimas: null, ea_decimas: null, color: null })),
  total: { ...FICHA.total, ejecutado: "0.00", ep_decimas: null, ea_decimas: null, color: null },
}

const gasto = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  proyecto_id: "p1",
  rubro: { id: "r12", codigo: "R12", nombre: "Transporte" },
  fecha_documento: "2026-11-02",
  periodo: "2026-11",
  tipo_soporte: "FACTURA_PROVEEDOR",
  tercero_nombre: "Papelería del Sinú",
  tercero_tipo_id: "NIT",
  tercero_numero_id: "900000004",
  numero_documento: "FV-4007",
  descripcion: "Material de oficina",
  valor: "450000.00",
  subtotal: "450000.00",
  iva: "0.00",
  estado: "REGISTRADO",
  alerta_sobregasto: false,
  periodo_modificado: false,
  datos_incompletos: false,
  registrado_por_id: "laura",
  created_at: "2026-11-02T12:00:00.000Z",
  validado_por_id: null,
  validado_at: null,
  rechazado_por_id: null,
  rechazado_at: null,
  motivo_rechazo: null,
  anulado_por_id: null,
  anulado_at: null,
  motivo_anulacion: null,
  soportes: [
    { id: "s1", nombre: "Factura FV-4007.pdf", tipo: "archivo", url_externa: null, tipo_mime: "application/pdf", tamano_bytes: 100, subido_por_id: "laura", created_at: "2026-11-02T12:00:00.000Z" },
  ],
  soportes_count: 1,
  ...over,
})

function respuestaGastos(gastos: ReturnType<typeof gasto>[]) {
  const totales = Object.fromEntries(
    ["REGISTRADO", "VALIDADO", "RECHAZADO", "ANULADO"].map((e) => {
      const delEstado = gastos.filter((g) => g.estado === e)
      return [e, { cantidad: delEstado.length, valor: delEstado.reduce((a, g) => a + Number(g.valor), 0).toFixed(2) }]
    }),
  )
  return { gastos, totales, resumen: { vigentes: gastos.length, observados: { cantidad: 0, valor: "0.00" } } }
}

describe("ProjectFinanciero", () => {
  const fetchMock = vi.fn()

  type Setup = {
    ficha?: unknown
    status?: number
    proyecto?: Partial<ProjectListRow>
    gastos?: ReturnType<typeof gasto>[]
    rol?: string
    navegacion?: { onVerActividades?: () => void; onVerGastos?: () => void }
  }

  function setup({ ficha = FICHA as unknown, status = 200, proyecto = {}, gastos = [], rol = "GERENCIA", navegacion = {} }: Setup = {}) {
    fetchMock.mockImplementation((input: unknown) => {
      const url = String(input)
      if (url.includes("/financial-sheet")) {
        return Promise.resolve(
          status === 200
            ? jsonResponse(ficha)
            : jsonResponse({ error: "No tienes permisos sobre este proyecto.", code: "FORBIDDEN" }, status),
        )
      }
      if (url.endsWith("/api/v1/auth/me")) return Promise.resolve(jsonResponse({ usuario: { id: "yo", nombre: "Yo", rol } }))
      if (url.endsWith("/members")) {
        return Promise.resolve(
          jsonResponse({ miembros: [{ id: "m1", usuario: { id: "laura", nombre: "Laura Jiménez", rol: "COORDINADOR" }, agregado_por_id: "x", created_at: "2026-10-07T13:00:00.000Z", removed_at: null }] }),
        )
      }
      if (url.endsWith("/expenses")) return Promise.resolve(jsonResponse(respuestaGastos(gastos)))
      return Promise.resolve(jsonResponse({}))
    })
    return render(<ProjectFinanciero proyecto={{ ...PROYECTO, ...proyecto }} {...navegacion} />, { wrapper: createWrapper() })
  }

  const abrirDetalle = async (user: ReturnType<typeof userEvent.setup>) =>
    user.click(await screen.findByRole("button", { name: "Ver detalle con diferencias y límites de cada color" }))

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    mockViewport(false)
  })

  describe("three key figures", () => {
    it("shows Ejecutado with the validated count, Programado a hoy with its share and colour, and the project value", async () => {
      setup({ gastos: [gasto("g1", { estado: "VALIDADO" }), gasto("g2", { estado: "VALIDADO" }), gasto("g3")] })

      const ejecutado = await screen.findByTestId("cifra-ejecutado")
      expect(ejecutado).toHaveTextContent("Ejecutado (gastos validados)")
      expect(ejecutado).toHaveTextContent("$ 40.500.000")
      expect(await within(ejecutado).findByText("2 gastos validados")).toBeInTheDocument()

      const programado = screen.getByTestId("cifra-programado")
      expect(programado).toHaveTextContent("Programado a hoy")
      expect(programado).toHaveTextContent("$ 41.750.000")
      expect(programado).toHaveTextContent("97,0 % de lo programado ejecutado")
      expect(programado.querySelector("[data-color]")).toHaveAttribute("data-color", "verde")
      expect(within(programado).getByText("Verde")).toBeInTheDocument()
      expect(within(programado).getByRole("button", { name: "Ayuda: Programado a hoy" })).toBeInTheDocument()

      const total = screen.getByTestId("cifra-valor-total")
      expect(total).toHaveTextContent("Valor total del proyecto")
      expect(total).toHaveTextContent("$ 83.500.000")
      // 40.500.000 / 83.500.000 = 48,5 %; quedan 83.500.000 − 40.500.000.
      expect(total).toHaveTextContent("48,5 % del total ejecutado · quedan $ 43.000.000")
    })

    it("opens the help of Programado a hoy with the keyboard and closes it with Escape", async () => {
      const user = userEvent.setup()
      setup()
      const ayuda = await screen.findByRole("button", { name: "Ayuda: Programado a hoy" })
      ayuda.focus()
      await user.keyboard("{Enter}")
      expect(await screen.findByRole("dialog")).toHaveTextContent("deberías llevar ejecutado hasta nov 2026")
      await user.keyboard("{Escape}")
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
      expect(ayuda).toHaveFocus()
    })

    it("explains that expenses are not available yet: $ 0, no percentage and no colour", async () => {
      setup({ ficha: SIN_GASTOS })

      const ejecutado = await screen.findByTestId("cifra-ejecutado")
      expect(ejecutado).toHaveTextContent("$ 0")
      expect(ejecutado).toHaveTextContent("Ejecución disponible cuando se registren gastos")
      expect(screen.getByTestId("cifra-programado")).not.toHaveTextContent("de lo programado ejecutado")
      expect(screen.getByTestId("financiero-cifras").querySelector("[data-color]")).toBeNull()
      expect(screen.queryByTestId("financiero-alerta")).not.toBeInTheDocument()
    })

    it("says «Sin definir» when the project has no total value", async () => {
      setup({ proyecto: { valor_total: null } })
      expect(await screen.findByTestId("cifra-valor-total")).toHaveTextContent("Sin definir")
      expect(screen.getByTestId("cifra-valor-total")).not.toHaveTextContent("quedan")
    })

    it("paints the colour the API sent, even if it contradicts the numbers", async () => {
      setup({ ficha: { ...FICHA, total: { ...FICHA.total, color: "amarillo" } } })
      const programado = await screen.findByTestId("cifra-programado")
      expect(programado.querySelector("[data-color]")).toHaveAttribute("data-color", "amarillo")
    })

    it("stacks the figures in one column on phones and in three from md", async () => {
      setup()
      expect((await screen.findByTestId("financiero-cifras")).className).toMatch(/grid-cols-1 .*md:grid-cols-3/)
    })
  })

  it("does not repeat the 'Ficha financiera' heading: the Finanzas › Resumen segment already names it", async () => {
    setup()

    await screen.findByTestId("financiero-cifras")
    expect(screen.queryByRole("heading", { name: "Ficha financiera" })).not.toBeInTheDocument()
    expect(screen.getByTestId("financiero")).not.toHaveTextContent("Ficha financiera")
  })

  it("shows the 'Umbrales sin confirmar' badge, with its help, while the thresholds are unconfirmed", async () => {
    setup({ ficha: { ...FICHA, parametros: { tolerancia: 10, retraso: 70, confirmado: false } } })

    expect(await screen.findByText("Umbrales sin confirmar")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Ayuda: Umbrales sin confirmar" })).toBeInTheDocument()
  })

  it("does not show it once confirmed", async () => {
    setup()

    await screen.findByTestId("financiero-cifras")
    expect(screen.queryByText("Umbrales sin confirmar")).not.toBeInTheDocument()
  })

  describe("possible-delay notice", () => {
    it("appears only when the API raises it, with «Ver actividades» switching tabs", async () => {
      const user = userEvent.setup()
      const onVerActividades = vi.fn()
      const { unmount } = setup({ ficha: { ...FICHA, alerta_retraso: true }, navegacion: { onVerActividades } })

      const alerta = await screen.findByTestId("financiero-alerta")
      expect(alerta).toHaveTextContent(
        "Posible retraso: se ha gastado poco frente a lo programado y el avance técnico también va atrasado.",
      )
      await user.click(within(alerta).getByRole("button", { name: "Ver actividades" }))
      expect(onVerActividades).toHaveBeenCalledTimes(1)
      unmount()

      setup()
      await screen.findByTestId("financiero-cifras")
      expect(screen.queryByTestId("financiero-alerta")).not.toBeInTheDocument()
    })
  })

  describe("gastos por validar", () => {
    it("lists the pending expenses with registrant, rubro, total, notices, support and Revisar", async () => {
      setup({
        gastos: [
          gasto("g1", { alerta_sobregasto: true, rubro: { id: "r1", codigo: "R01", nombre: "Personal" } }),
          gasto("g2", { tercero_nombre: "Dotaciones del Caribe", numero_documento: "FV-2040", valor: "11250000.00", subtotal: "11250000.00", periodo: "2026-10", periodo_modificado: true }),
          gasto("g3", { estado: "VALIDADO" }),
        ],
      })

      const seccion = await screen.findByTestId("gastos-por-validar")
      expect(within(seccion).getByRole("heading", { name: "Gastos por validar · 2 · $ 11.700.000" })).toBeInTheDocument()
      const filas = within(seccion).getAllByTestId("por-validar-fila")
      expect(filas).toHaveLength(2)
      expect(filas[0]).toHaveTextContent("Papelería del Sinú")
      expect(await within(filas[0]).findByText(/^FV-4007 · .+ · registró Laura Jiménez$/)).toBeInTheDocument()
      expect(filas[0]).toHaveTextContent("R01 · Personal")
      expect(filas[0]).toHaveTextContent("$ 450.000")
      expect(filas[0]).toHaveTextContent("Sin IVA")
      expect(within(filas[0]).getByRole("button", { name: "Ayuda: Supera lo asignado" })).toBeInTheDocument()
      expect(within(filas[1]).getByText("Cuenta en 2026-10")).toBeInTheDocument()
      expect(within(filas[1]).getByRole("button", { name: "Ayuda: Cuenta en 2026-10" })).toBeInTheDocument()
      expect(within(filas[0]).getByRole("button", { name: "Ver soporte Factura FV-4007.pdf" })).toBeInTheDocument()
      expect(within(filas[0]).getByRole("button", { name: "Revisar el gasto FV-4007 de Papelería del Sinú" })).toBeInTheDocument()
    })

    it("is not shown when nothing waits for validation", async () => {
      setup({ gastos: [gasto("g1", { estado: "VALIDADO" })] })
      await screen.findByTestId("financiero-cifras")
      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/expenses", expect.any(Object)))
      expect(screen.queryByTestId("gastos-por-validar")).not.toBeInTheDocument()
    })

    it("offers no Revisar to a team member, and «Tú lo registraste» to the manager who registered it", async () => {
      const { unmount } = setup({ rol: "COORDINADOR", gastos: [gasto("g1")] })
      const seccion = await screen.findByTestId("gastos-por-validar")
      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/auth/me", expect.any(Object)))
      expect(within(seccion).queryByRole("button", { name: /^Revisar/ })).not.toBeInTheDocument()
      unmount()

      setup({ gastos: [gasto("g1", { registrado_por_id: "yo" })] })
      const propia = await screen.findByTestId("gastos-por-validar")
      expect(await within(propia).findByText("Tú lo registraste")).toBeInTheDocument()
      expect(within(propia).queryByRole("button", { name: /^Revisar/ })).not.toBeInTheDocument()
    })

    it("«Revisar» opens the «Validar gasto» panel on that expense", async () => {
      const user = userEvent.setup()
      setup({ gastos: [gasto("g1")] })
      await user.click(await screen.findByRole("button", { name: /^Revisar/ }))
      const panel = await screen.findByRole("dialog", { name: "Validar gasto" })
      expect(within(panel).getByRole("heading", { name: "Papelería del Sinú" })).toBeInTheDocument()
      expect(within(panel).getByText("Laura Jiménez")).toBeInTheDocument()
    })

    it("«Ver todos los gastos» switches to the Gastos segment", async () => {
      const user = userEvent.setup()
      const onVerGastos = vi.fn()
      setup({ gastos: [gasto("g1")], navegacion: { onVerGastos } })
      const seccion = await screen.findByTestId("gastos-por-validar")
      await user.click(within(seccion).getAllByRole("button", { name: "Ver todos los gastos" })[0])
      expect(onVerGastos).toHaveBeenCalledTimes(1)
    })

    it("shows one card per expense on the phone, with a 44 px Revisar", async () => {
      mockViewport(true)
      setup({ gastos: [gasto("g1")] })
      const tarjetas = await screen.findByTestId("gastos-por-validar-tarjetas")
      const revisar = await within(tarjetas).findByRole("button", { name: /^Revisar/ })
      expect(revisar.className).toMatch(/max-md:h-11/)
      expect(within(tarjetas).getByText("Rubro: R12 · Transporte")).toBeInTheDocument()
    })
  })

  describe("por rubro", () => {
    it("lists programmed, executed, % of programmed with a bar, and the rubro's available amount", async () => {
      setup()

      const tabla = await screen.findByTestId("financiero-rubros")
      const cabeceras = within(tabla).getAllByRole("columnheader").map((th) => th.textContent)
      expect(cabeceras).toEqual(["Rubro", "Programado a hoy", "Ejecutado", "% de lo programado", "Disponible del rubro"])
      expect(within(tabla).getByRole("button", { name: "Ayuda: Disponible del rubro" })).toBeInTheDocument()
      const filas = within(tabla).getAllByTestId("financiero-rubro")
      expect(filas).toHaveLength(2)
      expect(filas[0]).toHaveTextContent("R01 · Personal")
      expect(filas[0]).toHaveTextContent("$ 29.750.000")
      expect(filas[0]).toHaveTextContent("$ 27.000.000")
      expect(filas[0]).toHaveTextContent("90,8 %")
      // Disponible = asignado − ejecutado: 59.500.000 − 27.000.000.
      expect(filas[0]).toHaveTextContent("$ 32.500.000")
      const barra = within(filas[1]).getByRole("progressbar", { name: "R12 · Transporte: 112,5 % de lo programado" })
      expect(barra).toHaveAttribute("data-band", "rojo")
    })

    it("flags the rubro that a pending expense would push over its assigned amount", async () => {
      setup({ gastos: [gasto("g1", { alerta_sobregasto: true }), gasto("g2", { alerta_sobregasto: true })] })
      const filas = await screen.findAllByTestId("financiero-rubro")
      expect(await within(filas[1]).findByText("2 gastos por validar lo superan")).toBeInTheDocument()
      expect(filas[0]).not.toHaveTextContent("por validar")
    })

    it("becomes one card per rubro on the phone, with the % on top and three figures below", async () => {
      mockViewport(true)
      setup()
      const lista = await screen.findByTestId("financiero-rubros")
      expect(lista.tagName).toBe("UL")
      const tarjeta = within(lista).getAllByTestId("financiero-rubro")[0]
      expect(tarjeta).toHaveTextContent("Programado a hoy$ 29.750.000")
      expect(tarjeta).toHaveTextContent("Ejecutado$ 27.000.000")
      expect(tarjeta).toHaveTextContent("Disponible$ 32.500.000")
    })

    it("says so when the project has no budget yet", async () => {
      setup({ ficha: { ...FICHA, rubros: [] } })
      expect(await screen.findByText("Aún no hay presupuesto asignado a este proyecto.")).toBeInTheDocument()
    })
  })

  describe("detail with differences and colour limits", () => {
    it("is folded by default and opens with the keyboard (aria-expanded)", async () => {
      const user = userEvent.setup()
      setup()

      const boton = await screen.findByRole("button", { name: "Ver detalle con diferencias y límites de cada color" })
      expect(boton).toHaveAttribute("aria-expanded", "false")
      expect(screen.queryByTestId("financiero-tabla")).not.toBeInTheDocument()
      expect(screen.queryByRole("combobox", { name: "Calcular hasta" })).not.toBeInTheDocument()

      boton.focus()
      await user.keyboard("{Enter}")
      expect(screen.getByRole("button", { name: "Ocultar detalle" })).toHaveAttribute("aria-expanded", "true")
      expect(screen.getByTestId("financiero-tabla")).toBeInTheDocument()
      expect(screen.getByRole("group", { name: "Opciones avanzadas" })).toBeInTheDocument()
      expect(screen.getByRole("combobox", { name: "Calcular hasta" })).toBeInTheDocument()
      expect(screen.getByRole("combobox", { name: "Comparar con" })).toBeInTheDocument()
    })

    it("renders A, P, E, D, percentages and the API colour of each rubro plus the total row", async () => {
      const user = userEvent.setup()
      setup()
      await abrirDetalle(user)

      const tabla = screen.getByTestId("financiero-tabla")
      const filas = within(tabla).getAllByTestId("financiero-fila")
      expect(filas).toHaveLength(2)
      expect(filas[0]).toHaveTextContent("R01")
      expect(filas[0]).toHaveTextContent("$ 59.500.000")
      expect(filas[0]).toHaveTextContent("$ 29.750.000")
      expect(filas[0]).toHaveTextContent("$ 27.000.000")
      expect(filas[0]).toHaveTextContent("-$ 2.750.000")
      expect(filas[0]).toHaveTextContent("90,8 %")
      expect(filas[0]).toHaveTextContent("45,4 %")
      expect(filas[0]).toHaveTextContent("$ 32.725.000")
      expect(filas[0].querySelector("[data-color]")).toHaveAttribute("data-color", "verde")
      expect(filas[1].querySelector("[data-color]")).toHaveAttribute("data-color", "rojo")
      const total = within(tabla).getByTestId("financiero-total")
      expect(total).toHaveTextContent("$ 83.500.000")
    })

    it("names every column in plain words: no E/P, E/A or Umbral rojo", async () => {
      const user = userEvent.setup()
      setup()
      await abrirDetalle(user)

      const cabeceras = within(screen.getByTestId("financiero-tabla")).getAllByRole("columnheader").map((th) => th.textContent)
      expect(cabeceras).toEqual([
        "Rubro", "Asignado", "Programado a hoy", "Ejecutado", "Diferencia", "% de lo programado", "% de lo asignado", "Pasa a rojo desde", "Color",
      ])
      expect(screen.getByTestId("financiero")).not.toHaveTextContent(/E\/P|E\/A|Umbral rojo|\bpp\b|Σ/)
    })

    it("explains the difference and what green, yellow and red mean with the project tolerance", async () => {
      const user = userEvent.setup()
      setup()
      await abrirDetalle(user)

      const leyenda = screen.getByTestId("financiero-ejecucion-leyenda")
      expect(leyenda).toHaveTextContent("Diferencia = ejecutado − programado.")
      expect(leyenda).toHaveTextContent("Verde: lo ejecutado no supera lo programado.")
      expect(leyenda).toHaveTextContent("Amarillo: lo supera hasta un 10 %.")
      expect(leyenda).toHaveTextContent("Rojo")
    })

    it("renders no colours or execution percentages while expenses are unavailable", async () => {
      const user = userEvent.setup()
      setup({ ficha: SIN_GASTOS })
      await abrirDetalle(user)
      const tabla = screen.getByTestId("financiero-tabla")
      expect(tabla.querySelector("[data-color]")).toBeNull()
      expect(within(tabla).getAllByTestId("financiero-fila")[0]).toHaveTextContent("$ 29.750.000")
    })

    it("offers one corte per project month and refetches when it changes; the figure says up to which month", async () => {
      const user = userEvent.setup()
      setup()
      await abrirDetalle(user)

      const corte = screen.getByRole("combobox", { name: "Calcular hasta" })
      expect(within(corte).getAllByRole("option").map((o) => o.getAttribute("value"))).toEqual([
        "2026-10", "2026-11", "2026-12", "2027-01",
      ])
      expect(within(corte).getAllByRole("option").map((o) => o.textContent)).toEqual([
        "oct 2026", "nov 2026", "dic 2026", "ene 2027",
      ])

      await user.selectOptions(corte, "2026-12")
      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/financial-sheet?corte=2026-12", expect.any(Object)),
      )
      expect(screen.getByTestId("cifra-programado")).toHaveTextContent("Programado hasta")
    })

    it("announces a non-default corte or base with a chip while the detail is folded, and resets them", async () => {
      const user = userEvent.setup()
      setup()

      await screen.findByTestId("financiero-cifras")
      expect(screen.queryByTestId("financiero-filtros")).not.toBeInTheDocument()

      await abrirDetalle(user)
      await user.selectOptions(screen.getByRole("combobox", { name: "Calcular hasta" }), "2026-12")
      await user.selectOptions(screen.getByRole("combobox", { name: "Comparar con" }), "original")
      await user.click(await screen.findByRole("button", { name: "Ocultar detalle" }))
      expect(screen.queryByRole("combobox", { name: "Calcular hasta" })).not.toBeInTheDocument()
      expect(screen.getByTestId("financiero-filtros")).toHaveTextContent("Comparado con el plan inicial · Hasta dic 2026")

      await user.click(within(screen.getByTestId("financiero-filtros")).getByRole("button", { name: "Restablecer" }))
      expect(screen.queryByTestId("financiero-filtros")).not.toBeInTheDocument()
      await waitFor(() =>
        expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/financial-sheet")).at(-1)?.[0]).toBe(
          "/api/v1/projects/p1/financial-sheet",
        ),
      )
    })

    it("keeps the base selector disabled while the baseline is not approved (BORRADOR)", async () => {
      const user = userEvent.setup()
      setup({ proyecto: { estado: "BORRADOR" } })
      await abrirDetalle(user)

      const base = screen.getByRole("combobox", { name: "Comparar con" })
      expect(base).toBeDisabled()
      expect(within(base).getAllByRole("option").map((o) => o.getAttribute("value"))).toEqual(["vigente"])
    })

    it("lets an approved project read the original: it refetches with base=original and keeps the corte", async () => {
      const user = userEvent.setup()
      setup()
      await abrirDetalle(user)

      const base = screen.getByRole("combobox", { name: "Comparar con" })
      expect(base).toBeEnabled()
      expect(within(base).getAllByRole("option").map((o) => o.getAttribute("value"))).toEqual(["vigente", "original"])
      await user.selectOptions(screen.getByRole("combobox", { name: "Calcular hasta" }), "2026-12")
      await user.selectOptions(screen.getByRole("combobox", { name: "Comparar con" }), "original")
      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/v1/projects/p1/financial-sheet?corte=2026-12&base=original",
          expect.any(Object),
        ),
      )
    })

    it("shows the 409 of an original that does not exist yet, inline", async () => {
      const user = userEvent.setup()
      setup()
      const base = fetchMock.getMockImplementation()!
      fetchMock.mockImplementation((input: unknown, init?: RequestInit) =>
        String(input).includes("base=original")
          ? Promise.resolve(jsonResponse({ error: "La versión original aún no existe.", code: "INVALID_STATE" }, 409))
          : base(input, init),
      )
      await abrirDetalle(user)
      await user.selectOptions(screen.getByRole("combobox", { name: "Comparar con" }), "original")
      expect(await screen.findByRole("alert")).toHaveTextContent("La versión original aún no existe.")
    })
  })

  it("shows the API error for a role that cannot read it", async () => {
    setup({ status: 403 })

    expect(await screen.findByRole("alert")).toHaveTextContent("No tienes permisos sobre este proyecto.")
    expect(screen.queryByTestId("financiero-cifras")).not.toBeInTheDocument()
    expect(screen.queryByTestId("financiero-rubros")).not.toBeInTheDocument()
  })

  it("asks for the project dates when they are missing, without reading the sheet", () => {
    setup({ proyecto: { fecha_inicio: null, fecha_fin: null } })

    expect(screen.getByText(/fechas de inicio y fin/i)).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/financial-sheet"))).toBe(false)
  })
})
