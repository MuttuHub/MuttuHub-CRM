// S6 U6: formulario de registro de gasto. Las queries/mutaciones son reales; solo `fetch`.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type {
  ProjectActivity,
  ProjectBudgetLinea,
  ProjectBudgetRubro,
  ProjectExpense,
  ProjectListRow,
  ProjectObjective,
} from "@/hooks/projects"
import { GastoForm } from "./gasto-form"

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

const PROYECTO = {
  id: "p1",
  estado: "EN_EJECUCION",
  fecha_inicio: "2026-10-05",
  fecha_fin: "2027-01-29",
} as ProjectListRow

const RUBROS: ProjectBudgetRubro[] = [
  { rubro_id: "r12", codigo: "R12", nombre: "Transporte", activo: true, linea_id: "l12", asignado: "24000000.00", heredado_pendiente: false },
  { rubro_id: "r01", codigo: "R01", nombre: "Personal", activo: true, linea_id: "l01", asignado: "59500000.00", heredado_pendiente: false },
]

/** Un rubro con monto asignado, sin línea concreta: el presupuesto lo suma entre varias actividades. */
const RUBRO_EN_DOS_ACTIVIDADES: ProjectBudgetRubro = {
  rubro_id: "r12",
  codigo: "R12",
  nombre: "Transporte",
  activo: true,
  linea_id: null,
  asignado: "15000000.00",
  heredado_pendiente: false,
}

/** S9/T14.1: la línea es actividad + rubro + valor; R12 está presupuestado en DOS actividades. */
const LINEAS: ProjectBudgetLinea[] = [
  { linea_id: "l-a1-r12", actividad_id: "a1", actividad_codigo: "1.1", actividad_nombre: "Talleres", rubro_id: "r12", rubro_codigo: "R12", rubro_nombre: "Transporte", valor: "10000000.00" },
  { linea_id: "l-a2-r12", actividad_id: "a2", actividad_codigo: "2.1", actividad_nombre: "Ferias", rubro_id: "r12", rubro_codigo: "R12", rubro_nombre: "Transporte", valor: "5000000.00" },
  { linea_id: "l-a3-r01", actividad_id: "a3", actividad_codigo: "2.2", actividad_nombre: "Jornadas", rubro_id: "r01", rubro_codigo: "R01", rubro_nombre: "Personal", valor: "8000000.00" },
]

/** S9/T14.2-B2: las actividades 1.2 y 1.3 del ejemplo de la PO, las dos en el objetivo 1. */
const LINEAS_12_13: ProjectBudgetLinea[] = [
  { linea_id: "l-12-r12", actividad_id: "a12", actividad_codigo: "1.2", actividad_nombre: "Gestión de talleres", rubro_id: "r12", rubro_codigo: "R12", rubro_nombre: "Transporte", valor: "10000000.00" },
  { linea_id: "l-13-r01", actividad_id: "a13", actividad_codigo: "1.3", actividad_nombre: "Suministros", rubro_id: "r01", rubro_codigo: "R01", rubro_nombre: "Papelería", valor: "8000000.00" },
]

function actividad(id: string, codigo: string, nombre: string, objetivoId: string | null): ProjectActivity {
  return {
    id,
    proyecto_id: "p1",
    objetivo_id: objetivoId,
    tipo: objetivoId === null ? "TRANSVERSAL" : "NORMAL",
    codigo,
    nombre,
    semana_inicio: 1,
    semana_fin: 2,
    fecha_inicio: "2026-10-05",
    fecha_fin: "2026-10-16",
    peso: 2,
    responsable_id: null,
    fuera_de_duracion: false,
    created_at: "2026-10-01T12:00:00.000Z",
    updated_at: "2026-10-01T12:00:00.000Z",
  }
}

function objetivo(id: string, codigo: string, descripcion: string, orden: number): ProjectObjective {
  return {
    id,
    proyecto_id: "p1",
    codigo,
    descripcion,
    orden,
    created_at: "2026-10-01T12:00:00.000Z",
    updated_at: "2026-10-01T12:00:00.000Z",
  }
}

const ACTIVIDADES: ProjectActivity[] = [
  actividad("a1", "1.1", "Talleres", "o1"),
  actividad("a2", "2.1", "Ferias", "o2"),
  actividad("a3", "2.2", "Jornadas", "o2"),
]

/** S9/T14.2-B2: las dos actividades del ejemplo de la PO, ambas en el objetivo 1. */
const ACTIVIDADES_12_13: ProjectActivity[] = [
  actividad("a12", "1.2", "Gestión de talleres", "o1"),
  actividad("a13", "1.3", "Suministros", "o1"),
]

const OBJETIVOS: ProjectObjective[] = [
  objetivo("o1", "1", "Fortalecer capacidades", 1),
  objetivo("o2", "2", "Ampliar cobertura", 2),
]

const GASTO: ProjectExpense = {
  id: "g1",
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
  updated_at: "2026-10-16T12:00:00.000Z",
  validado_por_id: null,
  validado_at: null,
  rechazado_por_id: null,
  rechazado_at: null,
  motivo_rechazo: null,
  anulado_por_id: null,
  anulado_at: null,
  motivo_anulacion: null,
  soportes: [],
  soportes_count: 0,
}

/** S9/T14.2-B2: la factura de $1.000.000 repartida en la 1.2 ($350.000) y la 1.3 ($650.000). */
const GASTO_REPARTIDO: ProjectExpense = {
  ...GASTO,
  valor: "1000000.00",
  subtotal: "1000000.00",
  iva: "0.00",
  repartos: [
    {
      linea_id: "l-12-r12",
      actividad_id: "a12",
      rubro: { id: "r12", codigo: "R12", nombre: "Transporte" },
      valor: "350000.00",
      iva: "0.00",
    },
    {
      linea_id: "l-13-r01",
      actividad_id: "a13",
      rubro: { id: "r01", codigo: "R01", nombre: "Papelería" },
      valor: "650000.00",
      iva: "0.00",
    },
  ],
}

describe("GastoForm", () => {
  const fetchMock = vi.fn()
  const onDone = vi.fn()

  type Opciones = {
    lineas?: ProjectBudgetLinea[]
    actividades?: ProjectActivity[]
    objetivos?: ProjectObjective[]
  }

  function setup(
    respuesta: unknown = { gasto: { id: "g1" }, alertas: [] },
    duplicados: unknown = { alertas: [] },
    { lineas = [], actividades = ACTIVIDADES, objetivos = OBJETIVOS }: Opciones = {},
  ) {
    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith("/activities")) return Promise.resolve(jsonResponse({ actividades }))
      if (url.endsWith("/objectives")) return Promise.resolve(jsonResponse({ objetivos }))
      if (url.includes("/expenses/duplicates?")) return Promise.resolve(jsonResponse(duplicados))
      if (url.endsWith("/expenses/sign")) {
        // One distinct storage_path per file name, so a test can tell the supports apart by their upload.
        const { nombre } = JSON.parse(String(init?.body ?? "{}")) as { nombre?: string }
        return Promise.resolve(
          jsonResponse({ storage_path: `proyectos/p1/soportes/u_${nombre ?? "soporte"}`, token: "t", signed_url: "https://s.example/up", max_bytes: 10, allowed_extensions: ["pdf"] }),
        )
      }
      if (url === "https://s.example/up") return Promise.resolve(new Response(null, { status: 200 }))
      if (url.endsWith("/expenses") && init?.method === "POST") return Promise.resolve(jsonResponse(respuesta, 201))
      return Promise.resolve(jsonResponse({}))
    })
    return render(<GastoForm proyecto={PROYECTO} rubros={RUBROS} lineas={lineas} onDone={onDone} />, {
      wrapper: createWrapper(),
    })
  }

  /** Las opciones de un select, sin la de «Elige …». */
  function opcionesDe(etiqueta: string): string[] {
    return within(screen.getByLabelText(etiqueta))
      .getAllByRole("option")
      .map((opcion) => opcion.textContent ?? "")
      .filter((texto) => !texto.startsWith("Elige"))
  }

  /** Elige en `campo` la opción que se lee `texto`: el mismo nombre que ve la persona. */
  async function elegir(user: ReturnType<typeof userEvent.setup>, campo: string, texto: string) {
    const select = screen.getByLabelText(campo)
    await user.selectOptions(select, within(select).getByRole("option", { name: texto }))
  }

  /** The non-amount fields, so a test can decide which amounts to type before or after them. */
  async function llenarCamposDeGasto(
    user: ReturnType<typeof userEvent.setup>,
    { identificacion = true, documento = true, rubro = "r12" } = {},
  ) {
    await user.selectOptions(screen.getByLabelText("Rubro"), rubro)
    await user.clear(screen.getByLabelText("Fecha del documento"))
    await user.type(screen.getByLabelText("Fecha del documento"), "2026-10-15")
    await user.type(screen.getByLabelText("Tercero"), "Proveedor SAS")
    if (identificacion) {
      await user.selectOptions(screen.getByLabelText("Tipo de identificación"), "NIT")
      await user.type(screen.getByLabelText("Número de identificación"), "900123456")
    }
    if (documento) await user.type(screen.getByLabelText("Número de documento"), "FE-0123")
    await user.type(screen.getByLabelText("Descripción"), "Tiquetes")
  }

  async function llenarBasicos(user: ReturnType<typeof userEvent.setup>, subtotal = "1.500.000,50", iva = "0") {
    await llenarCamposDeGasto(user)
    await user.type(screen.getByLabelText("Subtotal"), subtotal)
    await user.clear(screen.getByLabelText("IVA"))
    if (iva !== "") await user.type(screen.getByLabelText("IVA"), iva)
  }

  const postedBody = () => {
    const call = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith("/expenses") && (init as RequestInit)?.method === "POST")
    return call ? JSON.parse((call[1] as RequestInit).body as string) : null
  }

  /** S2/T6: modo corrección; el PATCH del gasto es la única escritura que se espera. */
  function setupEdicion(respuesta: unknown = { gasto: GASTO, alertas: [] }, status = 200) {
    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      const url = String(input)
      if (url.includes("/expenses/duplicates?")) return Promise.resolve(jsonResponse({ alertas: [] }))
      if (url.endsWith("/expenses/g1") && init?.method === "PATCH") return Promise.resolve(jsonResponse(respuesta, status))
      return Promise.resolve(jsonResponse({}))
    })
    return render(<GastoForm proyecto={PROYECTO} rubros={RUBROS} gasto={GASTO} onDone={onDone} />, { wrapper: createWrapper() })
  }

  const patchBody = () => {
    const call = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith("/expenses/g1") && (init as RequestInit)?.method === "PATCH")
    return call ? JSON.parse((call[1] as RequestInit).body as string) : null
  }

  beforeEach(() => {
    fetchMock.mockReset()
    onDone.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // Z3-5: with no funded rubro the select was empty and the only feedback was "Elige el rubro."
  it("explains that a rubro needs an assigned amount when none has one", async () => {
    const user = userEvent.setup()
    render(<GastoForm proyecto={PROYECTO} rubros={[]} onDone={onDone} />, { wrapper: createWrapper() })

    expect(screen.getByText(/Asigna primero un monto a un rubro/)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Registrar" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Asigna primero un monto a un rubro")
  })

  it("only offers rubros with an assigned amount above zero", () => {
    setup()
    const select = screen.getByLabelText("Rubro")
    expect(select).toHaveTextContent("R12")
    expect(select).toHaveTextContent("R01")
  })

  it("offers the support file in Spanish («Elegir archivo»), not the browser's «Choose File»", () => {
    setup()
    expect(screen.getByText("Elegir archivo")).toBeInTheDocument()
    expect(screen.getByText("Ningún archivo elegido")).toBeInTheDocument()
  })

  it("requires one support before sending anything", async () => {
    const user = userEvent.setup({ delay: null })
    setup()
    await llenarBasicos(user)
    await user.click(screen.getByRole("button", { name: "Registrar" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Adjunta al menos un soporte")
    expect(postedBody()).toBeNull()
  })

  it("registers with an https link support and sends subtotal and iva as strings, never a valor", async () => {
    const user = userEvent.setup({ delay: null })
    setup()
    await llenarBasicos(user)
    await user.click(screen.getByRole("radio", { name: "Enlace" }))
    await user.type(screen.getByLabelText("URL"), "https://drive.example/factura")
    await user.type(screen.getByLabelText("Nombre del enlace"), "Factura FE-0123")
    await user.click(screen.getByRole("button", { name: "Registrar" }))

    await waitFor(() => expect(postedBody()).not.toBeNull())
    const body = postedBody()
    expect(body.subtotal).toBe("1500000.50") // typed as 1.500.000,50
    expect(body.iva).toBe("0.00")
    expect(typeof body.subtotal).toBe("string")
    expect(body).not.toHaveProperty("valor")
    expect(body).toMatchObject({
      rubro_id: "r12",
      fecha_documento: "2026-10-15",
      tipo_soporte: "FACTURA_PROVEEDOR",
      tercero_nombre: "Proveedor SAS",
      tercero_tipo_id: "NIT",
      tercero_numero_id: "900123456",
      numero_documento: "FE-0123",
      descripcion: "Tiquetes",
      soportes: [{ url_externa: "https://drive.example/factura", nombre: "Factura FE-0123" }],
    })
    await waitFor(() => expect(onDone).toHaveBeenCalled())
  })

  it.each([
    ["1.500", "1500.00"],
    ["1.500,50", "1500.50"],
    ["12,5", "12.50"],
    ["1500", "1500.00"],
  ])("reads the subtotal %s with the es-CO parser and sends %s", async (typed, expected) => {
    const user = userEvent.setup({ delay: null })
    setup()
    await llenarBasicos(user, typed)
    await user.click(screen.getByRole("radio", { name: "Enlace" }))
    await user.type(screen.getByLabelText("URL"), "https://drive.example/factura")
    await user.type(screen.getByLabelText("Nombre del enlace"), "Factura FE-0123")
    await user.click(screen.getByRole("button", { name: "Registrar" }))
    await waitFor(() => expect(postedBody()).not.toBeNull())
    expect(postedBody().subtotal).toBe(expected)
  })

  it.each(["1.50", "1500.50", "1,500", "0", "0,00", "abc", "1,234", "1.5.0"])(
    "rejects the subtotal %s without sending anything",
    async (typed) => {
      const user = userEvent.setup({ delay: null })
      setup()
      await llenarBasicos(user, typed)
      await user.click(screen.getByRole("radio", { name: "Enlace" }))
      await user.type(screen.getByLabelText("URL"), "https://drive.example/factura")
      await user.type(screen.getByLabelText("Nombre del enlace"), "Factura FE-0123")
      await user.click(screen.getByRole("button", { name: "Registrar" }))
      expect(await screen.findByRole("alert")).toHaveTextContent("Ingresa un subtotal válido")
      expect(postedBody()).toBeNull()
    },
  )

  // AJ-05: the period follows the document date.
  describe("periodo", () => {
    const periodo = () => screen.getByLabelText("Periodo") as HTMLSelectElement

    async function enlace(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByRole("radio", { name: "Enlace" }))
      await user.type(screen.getByLabelText("URL"), "https://drive.example/factura")
      await user.type(screen.getByLabelText("Nombre del enlace"), "Factura FE-0123")
    }

    it("no longer offers «Mes del documento»", () => {
      setup()
      expect(screen.queryByRole("option", { name: "Mes del documento" })).not.toBeInTheDocument()
    })

    it("fills itself with the month of the date: 28/10/2026 gives 2026-10 without doing anything (S6)", async () => {
      const user = userEvent.setup({ delay: null })
      setup()
      await user.clear(screen.getByLabelText("Fecha del documento"))
      await user.type(screen.getByLabelText("Fecha del documento"), "2026-10-28")
      expect(periodo().value).toBe("2026-10")
    })

    it("changes with the date, and a hand-picked period is reset by a new date (S5)", async () => {
      const user = userEvent.setup({ delay: null })
      setup()
      await user.clear(screen.getByLabelText("Fecha del documento"))
      await user.type(screen.getByLabelText("Fecha del documento"), "2026-10-28")
      await user.selectOptions(periodo(), "2026-12")
      expect(periodo().value).toBe("2026-12")
      await user.clear(screen.getByLabelText("Fecha del documento"))
      await user.type(screen.getByLabelText("Fecha del documento"), "2026-11-03")
      expect(periodo().value).toBe("2026-11")
    })

    it("warns, tied to the field, that a hand-picked month will show as «Cuenta en AAAA-MM» (T3)", async () => {
      const user = userEvent.setup({ delay: null })
      setup()
      await user.clear(screen.getByLabelText("Fecha del documento"))
      await user.type(screen.getByLabelText("Fecha del documento"), "2026-10-28")
      expect(periodo()).not.toHaveAccessibleDescription()
      await user.selectOptions(periodo(), "2026-12")
      expect(periodo()).toHaveAccessibleDescription(
        "El gasto contará en 2026-12, un mes distinto al de su documento: en las listas se verá «Cuenta en 2026-12».",
      )
    })

    it("offers only the project months", () => {
      setup()
      const opciones = Array.from(periodo().options).map((o) => o.value).filter(Boolean)
      expect(opciones).toEqual(["2026-10", "2026-11", "2026-12", "2027-01"])
    })

    it("is empty and required when the date's month is not a project month (S5)", async () => {
      const user = userEvent.setup({ delay: null })
      setup()
      await llenarBasicos(user)
      await user.clear(screen.getByLabelText("Fecha del documento"))
      await user.type(screen.getByLabelText("Fecha del documento"), "2026-03-10")
      expect(periodo().value).toBe("")
      await enlace(user)
      await user.click(screen.getByRole("button", { name: "Registrar" }))
      expect(await screen.findByRole("alert")).toHaveTextContent("Elige el periodo")
      expect(postedBody()).toBeNull()
      await user.selectOptions(periodo(), "2026-12")
      await user.click(screen.getByRole("button", { name: "Registrar" }))
      await waitFor(() => expect(postedBody()).not.toBeNull())
      expect(postedBody()).toMatchObject({ fecha_documento: "2026-03-10", periodo: "2026-12" })
    })

    it("sends the filled period with the expense", async () => {
      const user = userEvent.setup({ delay: null })
      setup()
      await llenarBasicos(user)
      await enlace(user)
      await user.click(screen.getByRole("button", { name: "Registrar" }))
      await waitFor(() => expect(postedBody()).not.toBeNull())
      expect(postedBody()).toMatchObject({ fecha_documento: "2026-10-15", periodo: "2026-10" })
    })
  })

  // AJ-04: the Total is computed (Subtotal + IVA), shown read-only and never typed.
  it("shows the Total as Subtotal plus IVA, read-only, and updates it while typing (S1, S2)", async () => {
    const user = userEvent.setup({ delay: null })
    setup()
    const total = screen.getByLabelText("Total")
    expect(total).toHaveAttribute("readonly")
    expect(total).toHaveValue("$ 0")
    await user.type(screen.getByLabelText("Subtotal"), "1.000.000")
    await user.clear(screen.getByLabelText("IVA"))
    await user.type(screen.getByLabelText("IVA"), "190.000")
    expect(total).toHaveValue("$ 1.190.000")
    await user.clear(screen.getByLabelText("IVA"))
    await user.type(screen.getByLabelText("IVA"), "0")
    expect(total).toHaveValue("$ 1.000.000")
  })

  it("starts the IVA at 0 and does not offer a typed Total or a Valor field", () => {
    setup()
    expect(screen.getByLabelText("IVA")).toHaveValue("0")
    expect(screen.queryByLabelText("Valor")).not.toBeInTheDocument()
    expect(screen.getByLabelText("Total")).toHaveAttribute("readonly")
  })

  it("sends Subtotal 1.000.000 and IVA 190.000 and no total (S2)", async () => {
    const user = userEvent.setup({ delay: null })
    setup()
    await llenarBasicos(user, "1.000.000", "190.000")
    await user.click(screen.getByRole("radio", { name: "Enlace" }))
    await user.type(screen.getByLabelText("URL"), "https://drive.example/factura")
    await user.type(screen.getByLabelText("Nombre del enlace"), "Factura FE-0123")
    await user.click(screen.getByRole("button", { name: "Registrar" }))
    await waitFor(() => expect(postedBody()).not.toBeNull())
    expect(postedBody()).toMatchObject({ subtotal: "1000000.00", iva: "190000.00" })
    expect(postedBody()).not.toHaveProperty("valor")
    expect(postedBody()).not.toHaveProperty("total")
  })

  // S2/L16 (c): validators while typing, inline and never only on submit.
  it("shows the subtotal error inline while typing and clears it when the amount is valid", async () => {
    const user = userEvent.setup({ delay: null })
    setup()
    const subtotal = screen.getByLabelText("Subtotal")

    await user.type(subtotal, "0")
    expect(screen.getByRole("alert")).toHaveTextContent("Ingresa un subtotal válido")
    expect(subtotal).toHaveAttribute("aria-invalid", "true")

    await user.clear(subtotal)
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(subtotal).not.toHaveAttribute("aria-invalid")

    await user.type(subtotal, "abc")
    expect(screen.getByRole("alert")).toHaveTextContent("Ingresa un subtotal válido")

    await user.clear(subtotal)
    await user.type(subtotal, "1500")
    expect(subtotal).toHaveValue("1.500")
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("shows the IVA error inline while typing and accepts 0", async () => {
    const user = userEvent.setup({ delay: null })
    setup()
    const iva = screen.getByLabelText("IVA")

    await user.clear(iva)
    await user.type(iva, "abc")
    expect(screen.getByRole("alert")).toHaveTextContent("Ingresa un IVA válido")
    expect(iva).toHaveAttribute("aria-invalid", "true")

    await user.clear(iva)
    await user.type(iva, "0")
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(iva).not.toHaveAttribute("aria-invalid")
  })

  it("groups thousands in Subtotal and IVA while typing (S2)", async () => {
    const user = userEvent.setup({ delay: null })
    setup()
    const subtotal = screen.getByLabelText("Subtotal")
    const iva = screen.getByLabelText("IVA")

    await user.type(subtotal, "1500000")
    expect(subtotal).toHaveValue("1.500.000")

    await user.clear(iva)
    await user.type(iva, "190000")
    expect(iva).toHaveValue("190.000")
    expect(screen.getByLabelText("Total")).toHaveValue("$ 1.690.000")
  })

  it("warns, without blocking, when the IVA exceeds 19 % of the subtotal (S2, L16 c)", async () => {
    const user = userEvent.setup({ delay: null })
    setup()
    const subtotal = screen.getByLabelText("Subtotal")
    const iva = screen.getByLabelText("IVA")

    await user.type(subtotal, "1000000")
    await user.clear(iva)
    await user.type(iva, "190000")
    expect(iva).toHaveValue("190.000")
    expect(screen.queryByRole("status")).not.toBeInTheDocument()

    await user.clear(iva)
    await user.type(iva, "190001")
    expect(iva).toHaveValue("190.001")
    expect(screen.getByRole("status")).toHaveTextContent("El IVA supera el 19 % del subtotal")
    expect(iva).toHaveAccessibleDescription(/El IVA supera el 19 % del subtotal/)

    await llenarCamposDeGasto(user)
    await user.click(screen.getByRole("radio", { name: "Enlace" }))
    await user.type(screen.getByLabelText("URL"), "https://drive.example/factura")
    await user.type(screen.getByLabelText("Nombre del enlace"), "Factura FE-0123")
    await user.click(screen.getByRole("button", { name: "Registrar" }))

    await waitFor(() => expect(postedBody()).not.toBeNull())
    expect(postedBody()).toMatchObject({ subtotal: "1000000.00", iva: "190001.00" })
  })

  // S2/L16 (b): the duplicate check runs before saving, as soon as both identity fields are filled.
  it("warns inline about a duplicate before saving and still lets the expense be registered", async () => {
    const user = userEvent.setup({ delay: null })
    const mensaje = "Ya existe un gasto con el mismo NIT/cédula y número de documento (proyecto PRY-2026-001)."
    setup(undefined, { alertas: [{ tipo: "DUPLICADO", gasto_id: "g0", proyecto_codigo: "PRY-2026-001", mensaje }] })

    await user.selectOptions(screen.getByLabelText("Tipo de identificación"), "NIT")
    await user.type(screen.getByLabelText("Número de identificación"), "900123456")
    await user.type(screen.getByLabelText("Número de documento"), "FE-0123")

    expect(await screen.findByText(mensaje)).toBeInTheDocument()
    const consultas = fetchMock.mock.calls
      .map(([url]) => String(url))
      .filter((url) => url.includes("/expenses/duplicates?"))
    expect(consultas.at(-1)).toBe(
      "/api/v1/projects/p1/expenses/duplicates?tercero_tipo_id=NIT&tercero_numero_id=900123456&numero_documento=FE-0123",
    )
    expect(postedBody()).toBeNull()

    await llenarCamposDeGasto(user, { identificacion: false, documento: false })
    await user.type(screen.getByLabelText("Subtotal"), "1500")
    await user.click(screen.getByRole("radio", { name: "Enlace" }))
    await user.type(screen.getByLabelText("URL"), "https://drive.example/factura")
    await user.type(screen.getByLabelText("Nombre del enlace"), "Factura FE-0123")
    await user.click(screen.getByRole("button", { name: "Registrar" }))

    await waitFor(() => expect(postedBody()).not.toBeNull())
    expect(onDone).toHaveBeenCalled()
  })

  it("does not check duplicates when the third party has no identification number (RF-21)", async () => {
    const user = userEvent.setup({ delay: null })
    setup()

    await user.type(screen.getByLabelText("Número de documento"), "FE-0123")

    // S9/T14.1: el formulario lee actividades y objetivos para la cascada; lo que no se consulta es el duplicado.
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/expenses/duplicates"))).toBe(false)
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })

  it.each([
    ["", "Ingresa el IVA"],
    ["-5", "Ingresa un IVA válido"],
    ["abc", "Ingresa un IVA válido"],
    ["1.50", "Ingresa un IVA válido"],
  ])("rejects the IVA %j without sending anything", async (typed, message) => {
    const user = userEvent.setup({ delay: null })
    setup()
    await llenarBasicos(user, "1.000.000", typed)
    await user.click(screen.getByRole("radio", { name: "Enlace" }))
    await user.type(screen.getByLabelText("URL"), "https://drive.example/factura")
    await user.type(screen.getByLabelText("Nombre del enlace"), "Factura FE-0123")
    await user.click(screen.getByRole("button", { name: "Registrar" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(message)
    expect(postedBody()).toBeNull()
  })

  // S7: selecting a file shows its name and a Quitar control that clears the native input.
  it("shows the selected filename and a Quitar button that clears it without closing the form", async () => {
    const user = userEvent.setup({ delay: null })
    setup()
    await user.click(screen.getByRole("radio", { name: "Archivo" }))
    await user.upload(
      screen.getByLabelText("Archivo del soporte"),
      new File([new Uint8Array(1)], "factura.pdf", { type: "application/pdf" }),
    )

    expect(screen.getByText("factura.pdf")).toBeInTheDocument()
    expect(screen.queryByLabelText("Archivo del soporte")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Quitar" }))

    expect(screen.queryByText("factura.pdf")).not.toBeInTheDocument()
    expect(screen.getByLabelText("Archivo del soporte")).toBeInTheDocument()
  })

  it("uploads a file support through sign, PUT and confirm", async () => {
    const user = userEvent.setup({ delay: null })
    setup()
    await llenarBasicos(user)
    await user.click(screen.getByRole("radio", { name: "Archivo" }))
    await user.upload(screen.getByLabelText("Archivo del soporte"), new File(["x"], "f.pdf", { type: "application/pdf" }))
    await user.click(screen.getByRole("button", { name: "Registrar" }))

    await waitFor(() => expect(postedBody()).not.toBeNull())
    expect(fetchMock).toHaveBeenCalledWith("https://s.example/up", expect.objectContaining({ method: "PUT" }))
    expect(postedBody().soportes).toEqual([
      expect.objectContaining({ storage_path: "proyectos/p1/soportes/u_f.pdf", nombre: "f.pdf", tamano_bytes: 1 }),
    ])
  })

  // AJ-08 (S2): «cada gasto admite varios archivos y varios enlaces a la vez». Una lista de soportes con
  // «Agregar otro soporte»; cada fila elige su medio y el POST los lleva todos en el orden armado.
  describe("varios soportes", () => {
    /** File names sent to `/expenses/sign`, in call order: the uploads that actually happened. */
    const nombresFirmados = () =>
      fetchMock.mock.calls
        .filter(([url]) => String(url).endsWith("/expenses/sign"))
        .map(([, init]) => (JSON.parse(String((init as RequestInit).body)) as { nombre: string }).nombre)

    const elegirArchivo = async (
      user: ReturnType<typeof userEvent.setup>,
      etiqueta: string,
      nombre: string,
    ) => user.upload(screen.getByLabelText(etiqueta), new File(["x"], nombre, { type: "application/pdf" }))

    it("registra 2 archivos y 1 enlace, en el orden en que se agregaron (S2)", async () => {
      const user = userEvent.setup({ delay: null })
      setup()
      await llenarBasicos(user)

      await elegirArchivo(user, "Archivo del soporte", "uno.pdf")

      await user.click(screen.getByRole("button", { name: "Agregar otro soporte" }))
      await user.click(screen.getByRole("radio", { name: "Enlace 2" }))
      await user.type(screen.getByLabelText("URL 2"), "https://drive.example/dos")
      await user.type(screen.getByLabelText("Nombre del enlace 2"), "Enlace dos")

      await user.click(screen.getByRole("button", { name: "Agregar otro soporte" }))
      await elegirArchivo(user, "Archivo del soporte 3", "tres.pdf")

      await user.click(screen.getByRole("button", { name: "Registrar" }))

      await waitFor(() => expect(postedBody()).not.toBeNull())
      expect(postedBody().soportes).toEqual([
        expect.objectContaining({ storage_path: "proyectos/p1/soportes/u_uno.pdf", nombre: "uno.pdf", tamano_bytes: 1 }),
        { url_externa: "https://drive.example/dos", nombre: "Enlace dos" },
        expect.objectContaining({ storage_path: "proyectos/p1/soportes/u_tres.pdf", nombre: "tres.pdf", tamano_bytes: 1 }),
      ])
      expect(nombresFirmados()).toEqual(["uno.pdf", "tres.pdf"])
      await waitFor(() => expect(onDone).toHaveBeenCalled())
    })

    it("«Agregar otro soporte» agrega una fila y «Quitar soporte 2» la elimina sin subir su archivo (S2)", async () => {
      const user = userEvent.setup({ delay: null })
      setup()
      await llenarBasicos(user)

      expect(screen.queryByRole("group", { name: "Soporte 2" })).not.toBeInTheDocument()
      await user.click(screen.getByRole("button", { name: "Agregar otro soporte" }))
      expect(screen.getByRole("group", { name: "Soporte 2" })).toBeInTheDocument()

      await elegirArchivo(user, "Archivo del soporte 2", "borrame.pdf")
      expect(screen.getByText("borrame.pdf")).toBeInTheDocument()

      await user.click(screen.getByRole("button", { name: "Quitar soporte 2" }))
      expect(screen.queryByRole("group", { name: "Soporte 2" })).not.toBeInTheDocument()
      expect(screen.queryByText("borrame.pdf")).not.toBeInTheDocument()

      await elegirArchivo(user, "Archivo del soporte", "uno.pdf")
      await user.click(screen.getByRole("button", { name: "Registrar" }))

      await waitFor(() => expect(postedBody()).not.toBeNull())
      expect(postedBody().soportes).toEqual([expect.objectContaining({ nombre: "uno.pdf" })])
      expect(nombresFirmados()).toEqual(["uno.pdf"])
    })

    it("se detiene en 5 soportes: no se puede agregar un sexto (S2)", async () => {
      const user = userEvent.setup({ delay: null })
      setup()
      const agregar = screen.getByRole("button", { name: "Agregar otro soporte" })

      for (let fila = 2; fila <= 5; fila += 1) await user.click(agregar)

      expect(screen.getByRole("group", { name: "Soporte 5" })).toBeInTheDocument()
      expect(agregar).toBeDisabled()

      await user.click(agregar)
      expect(screen.queryByRole("group", { name: "Soporte 6" })).not.toBeInTheDocument()
      expect(screen.getAllByRole("group")).toHaveLength(5)
    })

    it("bloquea el guardado si una fila de archivo quedó sin archivo (S2)", async () => {
      const user = userEvent.setup({ delay: null })
      setup()
      await llenarBasicos(user)
      await elegirArchivo(user, "Archivo del soporte", "uno.pdf")
      await user.click(screen.getByRole("button", { name: "Agregar otro soporte" }))

      await user.click(screen.getByRole("button", { name: "Registrar" }))

      expect(await screen.findByRole("alert")).toHaveTextContent("Adjunta al menos un soporte (archivo o enlace).")
      const incompleta = screen.getByRole("group", { name: "Soporte 2" })
      expect(incompleta).toHaveAttribute("aria-invalid", "true")
      expect(incompleta).toHaveAccessibleDescription("Adjunta al menos un soporte (archivo o enlace).")
      // The complete row is not flagged.
      expect(screen.getByRole("group", { name: "Soporte" })).not.toHaveAttribute("aria-invalid")
      expect(postedBody()).toBeNull()
    })

    it("bloquea el guardado si una fila de enlace quedó sin nombre, y la deja pasar al completarla (S2)", async () => {
      const user = userEvent.setup({ delay: null })
      setup()
      await llenarBasicos(user)
      await elegirArchivo(user, "Archivo del soporte", "uno.pdf")
      await user.click(screen.getByRole("button", { name: "Agregar otro soporte" }))
      await user.click(screen.getByRole("radio", { name: "Enlace 2" }))
      await user.type(screen.getByLabelText("URL 2"), "https://drive.example/dos")

      await user.click(screen.getByRole("button", { name: "Registrar" }))

      expect(await screen.findByRole("alert")).toHaveTextContent("Adjunta al menos un soporte (archivo o enlace).")
      const incompleta = screen.getByRole("group", { name: "Soporte 2" })
      expect(incompleta).toHaveAttribute("aria-invalid", "true")
      expect(postedBody()).toBeNull()

      await user.type(screen.getByLabelText("Nombre del enlace 2"), "Enlace dos")
      expect(screen.queryByRole("alert")).not.toBeInTheDocument()
      expect(screen.getByRole("group", { name: "Soporte 2" })).not.toHaveAttribute("aria-invalid")

      await user.click(screen.getByRole("button", { name: "Registrar" }))
      await waitFor(() => expect(postedBody()).not.toBeNull())
      expect(postedBody().soportes).toHaveLength(2)
    })
  })

  describe("corrección (S2/T6)", () => {
    it("prefills the row's current values, hides the supports and saves with a PATCH", async () => {
      const user = userEvent.setup({ delay: null })
      setupEdicion()

      expect(screen.getByRole("form", { name: "Corregir gasto" })).toBeInTheDocument()
      expect(screen.getByLabelText("Tercero")).toHaveValue("Proveedor SAS")
      expect(screen.getByLabelText("Número de documento")).toHaveValue("FE-0123")
      expect(screen.getByLabelText("Descripción")).toHaveValue("Tiquetes del equipo")
      expect(screen.getByLabelText("Subtotal")).toHaveValue("1.500.000")
      expect(screen.getByLabelText("IVA")).toHaveValue("0")
      // Los soportes no forman parte de una corrección: `GASTO_PATCH_SCHEMA` no los admite.
      expect(screen.queryByText("Soportes")).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "Agregar otro soporte" })).not.toBeInTheDocument()

      await user.clear(screen.getByLabelText("Descripción"))
      await user.type(screen.getByLabelText("Descripción"), "Tiquetes corregidos")
      await user.click(screen.getByRole("button", { name: "Guardar cambios" }))

      await waitFor(() => expect(patchBody()).not.toBeNull())
      expect(patchBody()).toMatchObject({ descripcion: "Tiquetes corregidos" })
      expect(patchBody()).not.toHaveProperty("soportes")
      expect(postedBody()).toBeNull()
      await waitFor(() => expect(onDone).toHaveBeenCalled())
    })

    it("explains when the motive is required and shows the server's 400 inline", async () => {
      const user = userEvent.setup({ delay: null })
      setupEdicion({ error: "Escribe el motivo de la corrección.", code: "VALIDATION_ERROR" }, 400)

      const motivo = screen.getByLabelText("Motivo de la corrección")
      expect(motivo).toHaveAccessibleDescription(/Obligatorio al corregir el gasto de otra persona/)
      await user.type(motivo, "Corrijo el valor")
      await user.click(screen.getByRole("button", { name: "Guardar cambios" }))

      await waitFor(() => expect(patchBody()).not.toBeNull())
      expect(patchBody()).toMatchObject({ motivo: "Corrijo el valor" })
      expect(await screen.findByRole("alert")).toHaveTextContent("Escribe el motivo de la corrección.")
    })

    it("does not offer the correction motive when registering", () => {
      setup()
      expect(screen.queryByLabelText("Motivo de la corrección")).not.toBeInTheDocument()
    })
  })

  it("shows the duplicate and early-overspend alerts the API returns, and waits for the user to close", async () => {
    const user = userEvent.setup({ delay: null })
    setup({
      gasto: { id: "g1" },
      alertas: [
        { tipo: "DUPLICADO", gasto_id: null, proyecto_codigo: null, mensaje: "Ya existe un gasto con el mismo NIT/cédula y número de documento (en otro proyecto)." },
        { tipo: "SOBREGASTO", mensaje: "Este gasto, sumado a los gastos validados, superaría el valor asignado al rubro." },
      ],
    })
    await llenarBasicos(user)
    await user.click(screen.getByRole("radio", { name: "Enlace" }))
    await user.type(screen.getByLabelText("URL"), "https://drive.example/factura")
    await user.type(screen.getByLabelText("Nombre del enlace"), "Factura")
    await user.click(screen.getByRole("button", { name: "Registrar" }))

    expect(await screen.findByText(/Ya existe un gasto con el mismo NIT/)).toBeInTheDocument()
    expect(screen.getByText(/superaría el valor asignado al rubro/)).toBeInTheDocument()
    expect(onDone).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "Entendido" }))
    expect(onDone).toHaveBeenCalled()
  })

  it("shows the server error inline", async () => {
    const user = userEvent.setup({ delay: null })
    fetchMock.mockImplementation((input: unknown) =>
      Promise.resolve(
        String(input).endsWith("/expenses")
          ? jsonResponse({ error: "Solo puedes registrar gastos en rubros con valor asignado.", code: "VALIDATION_ERROR" }, 400)
          : jsonResponse({}),
      ),
    )
    render(<GastoForm proyecto={PROYECTO} rubros={RUBROS} onDone={onDone} />, { wrapper: createWrapper() })
    await llenarBasicos(user)
    await user.click(screen.getByRole("radio", { name: "Enlace" }))
    await user.type(screen.getByLabelText("URL"), "https://drive.example/factura")
    await user.type(screen.getByLabelText("Nombre del enlace"), "Factura")
    await user.click(screen.getByRole("button", { name: "Registrar" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Solo puedes registrar gastos en rubros con valor asignado.")
  })

  // S9 / T14.1: Objetivo (o «Gestión del proyecto») -> Actividad -> Rubro. El objetivo solo filtra; el gasto
  // se guarda contra la línea exacta de la actividad y el rubro elegidos.
  describe("gasto por objetivo, actividad y rubro (S9)", () => {
    /** Completar todo lo que no es la cascada, con un enlace como soporte. */
    async function llenarTodo(user: ReturnType<typeof userEvent.setup>, rubro = "r12") {
      await llenarCamposDeGasto(user, { rubro })
      await user.type(screen.getByLabelText("Subtotal"), "1.500.000,50")
      await user.click(screen.getByRole("radio", { name: "Enlace" }))
      await user.type(screen.getByLabelText("URL"), "https://drive.example/factura")
      await user.type(screen.getByLabelText("Nombre del enlace"), "Factura FE-0123")
    }

    it("al elegir el objetivo 2, la lista de actividades muestra solo las del objetivo 2 (S9)", async () => {
      const user = userEvent.setup({ delay: null })
      setup(undefined, undefined, { lineas: LINEAS })

      await waitFor(() =>
        expect(opcionesDe("Objetivo")).toEqual([
          "Objetivo 1 · Fortalecer capacidades",
          "Objetivo 2 · Ampliar cobertura",
        ]),
      )
      // El objetivo va primero: sin objetivo no hay actividades que ofrecer.
      expect(opcionesDe("Actividad")).toEqual([])

      await elegir(user, "Objetivo", "Objetivo 2 · Ampliar cobertura")
      expect(opcionesDe("Actividad")).toEqual(["2.1 · Ferias", "2.2 · Jornadas"])

      await elegir(user, "Objetivo", "Objetivo 1 · Fortalecer capacidades")
      expect(opcionesDe("Actividad")).toEqual(["1.1 · Talleres"])
    })

    it("la actividad elegida deja en Rubro solo los rubros presupuestados en ella (S9)", async () => {
      const user = userEvent.setup({ delay: null })
      setup(undefined, undefined, { lineas: LINEAS })

      await waitFor(() => expect(opcionesDe("Objetivo")).toHaveLength(2))
      await elegir(user, "Objetivo", "Objetivo 2 · Ampliar cobertura")
      await elegir(user, "Actividad", "2.1 · Ferias")
      expect(opcionesDe("Rubro")).toEqual(["R12 · Transporte"])

      await elegir(user, "Actividad", "2.2 · Jornadas")
      expect(opcionesDe("Rubro")).toEqual(["R01 · Personal"])
    })

    it.each([
      ["Objetivo 1 · Fortalecer capacidades", "1.1 · Talleres", "l-a1-r12"],
      ["Objetivo 2 · Ampliar cobertura", "2.1 · Ferias", "l-a2-r12"],
    ])(
      "un rubro presupuestado en dos actividades se ofrece en las dos y guarda su línea: %s › %s",
      async (etiquetaObjetivo, etiquetaActividad, lineaId) => {
        const user = userEvent.setup({ delay: null })
        setup(undefined, undefined, { lineas: LINEAS })

        await waitFor(() => expect(opcionesDe("Objetivo")).toHaveLength(2))
        await elegir(user, "Objetivo", etiquetaObjetivo)
        await elegir(user, "Actividad", etiquetaActividad)
        // R12 tiene dos líneas (una por actividad) y ninguna se oculta.
        expect(opcionesDe("Rubro")).toContain("R12 · Transporte")

        await llenarTodo(user)
        await user.click(screen.getByRole("button", { name: "Registrar" }))

        await waitFor(() => expect(postedBody()).not.toBeNull())
        expect(postedBody()).toMatchObject({ rubro_id: "r12", linea_id: lineaId })
        // El objetivo no se guarda: se deduce de la actividad, y la actividad de la línea.
        expect(postedBody()).not.toHaveProperty("objetivo_id")
        expect(postedBody()).not.toHaveProperty("actividad_id")
        await waitFor(() => expect(onDone).toHaveBeenCalled())
      },
    )

    it("no guarda nada hasta elegir objetivo, actividad y rubro, en ese orden (S9)", async () => {
      const user = userEvent.setup({ delay: null })
      setup(undefined, undefined, { lineas: LINEAS })
      await waitFor(() => expect(opcionesDe("Objetivo")).toHaveLength(2))

      await user.click(screen.getByRole("button", { name: "Registrar" }))
      expect(await screen.findByRole("alert")).toHaveTextContent("Elige el objetivo.")

      await elegir(user, "Objetivo", "Objetivo 2 · Ampliar cobertura")
      await user.click(screen.getByRole("button", { name: "Registrar" }))
      expect(await screen.findByRole("alert")).toHaveTextContent("Elige la actividad.")

      await elegir(user, "Actividad", "2.1 · Ferias")
      await user.click(screen.getByRole("button", { name: "Registrar" }))
      expect(await screen.findByRole("alert")).toHaveTextContent("Elige el rubro.")
      expect(postedBody()).toBeNull()
    })

    it("agrupa en «Gestión del proyecto» la actividad transversal, sin objetivo (S9)", async () => {
      const user = userEvent.setup({ delay: null })
      const lineas: ProjectBudgetLinea[] = [
        { linea_id: "l-g1-r01", actividad_id: "g1", actividad_codigo: "T.1", actividad_nombre: "Coordinación", rubro_id: "r01", rubro_codigo: "R01", rubro_nombre: "Personal", valor: "4000000.00" },
      ]
      setup(undefined, undefined, {
        lineas,
        actividades: [actividad("g1", "T.1", "Coordinación", null)],
      })

      await waitFor(() => expect(opcionesDe("Objetivo")).toEqual(["Gestión del proyecto"]))
      await waitFor(() => expect(opcionesDe("Actividad")).toEqual(["T.1 · Coordinación"]))
      expect(opcionesDe("Rubro")).toEqual(["R01 · Personal"])

      await llenarTodo(user, "r01")
      await user.click(screen.getByRole("button", { name: "Registrar" }))
      await waitFor(() => expect(postedBody()).not.toBeNull())
      expect(postedBody()).toMatchObject({ rubro_id: "r01", linea_id: "l-g1-r01" })
    })

    it("sin líneas del presupuesto mantiene el formulario por rubro de siempre (compatibilidad)", () => {
      setup()
      expect(screen.queryByLabelText("Objetivo")).not.toBeInTheDocument()
      expect(screen.queryByLabelText("Actividad")).not.toBeInTheDocument()
      expect(opcionesDe("Rubro")).toEqual(["R12 · Transporte", "R01 · Personal"])
    })

    // S9/T14.2-B2: la factura distribuida. Cada línea elige su actividad y su rubro con la misma cascada y escribe
    // su valor; la suma de las líneas tiene que ser exactamente el total (subtotal + IVA).
    describe("factura distribuida (S9)", () => {
      async function facturaDeUnMillon(user: ReturnType<typeof userEvent.setup>, subtotal = "1.000.000", iva = "0") {
        await user.type(screen.getByLabelText("Subtotal"), subtotal)
        await user.clear(screen.getByLabelText("IVA"))
        await user.type(screen.getByLabelText("IVA"), iva)
      }

      async function soporteEnlace(user: ReturnType<typeof userEvent.setup>) {
        await user.click(screen.getByRole("radio", { name: "Enlace" }))
        await user.type(screen.getByLabelText("URL"), "https://drive.example/factura")
        await user.type(screen.getByLabelText("Nombre del enlace"), "Factura FE-0123")
      }

      it("agrega una segunda línea y la guarda como repartos, con la cascada de cada línea y su valor (S9)", async () => {
        const user = userEvent.setup({ delay: null })
        setup(undefined, undefined, { lineas: LINEAS })
        await waitFor(() => expect(opcionesDe("Objetivo")).toHaveLength(2))

        await elegir(user, "Objetivo", "Objetivo 1 · Fortalecer capacidades")
        await elegir(user, "Actividad", "1.1 · Talleres")
        await llenarCamposDeGasto(user, { rubro: "r12" })
        // El total de la factura es Subtotal + IVA: 1.000.000 + 190.000.
        await facturaDeUnMillon(user, "1.000.000", "190.000")

        await user.click(screen.getByRole("button", { name: "Agregar línea de la distribución" }))
        await user.type(screen.getByLabelText("Valor"), "350.000")

        // La segunda línea tiene su propia cascada: objetivo 2, actividad 2.2 y su rubro.
        await elegir(user, "Objetivo 2", "Objetivo 2 · Ampliar cobertura")
        await elegir(user, "Actividad 2", "2.2 · Jornadas")
        await user.selectOptions(screen.getByLabelText("Rubro 2"), "r01")
        await user.type(screen.getByLabelText("Valor 2"), "650.000")
        // Con el IVA fuera de la suma la distribución no cuadra contra el total de la factura.
        expect(screen.getByText("Suma de la distribución: $ 1.000.000 de $ 1.190.000")).toBeInTheDocument()
        expect(screen.getByText("Faltan $ 190.000 para el total de la factura.")).toBeInTheDocument()

        await user.clear(screen.getByLabelText("Valor 2"))
        await user.type(screen.getByLabelText("Valor 2"), "840.000")
        expect(screen.getByText("Suma de la distribución: $ 1.190.000 de $ 1.190.000")).toBeInTheDocument()

        await soporteEnlace(user)
        await user.click(screen.getByRole("button", { name: "Registrar" }))

        await waitFor(() => expect(postedBody()).not.toBeNull())
        expect(postedBody().repartos).toEqual([
          { linea_id: "l-a1-r12", valor: "350000.00" },
          { linea_id: "l-a3-r01", valor: "840000.00" },
        ])
        // Con repartos la cabecera no lleva rubro ni línea: mezclarlos es el 400 que el servidor ya rechaza.
        expect(postedBody()).not.toHaveProperty("rubro_id")
        expect(postedBody()).not.toHaveProperty("linea_id")
        await waitFor(() => expect(onDone).toHaveBeenCalled())
      })

      // S9 criterio: «Una distribución que suma $990.000 para una factura de $1.000.000 no se guarda.»
      it("no se guarda una distribución de 990.000 para una factura de 1.000.000: muestra el faltante y se niega (S9)", async () => {
        const user = userEvent.setup({ delay: null })
        setup(undefined, undefined, { lineas: LINEAS })
        await waitFor(() => expect(opcionesDe("Objetivo")).toHaveLength(2))

        await elegir(user, "Objetivo", "Objetivo 1 · Fortalecer capacidades")
        await elegir(user, "Actividad", "1.1 · Talleres")
        await llenarCamposDeGasto(user, { rubro: "r12" })
        await facturaDeUnMillon(user)

        await user.click(screen.getByRole("button", { name: "Agregar línea de la distribución" }))
        await user.type(screen.getByLabelText("Valor"), "340.000")
        await elegir(user, "Objetivo 2", "Objetivo 2 · Ampliar cobertura")
        await elegir(user, "Actividad 2", "2.2 · Jornadas")
        await user.selectOptions(screen.getByLabelText("Rubro 2"), "r01")
        await user.type(screen.getByLabelText("Valor 2"), "650.000")

        expect(screen.getByText("Suma de la distribución: $ 990.000 de $ 1.000.000")).toBeInTheDocument()
        expect(screen.getByText("Faltan $ 10.000 para el total de la factura.")).toBeInTheDocument()

        await soporteEnlace(user)
        await user.click(screen.getByRole("button", { name: "Registrar" }))

        expect(await screen.findByRole("alert")).toHaveTextContent(
          "Las líneas de la distribución deben sumar exactamente el total de la factura.",
        )
        expect(postedBody()).toBeNull()

        // Completar el faltante deja guardar: la suma vuelve a cuadrar.
        await user.clear(screen.getByLabelText("Valor"))
        await user.type(screen.getByLabelText("Valor"), "350.000")
        await user.click(screen.getByRole("button", { name: "Registrar" }))
        await waitFor(() => expect(postedBody()).not.toBeNull())
        expect(postedBody().repartos).toHaveLength(2)
      })

      // S9 criterio: «La factura de $1.000.000 queda con $350.000 en la actividad 1.2 y $650.000 en la 1.3…»
      it("la factura de 1.000.000 queda con 350.000 en la actividad 1.2 y 650.000 en la 1.3 (S9)", async () => {
        const user = userEvent.setup({ delay: null })
        setup(undefined, undefined, { lineas: LINEAS_12_13, actividades: ACTIVIDADES_12_13 })
        await waitFor(() => expect(opcionesDe("Actividad")).toEqual(["1.2 · Gestión de talleres", "1.3 · Suministros"]))

        await elegir(user, "Actividad", "1.2 · Gestión de talleres")
        expect(opcionesDe("Rubro")).toEqual(["R12 · Transporte"])
        await llenarCamposDeGasto(user, { rubro: "r12" })
        await facturaDeUnMillon(user)

        await user.click(screen.getByRole("button", { name: "Agregar línea de la distribución" }))
        await user.type(screen.getByLabelText("Valor"), "350.000")
        await elegir(user, "Actividad 2", "1.3 · Suministros")
        await user.selectOptions(screen.getByLabelText("Rubro 2"), "r01")
        await user.type(screen.getByLabelText("Valor 2"), "650.000")

        expect(screen.getByText("Suma de la distribución: $ 1.000.000 de $ 1.000.000")).toBeInTheDocument()

        await soporteEnlace(user)
        await user.click(screen.getByRole("button", { name: "Registrar" }))

        await waitFor(() => expect(postedBody()).not.toBeNull())
        expect(postedBody().repartos).toEqual([
          { linea_id: "l-12-r12", valor: "350000.00" },
          { linea_id: "l-13-r01", valor: "650000.00" },
        ])
      })

      // EV-05 (Propuesto, D4): «el IVA de cada línea se calcula en proporción a su subtotal y se puede corregir».
      it("propone el IVA de cada línea en proporción y deja corregirlo, con la regla de la suma (EV-05)", async () => {
        const user = userEvent.setup({ delay: null })
        setup(undefined, undefined, { lineas: LINEAS_12_13, actividades: ACTIVIDADES_12_13 })
        await waitFor(() => expect(opcionesDe("Actividad")).toEqual(["1.2 · Gestión de talleres", "1.3 · Suministros"]))
        await elegir(user, "Actividad", "1.2 · Gestión de talleres")
        await llenarCamposDeGasto(user, { rubro: "r12" })
        await facturaDeUnMillon(user, "1.000.000", "190.000")
        await user.click(screen.getByRole("button", { name: "Agregar línea de la distribución" }))
        await user.type(screen.getByLabelText("Valor"), "350.000")
        await elegir(user, "Actividad 2", "1.3 · Suministros")
        await user.selectOptions(screen.getByLabelText("Rubro 2"), "r01")
        await user.type(screen.getByLabelText("Valor 2"), "840.000")

        // Proposed in proportion: 190.000 × 350/1.190 and the rest.
        expect(screen.getByLabelText("IVA de la línea")).toHaveValue("55.882,35")
        expect(screen.getByLabelText("IVA de la línea 2")).toHaveValue("134.117,65")

        // Corrected so it no longer adds up: not sent.
        await user.clear(screen.getByLabelText("IVA de la línea"))
        await user.type(screen.getByLabelText("IVA de la línea"), "50.000")
        await soporteEnlace(user)
        await user.click(screen.getByRole("button", { name: "Registrar" }))
        expect(await screen.findByText("El IVA de las líneas de la distribución debe sumar exactamente el IVA de la factura.")).toBeInTheDocument()
        expect(postedBody()).toBeNull()

        // Corrected so it adds up: sent line by line.
        await user.clear(screen.getByLabelText("IVA de la línea 2"))
        await user.type(screen.getByLabelText("IVA de la línea 2"), "140.000")
        await user.click(screen.getByRole("button", { name: "Registrar" }))
        await waitFor(() => expect(postedBody()).not.toBeNull())
        expect(postedBody().repartos).toEqual([
          { linea_id: "l-12-r12", valor: "350000.00", iva: "50000.00" },
          { linea_id: "l-13-r01", valor: "840000.00", iva: "140000.00" },
        ])
      })

      it("corrige una factura repartida mostrando sus líneas y con la misma regla de la suma (S9)", async () => {
        const user = userEvent.setup({ delay: null })
        fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
          const url = String(input)
          if (url.endsWith("/activities")) return Promise.resolve(jsonResponse({ actividades: ACTIVIDADES_12_13 }))
          if (url.endsWith("/objectives")) return Promise.resolve(jsonResponse({ objetivos: OBJETIVOS }))
          if (url.endsWith("/expenses/g1") && init?.method === "PATCH")
            return Promise.resolve(jsonResponse({ gasto: GASTO_REPARTIDO, alertas: [] }))
          return Promise.resolve(jsonResponse({}))
        })
        render(
          <GastoForm
            proyecto={PROYECTO}
            rubros={RUBROS}
            lineas={LINEAS_12_13}
            gasto={GASTO_REPARTIDO}
            onDone={onDone}
          />,
          { wrapper: createWrapper() },
        )

        expect(screen.getByRole("form", { name: "Corregir gasto" })).toBeInTheDocument()
        // La corrección abre con las dos líneas guardadas: su actividad, su rubro y su valor.
        await waitFor(() => expect(screen.getByLabelText("Valor")).toHaveValue("350.000"))
        expect(screen.getByLabelText("Valor 2")).toHaveValue("650.000")
        expect(screen.getByLabelText("Actividad")).toHaveValue("a12")
        expect(screen.getByLabelText("Actividad 2")).toHaveValue("a13")
        expect(screen.getByLabelText("Rubro")).toHaveValue("r12")
        expect(screen.getByLabelText("Rubro 2")).toHaveValue("r01")

        await user.clear(screen.getByLabelText("Valor 2"))
        await user.type(screen.getByLabelText("Valor 2"), "600.000")
        expect(screen.getByText("Faltan $ 50.000 para el total de la factura.")).toBeInTheDocument()

        await user.click(screen.getByRole("button", { name: "Guardar cambios" }))
        expect(await screen.findByRole("alert")).toHaveTextContent(
          "Las líneas de la distribución deben sumar exactamente el total de la factura.",
        )
        expect(patchBody()).toBeNull()

        await user.clear(screen.getByLabelText("Valor 2"))
        await user.type(screen.getByLabelText("Valor 2"), "650.000")
        await user.click(screen.getByRole("button", { name: "Guardar cambios" }))

        await waitFor(() => expect(patchBody()).not.toBeNull())
        expect(patchBody().repartos).toEqual([
          { linea_id: "l-12-r12", valor: "350000.00" },
          { linea_id: "l-13-r01", valor: "650000.00" },
        ])
        expect(patchBody()).not.toHaveProperty("rubro_id")
        await waitFor(() => expect(onDone).toHaveBeenCalled())
      })

      // Review of T14: the strict PATCH schema has no `linea_id`, so a split invoice corrected down to one line
      // must travel as a one-row distribution, never as `rubro_id` + `linea_id` (a 400 «Unrecognized key»).
      it("corrige una factura repartida dejándola en una sola línea, como una distribución de una fila (S9)", async () => {
        const user = userEvent.setup({ delay: null })
        fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
          const url = String(input)
          if (url.endsWith("/activities")) return Promise.resolve(jsonResponse({ actividades: ACTIVIDADES_12_13 }))
          if (url.endsWith("/objectives")) return Promise.resolve(jsonResponse({ objetivos: OBJETIVOS }))
          if (url.endsWith("/expenses/g1") && init?.method === "PATCH")
            return Promise.resolve(jsonResponse({ gasto: GASTO_REPARTIDO, alertas: [] }))
          return Promise.resolve(jsonResponse({}))
        })
        render(
          <GastoForm
            proyecto={PROYECTO}
            rubros={RUBROS}
            lineas={LINEAS_12_13}
            gasto={GASTO_REPARTIDO}
            onDone={onDone}
          />,
          { wrapper: createWrapper() },
        )

        await waitFor(() => expect(screen.getByLabelText("Valor 2")).toHaveValue("650.000"))
        await user.click(screen.getByRole("button", { name: "Quitar línea 2" }))
        await user.click(screen.getByRole("button", { name: "Guardar cambios" }))

        await waitFor(() => expect(patchBody()).not.toBeNull())
        expect(patchBody().repartos).toEqual([{ linea_id: "l-12-r12", valor: "1000000.00" }])
        expect(patchBody()).not.toHaveProperty("rubro_id")
        expect(patchBody()).not.toHaveProperty("linea_id")
        await waitFor(() => expect(onDone).toHaveBeenCalled())
      })

      // S9/T14.2-B2: mientras el presupuesto no trajo sus líneas no hay forma de saber a qué línea va cada fila; el
      // formulario se niega en vez de mandar una distribución a medias.
      it("se niega a corregir una factura repartida mientras el presupuesto no trae sus líneas (S9)", async () => {
        const user = userEvent.setup({ delay: null })
        fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
          const url = String(input)
          if (url.endsWith("/activities")) return Promise.resolve(jsonResponse({ actividades: ACTIVIDADES_12_13 }))
          if (url.endsWith("/objectives")) return Promise.resolve(jsonResponse({ objetivos: OBJETIVOS }))
          if (url.endsWith("/expenses/g1") && init?.method === "PATCH")
            return Promise.resolve(jsonResponse({ gasto: GASTO_REPARTIDO, alertas: [] }))
          return Promise.resolve(jsonResponse({}))
        })
        render(
          <GastoForm proyecto={PROYECTO} rubros={RUBROS} lineas={[]} gasto={GASTO_REPARTIDO} onDone={onDone} />,
          { wrapper: createWrapper() },
        )

        // Las filas se ven con sus valores, pero sin presupuesto no hay línea que enviar.
        await waitFor(() => expect(screen.getByLabelText("Valor")).toHaveValue("350.000"))
        expect(screen.getByLabelText("Valor 2")).toHaveValue("650.000")
        await user.click(screen.getByRole("button", { name: "Guardar cambios" }))

        expect(await screen.findByRole("alert")).toHaveTextContent(
          "Cada línea de la distribución debe ser una línea del proyecto con valor asignado.",
        )
        expect(patchBody()).toBeNull()
        expect(onDone).not.toHaveBeenCalled()
      })

      it("una factura de una sola línea sigue enviando el cuerpo de siempre, sin repartos (regresión)", async () => {
        const user = userEvent.setup({ delay: null })
        setup(undefined, undefined, { lineas: LINEAS })
        await waitFor(() => expect(opcionesDe("Objetivo")).toHaveLength(2))

        await elegir(user, "Objetivo", "Objetivo 2 · Ampliar cobertura")
        await elegir(user, "Actividad", "2.1 · Ferias")
        await llenarTodo(user)
        await user.click(screen.getByRole("button", { name: "Registrar" }))

        await waitFor(() => expect(postedBody()).not.toBeNull())
        expect(postedBody()).toMatchObject({ rubro_id: "r12", linea_id: "l-a2-r12" })
        expect(postedBody()).not.toHaveProperty("repartos")
        // Sin una segunda línea no hay campo «Valor»: el formulario de siempre no cambió.
        expect(screen.queryByLabelText("Valor")).not.toBeInTheDocument()
      })
    })

    it("ofrece en la corrección un rubro con dos líneas y guarda con su rubro (S9, compatibilidad del PATCH)", async () => {
      const user = userEvent.setup({ delay: null })
      fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith("/activities")) return Promise.resolve(jsonResponse({ actividades: ACTIVIDADES }))
        if (url.endsWith("/objectives")) return Promise.resolve(jsonResponse({ objetivos: OBJETIVOS }))
        if (url.endsWith("/expenses/g1") && init?.method === "PATCH")
          return Promise.resolve(jsonResponse({ gasto: GASTO, alertas: [] }))
        return Promise.resolve(jsonResponse({}))
      })
      render(
        <GastoForm
          proyecto={PROYECTO}
          rubros={[RUBRO_EN_DOS_ACTIVIDADES]}
          lineas={[LINEAS[0]!, LINEAS[1]!]}
          gasto={GASTO}
          onDone={onDone}
        />,
        { wrapper: createWrapper() },
      )

      expect(screen.getByRole("form", { name: "Corregir gasto" })).toBeInTheDocument()
      expect(opcionesDe("Rubro")).toEqual(["R12 · Transporte"])
      expect(screen.getByLabelText("Rubro")).toHaveValue("r12")

      await user.clear(screen.getByLabelText("Descripción"))
      await user.type(screen.getByLabelText("Descripción"), "Tiquetes corregidos")
      await user.click(screen.getByRole("button", { name: "Guardar cambios" }))

      await waitFor(() => expect(patchBody()).not.toBeNull())
      expect(patchBody()).toMatchObject({ rubro_id: "r12", descripcion: "Tiquetes corregidos" })
      expect(postedBody()).toBeNull()
      await waitFor(() => expect(onDone).toHaveBeenCalled())
    })
  })
})
