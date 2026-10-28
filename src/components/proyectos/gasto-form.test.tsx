// S6 U6: formulario de registro de gasto. Las queries/mutaciones son reales; solo `fetch`.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectBudgetRubro, ProjectListRow } from "@/hooks/projects"
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

describe("GastoForm", () => {
  const fetchMock = vi.fn()
  const onDone = vi.fn()

  function setup(respuesta: unknown = { gasto: { id: "g1" }, alertas: [] }) {
    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith("/expenses/sign")) {
        return Promise.resolve(
          jsonResponse({ storage_path: "proyectos/p1/soportes/u_f.pdf", token: "t", signed_url: "https://s.example/up", max_bytes: 10, allowed_extensions: ["pdf"] }),
        )
      }
      if (url === "https://s.example/up") return Promise.resolve(new Response(null, { status: 200 }))
      if (url.endsWith("/expenses") && init?.method === "POST") return Promise.resolve(jsonResponse(respuesta, 201))
      return Promise.resolve(jsonResponse({}))
    })
    return render(<GastoForm proyecto={PROYECTO} rubros={RUBROS} onDone={onDone} />, { wrapper: createWrapper() })
  }

  async function llenarBasicos(user: ReturnType<typeof userEvent.setup>, subtotal = "1.500.000,50", iva = "0") {
    await user.selectOptions(screen.getByLabelText("Rubro"), "r12")
    await user.clear(screen.getByLabelText("Fecha del documento"))
    await user.type(screen.getByLabelText("Fecha del documento"), "2026-10-15")
    await user.type(screen.getByLabelText("Subtotal"), subtotal)
    await user.clear(screen.getByLabelText("IVA"))
    if (iva !== "") await user.type(screen.getByLabelText("IVA"), iva)
    await user.type(screen.getByLabelText("Tercero"), "Proveedor SAS")
    await user.selectOptions(screen.getByLabelText("Tipo de identificación"), "NIT")
    await user.type(screen.getByLabelText("Número de identificación"), "900123456")
    await user.type(screen.getByLabelText("Número de documento"), "FE-0123")
    await user.type(screen.getByLabelText("Descripción"), "Tiquetes")
  }

  const postedBody = () => {
    const call = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith("/expenses") && (init as RequestInit)?.method === "POST")
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
})
