// Finanzas › Resumen, selector «Por actividad / Por rubro» (S10, EV-06). Se monta la pantalla real: el
// «Por rubro» es el ProjectFinanciero de siempre y el «Por actividad» el árbol nuevo. Solo se burla `fetch`;
// la hoja financiera que llega es la MISMA en las dos vistas, que es lo que S10 exige.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectListRow } from "@/hooks/projects"
import { toCents } from "@/lib/proyectos/money"
import { mockViewport } from "@/test/viewport"
import { VistasFinancieras } from "./vistas-financieras"

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

/** Una fila por rubro, con la forma exacta del nivel superior (S10). */
const rubro = (over: Record<string, unknown>) => ({
  rubro_id: "r1",
  codigo: "R01",
  nombre: "Personal",
  asignado: "0.00",
  programado: "0.00",
  ejecutado: "0.00",
  diferencia: "0.00",
  ep_decimas: null,
  ea_decimas: null,
  umbral_rojo: "0.00",
  color: null,
  ...over,
})

/** Una fila de `actividades`, con el detalle por rubro que S10 abre al elegirla. */
const actividad = (over: Record<string, unknown>) => ({
  actividad_id: null,
  codigo: null,
  nombre: "Sin actividad",
  objetivo_id: null,
  objetivo_codigo: null,
  gestion: true,
  asignado: "0.00",
  programado: "0.00",
  ejecutado: "0.00",
  diferencia: "0.00",
  saldo: "0.00",
  ep_decimas: null,
  ea_decimas: null,
  umbral_rojo: "0.00",
  color: null,
  rubros: [],
  ...over,
})

// Objetivo 1 (1.1 Talleres 24 M y 1.2 Ferias 20 M), después «Gestión del proyecto» (la transversal 1.3 y
// la fila «Sin actividad»), como las ordena el servidor. El ejecutado de las cuatro filas suma 40,5 M, el
// mismo `total.ejecutado` que pinta la vista por rubro.
const ACTIVIDADES = [
  actividad({
    actividad_id: "a1",
    codigo: "1.1",
    nombre: "Talleres",
    objetivo_id: "o1",
    objetivo_codigo: "1",
    gestion: false,
    asignado: "24000000.00",
    programado: "12000000.00",
    ejecutado: "9500000.00",
    diferencia: "-2500000.00",
    saldo: "14500000.00",
    ep_decimas: 792,
    ea_decimas: 396,
    umbral_rojo: "13200000.00",
    color: "verde",
    rubros: [
      rubro({
        rubro_id: "r1",
        codigo: "R01",
        nombre: "Personal",
        asignado: "20000000.00",
        programado: "10000000.00",
        ejecutado: "8000000.00",
        diferencia: "-2000000.00",
        ep_decimas: 800,
        ea_decimas: 400,
        umbral_rojo: "11000000.00",
        color: "verde",
      }),
      rubro({
        rubro_id: "r12",
        codigo: "R12",
        nombre: "Transporte",
        asignado: "4000000.00",
        programado: "2000000.00",
        ejecutado: "1500000.00",
        diferencia: "-500000.00",
        ep_decimas: 750,
        ea_decimas: 375,
        umbral_rojo: "2200000.00",
        color: "verde",
      }),
    ],
  }),
  actividad({
    actividad_id: "a2",
    codigo: "1.2",
    nombre: "Ferias",
    objetivo_id: "o1",
    objetivo_codigo: "1",
    gestion: false,
    asignado: "20000000.00",
    programado: "10000000.00",
    ejecutado: "12000000.00",
    diferencia: "2000000.00",
    saldo: "8000000.00",
    ep_decimas: 1200,
    ea_decimas: 600,
    umbral_rojo: "11000000.00",
    color: "rojo",
    rubros: [
      rubro({
        rubro_id: "r12",
        codigo: "R12",
        nombre: "Transporte",
        asignado: "20000000.00",
        programado: "10000000.00",
        ejecutado: "12000000.00",
        diferencia: "2000000.00",
        ep_decimas: 1200,
        ea_decimas: 600,
        umbral_rojo: "11000000.00",
        color: "rojo",
      }),
    ],
  }),
  actividad({
    actividad_id: "a3",
    codigo: "1.3",
    nombre: "Comunicación",
    asignado: "10000000.00",
    programado: "5000000.00",
    ejecutado: "5000000.00",
    diferencia: "0.00",
    saldo: "5000000.00",
    ep_decimas: 1000,
    ea_decimas: 500,
    umbral_rojo: "5500000.00",
    color: "verde",
    rubros: [
      rubro({
        rubro_id: "r1",
        codigo: "R01",
        nombre: "Personal",
        asignado: "10000000.00",
        programado: "5000000.00",
        ejecutado: "5000000.00",
        diferencia: "0.00",
        ep_decimas: 1000,
        ea_decimas: 500,
        umbral_rojo: "5500000.00",
        color: "verde",
      }),
    ],
  }),
  actividad({
    asignado: "29500000.00",
    programado: "14750000.00",
    ejecutado: "14000000.00",
    diferencia: "-750000.00",
    saldo: "15500000.00",
    ep_decimas: 949,
    ea_decimas: 475,
    umbral_rojo: "16225000.00",
    color: "verde",
    rubros: [
      rubro({
        rubro_id: "r1",
        codigo: "R01",
        nombre: "Personal",
        asignado: "29500000.00",
        programado: "14750000.00",
        ejecutado: "14000000.00",
        diferencia: "-750000.00",
        ep_decimas: 949,
        ea_decimas: 475,
        umbral_rojo: "16225000.00",
        color: "verde",
      }),
    ],
  }),
]

const FICHA = {
  base: "vigente",
  corte: "2026-11",
  estado: "EN_EJECUCION",
  ejecucion_disponible: true,
  rubros: [
    rubro({
      rubro_id: "r1",
      codigo: "R01",
      nombre: "Personal",
      asignado: "59500000.00",
      programado: "29750000.00",
      ejecutado: "27000000.00",
      diferencia: "-2750000.00",
      ep_decimas: 908,
      ea_decimas: 454,
      umbral_rojo: "32725000.00",
      color: "verde",
    }),
    rubro({
      rubro_id: "r12",
      codigo: "R12",
      nombre: "Transporte",
      asignado: "24000000.00",
      programado: "12000000.00",
      ejecutado: "13500000.00",
      diferencia: "1500000.00",
      ep_decimas: 1125,
      ea_decimas: 563,
      umbral_rojo: "13200000.00",
      color: "rojo",
    }),
  ],
  total: rubro({
    rubro_id: null,
    codigo: null,
    nombre: "Total",
    asignado: "83500000.00",
    programado: "41750000.00",
    ejecutado: "40500000.00",
    diferencia: "-1250000.00",
    ep_decimas: 970,
    ea_decimas: 485,
    umbral_rojo: "45925000.00",
    color: "verde",
  }),
  actividades: ACTIVIDADES,
  alerta_retraso: false,
  parametros: { tolerancia: 10, retraso: 70, confirmado: true },
}

// BORRADOR: el servidor no manda color ni porcentajes mientras no haya ejecución (S10).
const BORRADOR = {
  ...FICHA,
  estado: "BORRADOR",
  ejecucion_disponible: false,
  rubros: FICHA.rubros.map((fila) => ({
    ...fila,
    ejecutado: "0.00",
    diferencia: fila.asignado,
    ep_decimas: null,
    ea_decimas: null,
    color: null,
  })),
  total: {
    ...FICHA.total,
    ejecutado: "0.00",
    diferencia: FICHA.total.asignado,
    ep_decimas: null,
    ea_decimas: null,
    color: null,
  },
  actividades: [
    actividad({
      actividad_id: "a1",
      codigo: "1.1",
      nombre: "Talleres",
      objetivo_id: "o1",
      objetivo_codigo: "1",
      gestion: false,
      asignado: "24000000.00",
      programado: "12000000.00",
      ejecutado: "0.00",
      diferencia: "-12000000.00",
      saldo: "24000000.00",
      ep_decimas: null,
      ea_decimas: null,
      umbral_rojo: "13200000.00",
      color: null,
      rubros: [
        rubro({
          rubro_id: "r1",
          codigo: "R01",
          nombre: "Personal",
          asignado: "24000000.00",
          programado: "12000000.00",
          ejecutado: "0.00",
          diferencia: "-12000000.00",
          ep_decimas: null,
          ea_decimas: null,
          umbral_rojo: "13200000.00",
          color: null,
        }),
      ],
    }),
  ],
}

function respuestaGastos() {
  return {
    gastos: [],
    totales: Object.fromEntries(["REGISTRADO", "VALIDADO", "RECHAZADO", "ANULADO"].map((estado) => [estado, { cantidad: 0, valor: "0.00" }])),
    resumen: { vigentes: 0, observados: { cantidad: 0, valor: "0.00" } },
  }
}

describe("VistasFinancieras", () => {
  const fetchMock = vi.fn()

  type Setup = { ficha?: unknown; status?: number; proyecto?: Partial<ProjectListRow> }

  function setup({ ficha = FICHA as unknown, status = 200, proyecto = {} }: Setup = {}) {
    fetchMock.mockImplementation((input: unknown) => {
      const url = String(input)
      if (url.includes("/financial-sheet")) {
        return Promise.resolve(
          status === 200
            ? jsonResponse(ficha)
            : jsonResponse({ error: "No tienes permisos sobre este proyecto.", code: "FORBIDDEN" }, status),
        )
      }
      if (url.endsWith("/api/v1/auth/me")) return Promise.resolve(jsonResponse({ usuario: { id: "yo", nombre: "Yo", rol: "GERENCIA" } }))
      if (url.endsWith("/members")) return Promise.resolve(jsonResponse({ miembros: [] }))
      if (url.endsWith("/expenses")) return Promise.resolve(jsonResponse(respuestaGastos()))
      return Promise.resolve(jsonResponse({}))
    })
    return render(<VistasFinancieras proyecto={{ ...PROYECTO, ...proyecto }} />, { wrapper: createWrapper() })
  }

  const irAActividad = async (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole("radio", { name: "Por actividad" }))

  const irARubro = async (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole("radio", { name: "Por rubro" }))

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    mockViewport(false)
  })

  describe("(a) el selector y la vista de siempre", () => {
    it("abre en «Por rubro» con la tabla por rubro, su disponible y su semáforo (S10)", async () => {
      setup()

      const tabla = await screen.findByTestId("financiero-rubros")
      expect(within(tabla).getAllByTestId("financiero-rubro")).toHaveLength(2)
      expect(within(tabla).getAllByTestId("financiero-rubro")[0]).toHaveTextContent("R01 · Personal")
      expect(screen.getByRole("radio", { name: "Por rubro" })).toBeChecked()
      expect(screen.queryByTestId("finanzas-por-actividad")).not.toBeInTheDocument()
      // El semáforo de siempre, pintado del servidor.
      expect(screen.getByTestId("financiero-cifras").querySelector("[data-color]")).toHaveAttribute("data-color", "verde")
    })

    it("cambia a «Por actividad» y vuelve a «Por rubro» montando solo la vista activa (S10)", async () => {
      const user = userEvent.setup()
      setup()
      await screen.findByTestId("financiero-rubros")

      await irAActividad(user)
      expect(screen.getByTestId("finanzas-por-actividad")).toBeInTheDocument()
      expect(screen.queryByTestId("financiero-rubros")).not.toBeInTheDocument()

      await irARubro(user)
      expect(await screen.findByTestId("financiero-rubros")).toBeInTheDocument()
      expect(screen.queryByTestId("finanzas-por-actividad")).not.toBeInTheDocument()
    })
  })

  describe("(b) el ejecutado total", () => {
    it("es igual en las dos vistas porque sale del mismo payload (S10)", async () => {
      const user = userEvent.setup()
      setup()

      const porRubro = await screen.findByTestId("cifra-ejecutado")
      expect(porRubro).toHaveTextContent("$ 40.500.000")

      await irAActividad(user)
      const porActividad = await screen.findByTestId("actividad-total-ejecutado")
      expect(porActividad).toHaveTextContent("$ 40.500.000")
      // Y las filas que pinta la vista por actividad suman exactamente ese total.
      const suma = ACTIVIDADES.reduce((total, fila) => total + toCents(fila.ejecutado as string), BigInt(0))
      expect(suma).toBe(toCents("40500000.00"))
      expect(screen.getByTestId("actividad-totales")).toHaveTextContent("Programado al corte")
      expect(screen.getByTestId("actividad-totales")).toHaveTextContent("nov 2026")
    })

    it("pinta el total, los colores y los umbrales que manda el servidor, sin recalcularlos (S10)", async () => {
      const user = userEvent.setup()
      // Un payload incoherente a propósito: si la UI sumara las actividades o recalculara el color,
      // este test falla. El servidor es la única autoridad.
      setup({
        ficha: {
          ...FICHA,
          total: { ...FICHA.total, ejecutado: "40000000.00" },
          actividades: ACTIVIDADES.map((fila) =>
            fila.actividad_id === "a1"
              ? { ...fila, color: "amarillo", ep_decimas: 900, umbral_rojo: "99999999.00" }
              : fila,
          ),
        },
      })

      await screen.findByTestId("cifra-ejecutado")
      await irAActividad(user)

      expect(await screen.findByTestId("actividad-total-ejecutado")).toHaveTextContent("$ 40.000.000")
      const talleres = within(screen.getByTestId("actividad-grupo-1")).getAllByTestId("actividad-fila")[0]
      expect(talleres).toHaveTextContent("90,0 %")
      expect(talleres).toHaveTextContent("$ 99.999.999")
      expect(within(talleres).getByText("Amarillo")).toBeInTheDocument()
      expect(within(talleres).queryByText("Verde")).not.toBeInTheDocument()
    })
  })

  describe("(c) agrupación", () => {
    it("agrupa por objetivo y deja «Gestión del proyecto» al final, con su fila «Sin actividad» (S10)", async () => {
      const user = userEvent.setup()
      setup()
      await screen.findByTestId("financiero-rubros")
      await irAActividad(user)

      const grupos = screen.getAllByTestId(/^actividad-grupo/)
      expect(grupos.map((grupo) => within(grupo).getByRole("heading").textContent)).toEqual([
        "Objetivo 1",
        "Gestión del proyecto",
      ])
      const objetivo = screen.getByTestId("actividad-grupo-1")
      expect(within(objetivo).getAllByTestId("actividad-nombre").map((celda) => celda.textContent)).toEqual([
        "1.1 · Talleres",
        "1.2 · Ferias",
      ])
      const gestion = screen.getByTestId("actividad-grupo-gestion")
      expect(within(gestion).getAllByTestId("actividad-nombre").map((celda) => celda.textContent)).toEqual([
        "1.3 · Comunicación",
        "Sin actividad",
      ])
    })

    it("no inventa «Gestión del proyecto» cuando el payload no trae filas transversales (S10)", async () => {
      const user = userEvent.setup()
      setup({ ficha: { ...FICHA, actividades: ACTIVIDADES.filter((fila) => !fila.gestion) } })
      await screen.findByTestId("financiero-rubros")
      await irAActividad(user)

      expect(screen.getAllByTestId(/^actividad-grupo/)).toHaveLength(1)
      expect(screen.queryByTestId("actividad-grupo-gestion")).not.toBeInTheDocument()
    })
  })

  describe("(d) detalle por rubro", () => {
    it("abre una actividad y muestra sus rubros con los montos del payload (S10)", async () => {
      const user = userEvent.setup()
      setup()
      await screen.findByTestId("financiero-rubros")
      await irAActividad(user)

      const talleres = within(screen.getByTestId("actividad-grupo-1")).getAllByTestId("actividad-fila")[0]
      const boton = within(talleres).getByRole("button", { name: "1.1 · Talleres" })
      expect(boton).toHaveAttribute("aria-expanded", "false")
      expect(screen.queryByTestId("actividad-detalle")).not.toBeInTheDocument()

      await user.click(boton)
      expect(boton).toHaveAttribute("aria-expanded", "true")
      const panel = document.getElementById(boton.getAttribute("aria-controls") ?? "")
      expect(panel).not.toBeNull()

      const detalle = screen.getByTestId("actividad-detalle")
      expect(detalle).toHaveTextContent("Detalle por rubro")
      const rubros = within(detalle).getAllByTestId("actividad-rubro")
      expect(rubros).toHaveLength(2)
      expect(rubros[0]).toHaveTextContent("R01 · Personal")
      expect(rubros[0]).toHaveTextContent("$ 20.000.000")
      expect(rubros[0]).toHaveTextContent("$ 10.000.000")
      expect(rubros[0]).toHaveTextContent("$ 8.000.000")
      expect(rubros[1]).toHaveTextContent("R12 · Transporte")
      expect(rubros[1]).toHaveTextContent("$ 4.000.000")
      expect(rubros[1]).toHaveTextContent("$ 1.500.000")
      expect(rubros[1].querySelector("[data-color]")).toHaveAttribute("data-color", "verde")

      await user.click(boton)
      expect(screen.queryByTestId("actividad-detalle")).not.toBeInTheDocument()
    })

    it("el detalle no se mezcla entre actividades: cada una abre solo sus rubros (S10)", async () => {
      const user = userEvent.setup()
      setup()
      await screen.findByTestId("financiero-rubros")
      await irAActividad(user)

      const ferias = within(screen.getByTestId("actividad-grupo-1")).getAllByTestId("actividad-fila")[1]
      await user.click(within(ferias).getByRole("button", { name: "1.2 · Ferias" }))

      const detalle = screen.getByTestId("actividad-detalle")
      const rubros = within(detalle).getAllByTestId("actividad-rubro")
      expect(rubros).toHaveLength(1)
      expect(rubros[0]).toHaveTextContent("R12 · Transporte")
      expect(rubros[0]).toHaveTextContent("$ 20.000.000")
      expect(rubros[0]).toHaveTextContent("$ 12.000.000")
      expect(rubros[0].querySelector("[data-color]")).toHaveAttribute("data-color", "rojo")
    })
  })

  describe("(e) BORRADOR", () => {
    it("no pinta color ni porcentajes: los dos llegan nulos y la UI no los inventa (S10)", async () => {
      const user = userEvent.setup()
      setup({ ficha: BORRADOR, proyecto: { estado: "BORRADOR" } })
      await screen.findByTestId("financiero-rubros")
      await irAActividad(user)

      const vista = await screen.findByTestId("finanzas-por-actividad")
      expect(vista.querySelector("[data-color]")).toBeNull()
      expect(within(vista).queryByText(/^(Verde|Amarillo|Rojo)$/)).not.toBeInTheDocument()
      const talleres = within(screen.getByTestId("actividad-grupo-1")).getAllByTestId("actividad-fila")[0]
      // Sin porcentaje: el guion, nunca un 0 % inventado.
      expect(talleres).not.toHaveTextContent("%")
      expect(talleres).toHaveTextContent("—")
      // Los montos sí se pintan: el borrador tiene presupuesto, no ejecución.
      expect(talleres).toHaveTextContent("$ 24.000.000")
      expect(talleres).toHaveTextContent("$ 12.000.000")
    })
  })

  describe("(f) accesibilidad del selector", () => {
    it("es un grupo etiquetado, con las dos opciones, y anuncia la vista elegida (S10)", async () => {
      const user = userEvent.setup()
      setup()
      await screen.findByTestId("financiero-rubros")

      const grupo = screen.getByRole("group", { name: "Vista de finanzas" })
      const porRubro = within(grupo).getByRole("radio", { name: "Por rubro" })
      const porActividad = within(grupo).getByRole("radio", { name: "Por actividad" })
      expect(porRubro).toBeChecked()
      expect(porActividad).not.toBeChecked()
      expect(screen.getByRole("status")).toHaveTextContent("Vista por rubro")

      // Se llega con el teclado: la flecha mueve y elige dentro del grupo de radios.
      porRubro.focus()
      await user.keyboard("{ArrowRight}")
      expect(porActividad).toHaveFocus()
      expect(porActividad).toBeChecked()
      expect(screen.getByRole("status")).toHaveTextContent("Vista por actividad")
      expect(await screen.findByTestId("finanzas-por-actividad")).toBeInTheDocument()

      await user.keyboard("{ArrowLeft}")
      expect(porRubro).toHaveFocus()
      expect(porRubro).toBeChecked()
      expect(screen.getByRole("status")).toHaveTextContent("Vista por rubro")
    })
  })
})
