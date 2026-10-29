// Importación de la estructura en el formato de la PO (B3): elegir archivo ->
// validar -> vista previa con los códigos generados -> confirmar. La mutación es
// real; solo se burlan `fetch` y `sonner`.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { EstructuraPOImportDialog } from "./estructura-po-import-dialog"

const { toast } = vi.hoisted(() => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock("sonner", () => ({ toast }))

const PREVIEW = {
  importado: false,
  valido: true,
  resumen: { objetivos: 2, indicadores: 1, actividades: 2, entregables: 3, errores: 0 },
  plan: {
    objetivos: [
      { codigo: "O1", descripcion: "Formalizar las unidades productivas." },
      { codigo: "O2", descripcion: "Desarrollar el modelo de negocio." },
    ],
    indicadores: [{ codigo: "IND-01", objetivoCodigo: "O1", nombre: "Asociaciones constituidas", meta: "2.00" }],
    actividades: [
      { codigo: "A1.1", objetivoCodigo: "O1", nombre: "Levantar línea base", semanaInicio: 1, semanaFin: 2 },
      { codigo: "A2.1", objetivoCodigo: "O2", nombre: "Estructurar el modelo", semanaInicio: 3, semanaFin: 4 },
    ],
    entregables: [
      { codigo: "E1.1.1", actividadCodigo: "A1.1", descripcion: "Memorias", cantidadMeta: "2.00", unidad: "memorias" },
      { codigo: "E1.1.2", actividadCodigo: "A1.1", descripcion: "Informe", cantidadMeta: "1.50", unidad: "informe" },
      { codigo: "E2.1.1", actividadCodigo: "A2.1", descripcion: "Modelos", cantidadMeta: "2.00", unidad: "modelos" },
    ],
  },
  reemplaza: { objetivos: 1, actividades: 4, entregables: 7, indicadores: 2 },
}

const ERRORES = [
  {
    hoja: "Ejemplo1",
    fila: null,
    columna: null,
    mensaje: "La hoja «Ejemplo1» no tiene la columna «Cantidad»: agrégala con la cantidad de cada entregable.",
  },
  { hoja: "Ejemplo1", fila: 5, columna: "D", mensaje: "La semana de inicio debe ser un número entero." },
]

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

function xlsx(nombre = "proyecto.xlsx", bytes = 10) {
  return new File([new Uint8Array(bytes)], nombre, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
}

describe("EstructuraPOImportDialog", () => {
  const fetchMock = vi.fn()
  let queryClient: QueryClient

  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }

  async function abrir(opciones: Parameters<typeof userEvent.setup>[0] = {}) {
    const user = userEvent.setup(opciones)
    render(<EstructuraPOImportDialog proyectoId="p1" />, { wrapper })
    await user.click(screen.getByRole("button", { name: "Importar estructura (formato PO)" }))
    return { user, dialogo: await screen.findByRole("dialog") }
  }

  async function validar(user: ReturnType<typeof userEvent.setup>, dialogo: HTMLElement, archivo = xlsx()) {
    await user.upload(within(dialogo).getByLabelText(/Archivo de la estructura/), archivo)
    await user.click(within(dialogo).getByRole("button", { name: "Validar" }))
  }

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    toast.error.mockReset()
    toast.success.mockReset()
  })

  it("rejects a file that is not .xlsx before calling the API", async () => {
    const { user, dialogo } = await abrir({ applyAccept: false })
    await user.upload(within(dialogo).getByLabelText(/Archivo de la estructura/), xlsx("proyecto.csv"))
    expect(within(dialogo).getByText("Solo se acepta el archivo en formato Excel (.xlsx).")).toBeInTheDocument()
    expect(within(dialogo).getByRole("button", { name: "Validar" })).toBeDisabled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("validates and previews the plan with its generated codes and what it replaces", async () => {
    fetchMock.mockResolvedValue(jsonResponse(PREVIEW))
    const { user, dialogo } = await abrir()
    await validar(user, dialogo)

    expect(await within(dialogo).findByText(/El archivo es válido: 2 objetivos, 2 actividades, 3 entregables y 1 indicador\./)).toBeInTheDocument()
    const tabla = within(dialogo).getByRole("table")
    expect(within(tabla).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Código", "Descripción", "Detalle"])
    const filas = within(tabla).getAllByRole("row").slice(1).map((fila) => within(fila).getAllByRole("cell").map((c) => c.textContent))
    expect(filas).toEqual([
      ["O1", "Formalizar las unidades productivas.", "Objetivo"],
      ["IND-01", "Asociaciones constituidas", "Meta 2"],
      ["A1.1", "Levantar línea base", "Semanas 1–2"],
      ["E1.1.1", "Memorias", "2 memorias"],
      ["E1.1.2", "Informe", "1,5 informe"],
      ["O2", "Desarrollar el modelo de negocio.", "Objetivo"],
      ["A2.1", "Estructurar el modelo", "Semanas 3–4"],
      ["E2.1.1", "Modelos", "2 modelos"],
    ])
    expect(within(dialogo).getByTestId("estructura-po-reemplaza")).toHaveTextContent(
      "Reemplaza la estructura actual (1 objetivo, 4 actividades, 7 entregables y 2 indicadores). El presupuesto no cambia.",
    )

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("/api/v1/projects/p1/structure/import")
    expect((init.body as FormData).get("modo")).toBe("validar")
    expect(within(dialogo).getByRole("button", { name: "Confirmar importación" })).toBeEnabled()
  })

  it("confirms the import, closes the dialog and announces it", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(PREVIEW))
      .mockResolvedValueOnce(
        jsonResponse({ importado: true, lote_id: "l1", resumen: { objetivos: 2, actividades: 2, entregables: 3, indicadores: 1 } }),
      )
    const { user, dialogo } = await abrir()
    await validar(user, dialogo)
    await user.click(await within(dialogo).findByRole("button", { name: "Confirmar importación" }))

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(toast.success).toHaveBeenCalledWith("Estructura importada.")
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect((init.body as FormData).get("modo")).toBeNull()
  })

  it("lists every error with its sheet, row and column and offers no confirmation", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: "El archivo tiene errores. Corrígelos y vuelve a subirlo.", code: "VALIDATION_ERROR", reporte: { errores: ERRORES } }, 400),
    )
    const { user, dialogo } = await abrir()
    await validar(user, dialogo)

    const errores = await within(dialogo).findByTestId("estructura-po-errores")
    expect(within(errores).getByRole("alert")).toHaveTextContent("El archivo tiene 2 errores. No se importó nada")
    const filas = within(errores).getAllByRole("row").slice(1).map((fila) => within(fila).getAllByRole("cell").map((c) => c.textContent))
    expect(filas).toEqual([
      ["Ejemplo1", "—", "La hoja «Ejemplo1» no tiene la columna «Cantidad»: agrégala con la cantidad de cada entregable."],
      ["Ejemplo1", "D5", "La semana de inicio debe ser un número entero."],
    ])
    expect(within(dialogo).queryByRole("button", { name: "Confirmar importación" })).not.toBeInTheDocument()
  })

  it("shows any other API error inline", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: "Solo se puede importar la estructura en un proyecto en Borrador.", code: "INVALID_STATE" }, 409),
    )
    const { user, dialogo } = await abrir()
    await validar(user, dialogo)
    expect(await within(dialogo).findByText("Solo se puede importar la estructura en un proyecto en Borrador.")).toBeInTheDocument()
  })
})
