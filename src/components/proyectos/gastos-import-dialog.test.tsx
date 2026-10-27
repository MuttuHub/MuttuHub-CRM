// Importación de gastos desde Excel (B8): elegir archivo -> validar -> vista previa fila por fila
// (válidas e inválidas con su motivo) -> importar solo las válidas -> resultado con las rechazadas y el
// recordatorio de adjuntar los soportes. La mutación es real; solo se burlan `fetch`, `sonner` y la descarga.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GastosImportDialog } from "./gastos-import-dialog"

const { toast } = vi.hoisted(() => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock("sonner", () => ({ toast }))

const filaVista = (over: Record<string, unknown> = {}) => ({
  fila: 2,
  rubro: "Transporte",
  tercero: "Proveedor SAS",
  numero_documento: "FE-1",
  valor: "1500000.50",
  periodo: "2026-10",
  valida: true,
  mensaje: null,
  alertas: [],
  ...over,
})

const PREVIEW = {
  importado: false,
  resumen: { total: 3, validas: 2, invalidas: 1, valor_validas: "1700000.50" },
  filas: [
    filaVista(),
    filaVista({ fila: 3, rubro: "Inventado", tercero: null, numero_documento: null, valor: null, periodo: null, valida: false, mensaje: "No encontramos el rubro «Inventado» en el catálogo." }),
    filaVista({
      fila: 4,
      numero_documento: "FE-3",
      valor: "200000.00",
      alertas: [{ tipo: "DUPLICADO", gasto_id: null, proyecto_codigo: null, mensaje: "Ya existe un gasto con el mismo NIT/cédula y número de documento (en otro proyecto)." }],
    }),
  ],
}

const APLICADO = {
  importado: true,
  creados: 2,
  lote_id: "lote-1",
  valor_total: "1700000.50",
  gastos: [
    { fila: 2, id: "g1" },
    { fila: 4, id: "g2" },
  ],
  rechazadas: [{ fila: 3, rubro: "Inventado", mensaje: "No encontramos el rubro «Inventado» en el catálogo." }],
  alertas: [{ fila: 4, alertas: [{ tipo: "SOBREGASTO", mensaje: "Este gasto, sumado a los gastos validados, superaría el valor asignado al rubro." }] }],
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

function xlsx(nombre = "gastos.xlsx", bytes = 10) {
  return new File([new Uint8Array(bytes)], nombre, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
}

describe("GastosImportDialog", () => {
  const fetchMock = vi.fn()
  let queryClient: QueryClient
  let clicked: HTMLAnchorElement[]

  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }

  async function abrir(opciones: Parameters<typeof userEvent.setup>[0] = {}) {
    const user = userEvent.setup(opciones)
    render(<GastosImportDialog proyectoId="p1" />, { wrapper })
    await user.click(screen.getByRole("button", { name: "Importar gastos" }))
    return { user, dialogo: await screen.findByRole("dialog") }
  }

  async function validar(user: ReturnType<typeof userEvent.setup>, dialogo: HTMLElement, archivo = xlsx()) {
    await user.upload(within(dialogo).getByLabelText(/Archivo de gastos/), archivo)
    await user.click(within(dialogo).getByRole("button", { name: "Validar" }))
  }

  const llamadas = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/expenses/import"))

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    clicked = []
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:mock", revokeObjectURL: vi.fn() })
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this)
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    toast.error.mockReset()
    toast.success.mockReset()
  })

  it("opens from the trigger, says the supports come apart and keeps Validar disabled without a file", async () => {
    const { dialogo } = await abrir()
    expect(within(dialogo).getByText(/soporte/i)).toBeInTheDocument()
    expect(within(dialogo).getByRole("button", { name: "Validar" })).toBeDisabled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("downloads the template from the dialog", async () => {
    fetchMock.mockResolvedValue(new Response(new Blob(["x"]), { headers: { "Content-Disposition": 'attachment; filename="plantilla-gastos.xlsx"' } }))
    const { user, dialogo } = await abrir()
    await user.click(within(dialogo).getByRole("button", { name: "Descargar plantilla" }))
    await waitFor(() => expect(clicked.map((a) => a.download)).toEqual(["plantilla-gastos.xlsx"]))
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/expenses/template", { method: "GET" })
  })

  it("rejects a non-xlsx file and one over 4 MB before sending anything", async () => {
    const { user, dialogo } = await abrir({ applyAccept: false })
    const input = within(dialogo).getByLabelText(/Archivo de gastos/)
    await user.upload(input, new File(["a"], "gastos.csv", { type: "text/csv" }))
    expect(within(dialogo).getByRole("alert")).toHaveTextContent("Solo se aceptan los gastos en formato Excel (.xlsx).")
    await user.upload(input, xlsx("gastos.xlsx", 4 * 1024 * 1024 + 1))
    expect(within(dialogo).getByRole("alert")).toHaveTextContent("El archivo supera el límite de 4 MB.")
    expect(within(dialogo).getByRole("button", { name: "Validar" })).toBeDisabled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("validates and lists every row as valid or invalid with its reason and alerts", async () => {
    fetchMock.mockResolvedValue(jsonResponse(PREVIEW))
    const { user, dialogo } = await abrir()
    await validar(user, dialogo)

    const form = (llamadas()[0][1] as RequestInit).body as FormData
    expect(form.get("modo")).toBe("validar")
    const tabla = await within(dialogo).findByRole("table")
    const filas = within(tabla).getAllByRole("row").slice(1)
    expect(filas).toHaveLength(3)
    expect(filas[0]).toHaveTextContent("Válida")
    expect(filas[0]).toHaveTextContent("Proveedor SAS")
    expect(filas[1]).toHaveTextContent("Con error")
    expect(filas[1]).toHaveTextContent("No encontramos el rubro «Inventado» en el catálogo.")
    expect(filas[2]).toHaveTextContent("Ya existe un gasto con el mismo NIT/cédula")
    expect(within(dialogo).getByTestId("gastos-import-resumen")).toHaveTextContent("2 filas válidas")
    expect(within(dialogo).getByTestId("gastos-import-resumen")).toHaveTextContent("1 con error")
    expect(within(dialogo).getByRole("button", { name: "Importar 2 gastos" })).toBeEnabled()
  })

  it("imports only the valid rows on confirm and shows the result with the rejected rows and the support reminder", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(PREVIEW)).mockResolvedValueOnce(jsonResponse(APLICADO))
    const { user, dialogo } = await abrir()
    await validar(user, dialogo)
    await user.click(await within(dialogo).findByRole("button", { name: "Importar 2 gastos" }))

    await waitFor(() => expect(llamadas()).toHaveLength(2))
    const form = (llamadas()[1][1] as RequestInit).body as FormData
    expect(form.get("modo")).toBeNull()
    expect(form.get("archivo")).toBeInstanceOf(File)
    expect(toast.success).toHaveBeenCalledWith("2 gastos importados.")

    const resultado = await within(dialogo).findByTestId("gastos-import-resultado")
    expect(resultado).toHaveTextContent("Se importaron 2 gastos")
    expect(resultado).toHaveTextContent("1 fila se rechazó")
    expect(resultado).toHaveTextContent("No encontramos el rubro «Inventado» en el catálogo.")
    expect(resultado).toHaveTextContent("superaría el valor asignado al rubro")
    expect(resultado).toHaveTextContent("Adjunta el soporte de cada gasto desde la lista")
    await user.click(within(dialogo).getByRole("button", { name: "Listo" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it("disables the confirm button when no row is valid", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ importado: false, resumen: { total: 1, validas: 0, invalidas: 1, valor_validas: "0.00" }, filas: [PREVIEW.filas[1]] }),
    )
    const { user, dialogo } = await abrir()
    await validar(user, dialogo)
    expect(await within(dialogo).findByRole("button", { name: "Importar 0 gastos" })).toBeDisabled()
  })

  it("lists the file-level errors from the 400 and imports nothing", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: "El archivo tiene errores.", code: "VALIDATION_ERROR", reporte: { errores: [{ fila: null, rubro: null, mensaje: "Faltan las columnas obligatorias «Tercero»." }] } }, 400),
    )
    const { user, dialogo } = await abrir()
    await validar(user, dialogo)
    const errores = await within(dialogo).findByTestId("gastos-import-errores")
    expect(errores).toHaveTextContent("1 error")
    expect(errores).toHaveTextContent("Faltan las columnas obligatorias «Tercero».")
    expect(within(dialogo).queryByTestId("gastos-import-resultado")).toBeNull()
  })

  it("shows any other failure inline", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "Solo se pueden registrar gastos con el proyecto en ejecución.", code: "INVALID_STATE" }, 409))
    const { user, dialogo } = await abrir()
    await validar(user, dialogo)
    expect(await within(dialogo).findByText("Solo se pueden registrar gastos con el proyecto en ejecución.")).toBeInTheDocument()
  })

  it("forgets the file and the result when it closes", async () => {
    fetchMock.mockResolvedValue(jsonResponse(PREVIEW))
    const { user, dialogo } = await abrir()
    await validar(user, dialogo)
    await within(dialogo).findByRole("table")
    await user.click(within(dialogo).getByRole("button", { name: "Cancelar" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await user.click(screen.getByRole("button", { name: "Importar gastos" }))
    const otro = await screen.findByRole("dialog")
    expect(within(otro).queryByRole("table")).toBeNull()
    expect(within(otro).getByRole("button", { name: "Validar" })).toBeDisabled()
  })
})
