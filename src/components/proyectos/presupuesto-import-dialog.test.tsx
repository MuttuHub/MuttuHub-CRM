// Importación del presupuesto en el formato de la PO (P3): elegir archivo ->
// validar -> vista previa -> confirmar. La mutación es real; solo se burlan
// `fetch`, `sonner` y las APIs de descarga del navegador.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PresupuestoImportDialog } from "./presupuesto-import-dialog"

const { toast } = vi.hoisted(() => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock("sonner", () => ({ toast }))

const fila = (rubro_id: string, codigo: string, nombre: string, actual: string, nuevo: string, diferencia: string) => ({
  rubro_id,
  codigo,
  nombre,
  actual,
  nuevo,
  diferencia,
  en_archivo: true,
})

const PREVIEW = {
  importado: false,
  valido: true,
  rubros: [
    fila("r1", "R01", "Personal", "8000000.00", "10000000.00", "2000000.00"),
    fila("r10", "R10", "Viáticos", "0.00", "1500000.50", "1500000.50"),
    fila("r11", "R11", "Varios", "300000.00", "300000.00", "0.00"),
  ],
  suma_actual: "8300000.00",
  suma_nueva: "11800000.50",
  valor_total: "20000000.00",
  diferencia: "-8199999.50",
  cambios: 2,
}

const ERRORES = [
  { fila: 3, rubro: "Material POP", mensaje: "No encontramos el rubro «Material POP» en el catálogo." },
  { fila: 5, rubro: "Oficina", mensaje: "El valor no puede ser negativo." },
]

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

function xlsx(nombre = "presupuesto.xlsx", bytes = 10) {
  return new File([new Uint8Array(bytes)], nombre, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
}

describe("PresupuestoImportDialog", () => {
  const fetchMock = vi.fn()
  let queryClient: QueryClient
  let clicked: HTMLAnchorElement[]

  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }

  async function abrir(opciones: Parameters<typeof userEvent.setup>[0] = {}) {
    const user = userEvent.setup(opciones)
    render(<PresupuestoImportDialog proyectoId="p1" />, { wrapper })
    await user.click(screen.getByRole("button", { name: "Importar presupuesto" }))
    return { user, dialogo: await screen.findByRole("dialog") }
  }

  async function validar(user: ReturnType<typeof userEvent.setup>, dialogo: HTMLElement, archivo = xlsx()) {
    await user.upload(within(dialogo).getByLabelText(/Archivo del presupuesto/), archivo)
    await user.click(within(dialogo).getByRole("button", { name: "Validar" }))
  }

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

  it("downloads the blank template from the dialog", async () => {
    fetchMock.mockResolvedValue(
      new Response(new Blob(["x"]), { headers: { "Content-Disposition": 'attachment; filename="plantilla-presupuesto.xlsx"' } }),
    )
    const { user, dialogo } = await abrir()
    await user.click(within(dialogo).getByRole("button", { name: "Descargar plantilla" }))
    await waitFor(() => expect(clicked.map((a) => a.download)).toEqual(["plantilla-presupuesto.xlsx"]))
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/budget/template", { method: "GET" })
  })

  it("rejects a file that is not .xlsx before calling the API", async () => {
    const { user, dialogo } = await abrir({ applyAccept: false })
    await user.upload(within(dialogo).getByLabelText(/Archivo del presupuesto/), xlsx("presupuesto.csv"))
    expect(within(dialogo).getByText("Solo se acepta el presupuesto en formato Excel (.xlsx).")).toBeInTheDocument()
    expect(within(dialogo).getByRole("button", { name: "Validar" })).toBeDisabled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("validates and shows the preview table with the differences and the valor total warning", async () => {
    fetchMock.mockResolvedValue(jsonResponse(PREVIEW))
    const { user, dialogo } = await abrir()
    await validar(user, dialogo)

    const tabla = await within(dialogo).findByRole("table")
    expect(within(tabla).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Rubro", "Actual", "Nuevo", "Diferencia"])
    const filas = within(tabla).getAllByRole("row").slice(1)
    expect(filas).toHaveLength(3)
    expect(within(filas[0]).getByText("Personal")).toBeInTheDocument()
    expect(within(filas[0]).getByText("$ 8.000.000")).toBeInTheDocument()
    expect(within(filas[0]).getByText("$ 10.000.000")).toBeInTheDocument()
    expect(within(filas[0]).getByText("$ 2.000.000")).toBeInTheDocument()
    expect(within(filas[1]).getAllByText("$ 1.500.000,50")).toHaveLength(2)

    const aviso = within(dialogo).getByTestId("presupuesto-import-aviso")
    expect(aviso).toHaveTextContent("$ 11.800.000,50")
    expect(aviso).toHaveTextContent("$ 20.000.000")
    expect(aviso).toHaveTextContent("-$ 8.199.999,50")
    expect(within(dialogo).getByText(/2 rubros cambian/)).toBeInTheDocument()
    expect(within(dialogo).getByRole("button", { name: "Confirmar importación" })).toBeEnabled()
  })

  it("does not warn when the new sum equals the valor total", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...PREVIEW, suma_nueva: "20000000.00", diferencia: "0.00" }))
    const { user, dialogo } = await abrir()
    await validar(user, dialogo)
    await within(dialogo).findByRole("table")
    expect(within(dialogo).queryByTestId("presupuesto-import-aviso")).not.toBeInTheDocument()
  })

  it("shows the row errors and offers no confirmation", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: "El archivo tiene errores. Corrígelos y vuelve a subirlo.", code: "VALIDATION_ERROR", reporte: { errores: ERRORES } }, 400),
    )
    const { user, dialogo } = await abrir()
    await validar(user, dialogo)

    const errores = await within(dialogo).findByTestId("presupuesto-import-errores")
    expect(within(errores).getByRole("alert")).toHaveTextContent("2 errores")
    const filas = within(errores).getAllByRole("row").slice(1)
    expect(filas.map((f) => f.textContent)).toEqual([
      "3Material POPNo encontramos el rubro «Material POP» en el catálogo.",
      "5OficinaEl valor no puede ser negativo.",
    ])
    expect(within(dialogo).queryByRole("button", { name: "Confirmar importación" })).not.toBeInTheDocument()
  })

  it("confirms the import, refreshes the budget and closes", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(PREVIEW))
      .mockResolvedValueOnce(jsonResponse({ importado: true, cambios: 2, presupuesto: {} }))
    const invalidate = vi.spyOn(queryClient, "invalidateQueries")
    const { user, dialogo } = await abrir()
    await validar(user, dialogo)
    await user.click(await within(dialogo).findByRole("button", { name: "Confirmar importación" }))

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    const form = (fetchMock.mock.calls[1] as [string, RequestInit])[1].body as FormData
    expect(form.get("modo")).toBeNull()
    expect(invalidate.mock.calls.map(([f]) => f?.queryKey)).toContainEqual(["projects", "budget", "p1"])
    expect(toast.success).toHaveBeenCalledWith("Presupuesto importado.")
  })

  it("shows a non-report failure inline (e.g. the project left Borrador)", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: "Solo se puede editar el presupuesto y la programación de un proyecto en Borrador.", code: "INVALID_STATE" }, 409),
    )
    const { user, dialogo } = await abrir()
    await validar(user, dialogo)
    expect(await within(dialogo).findByText(/de un proyecto en Borrador/)).toBeInTheDocument()
  })
})
