// Finanzas › Resumen, selector «Por actividad / Por rubro» (S10, EV-06). Se monta la pantalla real: el
// «Por rubro» es el ProjectFinanciero de siempre y el «Por actividad» el árbol nuevo. Solo se burla `fetch`;
// la hoja financiera que llega es la MISMA en las dos vistas, que es lo que S10 exige.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
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
  // S11/T14.5-B: el cierre viaja en la fila; abierta y sin ahorro por defecto, como lo manda el servidor.
  cerrada: false,
  cerrada_at: null,
  nota_cierre: null,
  ahorro: null,
  sobreejecucion: null,
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

/** La lista de objetivos de la estructura: la descripción que la hoja financiera no trae (L32.3). */
const OBJETIVOS = {
  objetivos: [
    {
      id: "o1",
      proyecto_id: "p1",
      codigo: "1",
      descripcion: "Ferias",
      orden: 1,
      created_at: "2026-10-01T00:00:00.000Z",
      updated_at: "2026-10-01T00:00:00.000Z",
    },
  ],
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

  type Setup = {
    ficha?: unknown
    status?: number
    proyecto?: Partial<ProjectListRow>
    /** Respuesta de `/objectives`: la descripción del objetivo no viene en la hoja financiera (L32.3). */
    objetivos?: unknown
    objetivosStatus?: number
  }

  function setup({ ficha = FICHA as unknown, status = 200, proyecto = {}, objetivos = {}, objetivosStatus = 200 }: Setup = {}) {
    fetchMock.mockImplementation((input: unknown) => {
      const url = String(input)
      if (url.includes("/financial-sheet")) {
        return Promise.resolve(
          status === 200
            ? jsonResponse(ficha)
            : jsonResponse({ error: "No tienes permisos sobre este proyecto.", code: "FORBIDDEN" }, status),
        )
      }
      if (url.endsWith("/objectives")) {
        return Promise.resolve(
          objetivosStatus === 200
            ? jsonResponse(objetivos)
            : jsonResponse({ error: "No pudimos leer los objetivos del proyecto.", code: "ERROR" }, objetivosStatus),
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

  describe("(g) el nombre del objetivo", () => {
    it("pinta «Objetivo 1. Ferias» con la descripción que trae la lista de objetivos (S10)", async () => {
      const user = userEvent.setup()
      setup({ objetivos: OBJETIVOS })
      await screen.findByTestId("financiero-rubros")
      await irAActividad(user)

      const grupo = await screen.findByTestId("actividad-grupo-1")
      expect(within(grupo).getByRole("heading")).toHaveTextContent("Objetivo 1. Ferias")
      // La descripción solo alarga el título: las filas y su orden son los del servidor.
      expect(within(grupo).getAllByTestId("actividad-nombre").map((celda) => celda.textContent)).toEqual([
        "1.1 · Talleres",
        "1.2 · Ferias",
      ])
    })

    it("deja «Objetivo 1» cuando la lista de objetivos no se puede leer (S10)", async () => {
      const user = userEvent.setup()
      setup({ objetivosStatus: 500 })
      await screen.findByTestId("financiero-rubros")
      await irAActividad(user)

      const grupo = await screen.findByTestId("actividad-grupo-1")
      // El texto de hoy, exacto: sin descripción no se inventa ninguna.
      expect(within(grupo).getByRole("heading").textContent).toBe("Objetivo 1")
      expect(screen.getByTestId("actividad-grupo-gestion")).toBeInTheDocument()
    })
  })

  describe("(h) tarjetas en el teléfono", () => {
    it("en el teléfono cada actividad es una tarjeta con los datos del servidor; en escritorio sigue la tabla (S10)", async () => {
      mockViewport(true)
      const user = userEvent.setup()
      setup()
      await screen.findByTestId("financiero-rubros")
      await irAActividad(user)

      // Teléfono: tarjetas, sin la tabla que hacía scroll horizontal.
      expect(screen.queryByRole("table")).not.toBeInTheDocument()
      const grupo = await screen.findByTestId("actividad-grupo-1")
      const lista = within(grupo).getByTestId("actividad-lista")
      expect(lista.tagName).toBe("UL")
      const [talleres, ferias] = within(lista).getAllByTestId("actividad-fila")
      expect(talleres.tagName).toBe("LI")
      expect(within(talleres).getByTestId("actividad-nombre")).toHaveTextContent("1.1 · Talleres")
      // Los mismos montos, el mismo umbral y el mismo porcentaje del payload, sin recalcular nada.
      expect(talleres).toHaveTextContent("$ 24.000.000")
      expect(talleres).toHaveTextContent("$ 12.000.000")
      expect(talleres).toHaveTextContent("$ 9.500.000")
      expect(talleres).toHaveTextContent("$ 14.500.000")
      expect(talleres).toHaveTextContent("$ 13.200.000")
      expect(talleres).toHaveTextContent("79,2 %")
      expect(talleres.querySelector("[data-color]")).toHaveAttribute("data-color", "verde")
      expect(ferias.querySelector("[data-color]")).toHaveAttribute("data-color", "rojo")
      // «Gestión del proyecto» también en tarjetas, en el mismo orden.
      expect(within(screen.getByTestId("actividad-grupo-gestion")).getByTestId("actividad-lista").tagName).toBe("UL")

      // Por encima del corte: la tabla de siempre, con las mismas filas.
      cleanup()
      mockViewport(false)
      setup()
      await screen.findByTestId("financiero-rubros")
      await irAActividad(userEvent.setup())

      const tabla = within(await screen.findByTestId("actividad-grupo-1")).getByTestId("actividad-tabla")
      expect(tabla.tagName).toBe("TABLE")
      expect(within(tabla).getAllByTestId("actividad-fila")).toHaveLength(2)
      expect(screen.queryByTestId("actividad-lista")).not.toBeInTheDocument()
    })

    it("abre el detalle por rubro en la tarjeta y en la tabla de escritorio (S10)", async () => {
      // Teléfono: la tarjeta abre sus rubros con los montos y el color del payload.
      mockViewport(true)
      const user = userEvent.setup()
      setup()
      await screen.findByTestId("financiero-rubros")
      await irAActividad(user)

      const talleres = within(await screen.findByTestId("actividad-grupo-1")).getAllByTestId("actividad-fila")[0]
      const boton = within(talleres).getByRole("button", { name: "1.1 · Talleres" })
      expect(boton).toHaveAttribute("aria-expanded", "false")
      await user.click(boton)
      expect(boton).toHaveAttribute("aria-expanded", "true")
      const panel = document.getElementById(boton.getAttribute("aria-controls") ?? "")
      expect(panel).not.toBeNull()

      const detalle = screen.getByTestId("actividad-detalle")
      // La tarjeta es la dueña del panel que anuncia `aria-controls`.
      expect(detalle).toBe(panel)
      expect(detalle).toHaveTextContent("Detalle por rubro")
      expect(within(detalle).getByTestId("actividad-rubros").tagName).toBe("UL")
      const rubros = within(detalle).getAllByTestId("actividad-rubro")
      expect(rubros).toHaveLength(2)
      expect(rubros[0]).toHaveTextContent("R01 · Personal")
      expect(rubros[0]).toHaveTextContent("$ 20.000.000")
      expect(rubros[0]).toHaveTextContent("$ 8.000.000")
      expect(rubros[0].querySelector("[data-color]")).toHaveAttribute("data-color", "verde")
      await user.click(boton)
      expect(screen.queryByTestId("actividad-detalle")).not.toBeInTheDocument()

      // Escritorio: el mismo detalle, dentro de la tabla de siempre.
      cleanup()
      mockViewport(false)
      setup()
      await screen.findByTestId("financiero-rubros")
      const usuario = userEvent.setup()
      await irAActividad(usuario)
      const fila = within(await screen.findByTestId("actividad-grupo-1")).getAllByTestId("actividad-fila")[0]
      const botonEscritorio = within(fila).getByRole("button", { name: "1.1 · Talleres" })
      await usuario.click(botonEscritorio)
      const panelEscritorio = document.getElementById(botonEscritorio.getAttribute("aria-controls") ?? "")
      expect(panelEscritorio).not.toBeNull()
      const detalleEscritorio = screen.getByTestId("actividad-detalle")
      // En escritorio el panel es la celda que anuncia el botón, dentro de la fila de detalle de la tabla.
      expect(detalleEscritorio).toContainElement(panelEscritorio)
      expect(within(detalleEscritorio).getByTestId("actividad-rubros").tagName).toBe("TABLE")
      expect(within(detalleEscritorio).getAllByTestId("actividad-rubro")).toHaveLength(2)
      expect(detalleEscritorio).toHaveTextContent("R01 · Personal")
    })
  })

  // S11/T14.5-B: saldo mientras los gastos están abiertos, ahorro o sobreejecución —con su nota— una vez
  // cerrados, y el cierre y la reapertura desde la misma fila. Los montos son del payload: la UI no calcula
  // ahorro ni sobreejecución, y sin nota (o sin motivo) no se manda nada.
  describe("(i) cierre de gastos de la actividad (S11)", () => {
    const NOTA = "No se requirió transporte porque el taller fue en el mismo municipio"
    const NOTA_OBLIGATORIA = "La nota del cierre es obligatoria."
    const MOTIVO_OBLIGATORIO = "El motivo de la reapertura es obligatorio."

    const filaBase = {
      actividad_id: "a1",
      codigo: "1.1",
      nombre: "Talleres",
      objetivo_id: "o1",
      objetivo_codigo: "1",
      gestion: false,
      rubros: [],
    }
    /** Abierta: 10.000.000 asignados y 7.000.000 ejecutados; el servidor manda saldo y ningún ahorro. */
    const abierta = actividad({ ...filaBase, asignado: "10000000.00", ejecutado: "7000000.00", saldo: "3000000.00" })
    const cerrada = (over: Record<string, unknown>) =>
      actividad({
        ...filaBase,
        cerrada: true,
        cerrada_at: "2026-11-15T10:00:00.000Z",
        nota_cierre: NOTA,
        ...over,
      })

    type Peticion = [input: unknown, init: RequestInit]
    /** Las peticiones que la pantalla mandó a una de las dos rutas del cierre. */
    const peticiones = (ruta: string): Peticion[] =>
      (fetchMock.mock.calls as Peticion[]).filter(([url]) => String(url).includes(ruta))

    async function abrirPorActividad() {
      const user = userEvent.setup()
      setup({ ficha: { ...FICHA, actividades: [abierta] } })
      await screen.findByTestId("financiero-rubros")
      await irAActividad(user)
      return user
    }

    it("una actividad abierta con 10.000.000 asignados y 7.000.000 ejecutados muestra saldo 3.000.000 (S11)", async () => {
      await abrirPorActividad()

      const fila = within(await screen.findByTestId("actividad-grupo-1")).getAllByTestId("actividad-fila")[0]
      expect(fila).toHaveTextContent("$ 3.000.000")
      expect(fila).toHaveTextContent("$ 10.000.000")
      expect(fila).toHaveTextContent("$ 7.000.000")
      // Abierta no se llama ahorro (S11), y la fila ofrece cerrarla.
      expect(fila).not.toHaveTextContent("Ahorro")
      expect(fila).not.toHaveTextContent("Sobreejecución")
      expect(within(fila).getByRole("button", { name: "Cerrar gastos de la actividad" })).toBeInTheDocument()
      expect(within(fila).queryByRole("button", { name: "Reabrir" })).not.toBeInTheDocument()
    })

    it("una actividad cerrada muestra el ahorro con su nota y la sobreejecución cuando gastó de más (S11)", async () => {
      const user = userEvent.setup()
      setup({
        ficha: {
          ...FICHA,
          actividades: [
            cerrada({ asignado: "10000000.00", ejecutado: "7000000.00", saldo: "3000000.00", ahorro: "3000000.00", sobreejecucion: "0.00" }),
            cerrada({
              actividad_id: "a2",
              codigo: "1.2",
              nombre: "Ferias",
              asignado: "10000000.00",
              ejecutado: "12000000.00",
              saldo: "-2000000.00",
              ahorro: "0.00",
              sobreejecucion: "2000000.00",
            }),
          ],
        },
      })
      await screen.findByTestId("financiero-rubros")
      await irAActividad(user)

      const [talleres, ferias] = within(await screen.findByTestId("actividad-grupo-1")).getAllByTestId("actividad-fila")
      // Ahorro con la nota del cierre (el criterio de S11), nunca el saldo de una actividad abierta.
      expect(talleres).toHaveTextContent("Ahorro")
      expect(talleres).toHaveTextContent("$ 3.000.000")
      expect(talleres).not.toHaveTextContent("Sobreejecución")
      expect(within(talleres).getByTestId("actividad-cierre-nota")).toHaveTextContent(NOTA)
      // Gastó de más: sobreejecución, no ahorro.
      expect(ferias).toHaveTextContent("Sobreejecución")
      expect(ferias).toHaveTextContent("$ 2.000.000")
      expect(ferias).not.toHaveTextContent("Ahorro")
      expect(within(ferias).getByTestId("actividad-cierre-nota")).toHaveTextContent(NOTA)
      // Cerrada: se puede reabrir, no volver a cerrar.
      expect(within(talleres).getByRole("button", { name: "Reabrir" })).toBeInTheDocument()
      expect(within(talleres).queryByRole("button", { name: "Cerrar gastos de la actividad" })).not.toBeInTheDocument()
    })

    it("no cierra sin nota: muestra el mensaje del servidor y no envía nada (S11)", async () => {
      const user = await abrirPorActividad()

      await user.click(screen.getByRole("button", { name: "Cerrar gastos de la actividad" }))
      const dialogo = await screen.findByRole("dialog")
      expect(within(dialogo).getByLabelText("Nota")).toBeInTheDocument()

      await user.click(within(dialogo).getByRole("button", { name: "Cerrar gastos" }))
      expect(await within(dialogo).findByText(NOTA_OBLIGATORIA)).toBeInTheDocument()
      expect(peticiones("/close-expenses")).toHaveLength(0)

      // Con la nota, el mismo botón cierra contra la ruta de la actividad.
      await user.type(within(dialogo).getByLabelText("Nota"), NOTA)
      await user.click(within(dialogo).getByRole("button", { name: "Cerrar gastos" }))
      await waitFor(() => expect(peticiones("/close-expenses")).toHaveLength(1))
      const [url, init] = peticiones("/close-expenses")[0]
      expect(String(url)).toContain("/api/v1/projects/p1/activities/a1/close-expenses")
      expect(JSON.parse(String(init.body))).toEqual({ nota: NOTA })
    })

    it("reabrir pide el motivo y no envía nada sin él (S11)", async () => {
      const user = userEvent.setup()
      setup({
        ficha: {
          ...FICHA,
          actividades: [
            cerrada({ asignado: "10000000.00", ejecutado: "7000000.00", saldo: "3000000.00", ahorro: "3000000.00", sobreejecucion: "0.00" }),
          ],
        },
      })
      await screen.findByTestId("financiero-rubros")
      await irAActividad(user)

      await user.click(screen.getByRole("button", { name: "Reabrir" }))
      const dialogo = await screen.findByRole("dialog")
      expect(within(dialogo).getByLabelText("Motivo")).toBeInTheDocument()

      await user.click(within(dialogo).getByRole("button", { name: "Reabrir gastos" }))
      expect(await within(dialogo).findByText(MOTIVO_OBLIGATORIO)).toBeInTheDocument()
      expect(peticiones("/reopen-expenses")).toHaveLength(0)

      await user.type(within(dialogo).getByLabelText("Motivo"), "Llegó una factura después del cierre")
      await user.click(within(dialogo).getByRole("button", { name: "Reabrir gastos" }))
      await waitFor(() => expect(peticiones("/reopen-expenses")).toHaveLength(1))
      const [url, init] = peticiones("/reopen-expenses")[0]
      expect(String(url)).toContain("/api/v1/projects/p1/activities/a1/reopen-expenses")
      expect(JSON.parse(String(init.body))).toEqual({ motivo: "Llegó una factura después del cierre" })
    })
  })
})
