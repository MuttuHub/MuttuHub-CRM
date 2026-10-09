// Importación de la plantilla Excel (S7 U6). Las queries y las mutaciones son
// reales; solo se burlan `fetch`, `sonner` y las APIs de descarga del navegador.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectListRow } from "@/hooks/projects"
import { ImportDialog } from "./import-dialog"

const { toast } = vi.hoisted(() => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock("sonner", () => ({ toast }))

const PROYECTO: ProjectListRow = {
  id: "p1",
  codigo: "PRY-2026-001",
  nombre: "Fortalecimiento",
  estado: "BORRADOR",
  origen: "INDEPENDIENTE",
  cliente: { id: "c1", nombre: "Alcaldía" },
  responsable: null,
  fecha_inicio: "2026-10-05",
  fecha_fin: "2027-01-29",
  duracion_semanas: 17,
  valor_total: null,
  diferencia_valor_oportunidad: null,
  alertas: [],
  beneficiarios_meta: null,
  lineas: [],
  municipios: [],
}

const RESUMEN = { objetivos: 1, actividades: 4, entregables: 7, indicadores: 2, rubros: 8, celdas_programacion: 32 }
const REEMPLAZA = { objetivos: 2, actividades: 3, entregables: 4, indicadores: 1 }
const ADVERTENCIA = {
  regla: "W-01",
  hoja: "4. Actividades",
  fila: 2,
  columna: "F",
  valor: "nadie@x.co",
  mensaje: "No encontramos al responsable.",
}
const e = (regla: string, hoja: string, fila: number | null, mensaje: string, valor: string | null = null) => ({
  regla,
  hoja,
  fila,
  columna: fila === null ? null : "D",
  valor,
  mensaje,
})
const REPORTE = {
  errores: [
    e("V-07", "4. Actividades", 5, "La semana fin supera la duración.", "19"),
    e("V-05", "4. Actividades", 3, "Código duplicado."),
    e("V-12", "7. Presupuesto", null, "La suma no coincide con el valor total."),
  ],
  advertencias: [],
  resumen: { "V-07": 1, "V-05": 1, "V-12": 1 },
  truncado: false,
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

function xlsx(nombre = "plantilla.xlsx", bytes = 10) {
  return new File([new Uint8Array(bytes)], nombre, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
}

describe("ImportDialog", () => {
  const fetchMock = vi.fn()
  let queryClient: QueryClient
  let clicked: HTMLAnchorElement[]
  let blobs: Blob[]

  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }

  function postCalls() {
    return fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")
  }

  /** `respuestas`: una por POST, en orden (validar, luego importar). */
  function setup(respuestas: Response[] = []) {
    const cola = [...respuestas]
    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith("/template")) {
        return Promise.resolve(
          new Response(new Uint8Array([1, 2, 3]), {
            status: 200,
            headers: {
              "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              "Content-Disposition": 'attachment; filename="PRY-2026-001-plantilla.xlsx"',
            },
          }),
        )
      }
      if (url.endsWith("/import") && init?.method === "POST") {
        return Promise.resolve(cola.shift() ?? jsonResponse({ importado: false }))
      }
      return Promise.resolve(jsonResponse({}))
    })
    return render(<ImportDialog proyecto={PROYECTO} />, { wrapper })
  }

  async function abrirYElegir(user: ReturnType<typeof userEvent.setup>, archivo: File) {
    await user.click(screen.getByRole("button", { name: /importar plantilla/i }))
    const dialogo = await screen.findByRole("dialog")
    await user.upload(within(dialogo).getByLabelText(/archivo de la plantilla/i), archivo)
    return dialogo
  }

  beforeEach(() => {
    fetchMock.mockReset()
    toast.error.mockReset()
    toast.success.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    clicked = []
    blobs = []
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: (blob: Blob) => {
        blobs.push(blob)
        return "blob:mock"
      },
      revokeObjectURL: vi.fn(),
    })
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this)
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe("download", () => {
    it("downloads the template named by the server", async () => {
      const user = userEvent.setup()
      setup()

      await user.click(screen.getByRole("button", { name: /descargar plantilla/i }))

      await waitFor(() => expect(clicked).toHaveLength(1))
      expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/template", expect.any(Object))
      expect(clicked[0]?.download).toBe("PRY-2026-001-plantilla.xlsx")
      expect(blobs).toHaveLength(1)
    })

    it("toasts the server message when the download is refused", async () => {
      const user = userEvent.setup()
      fetchMock.mockResolvedValue(
        jsonResponse({ error: "Define las fechas del proyecto antes de descargar la plantilla.", code: "INVALID_STATE" }, 409),
      )
      render(<ImportDialog proyecto={PROYECTO} />, { wrapper })

      await user.click(screen.getByRole("button", { name: /descargar plantilla/i }))

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith("Define las fechas del proyecto antes de descargar la plantilla."),
      )
      expect(clicked).toHaveLength(0)
    })
  })

  describe("file checks", () => {
    it("refuses a file above 4 MB without calling the API", async () => {
      const user = userEvent.setup()
      setup()
      const dialogo = await abrirYElegir(user, xlsx("grande.xlsx", 4 * 1024 * 1024 + 1))

      expect(within(dialogo).getByRole("alert")).toHaveTextContent("supera el límite de 4 MB")
      expect(within(dialogo).getByRole("button", { name: /validar plantilla/i })).toBeDisabled()
      expect(postCalls()).toHaveLength(0)
    })

    it("refuses a file that is not .xlsx", async () => {
      // `accept` already filters the picker; the check must hold when it does not.
      const user = userEvent.setup({ applyAccept: false })
      setup()
      const dialogo = await abrirYElegir(user, new File(["x"], "datos.csv", { type: "text/csv" }))

      expect(within(dialogo).getByRole("alert")).toHaveTextContent("formato Excel (.xlsx)")
      expect(within(dialogo).getByRole("button", { name: /validar plantilla/i })).toBeDisabled()
    })

    it("keeps Validar disabled until a file is chosen", async () => {
      const user = userEvent.setup()
      setup()
      await user.click(screen.getByRole("button", { name: /importar plantilla/i }))

      const dialogo = await screen.findByRole("dialog")
      expect(within(dialogo).getByRole("button", { name: /validar plantilla/i })).toBeDisabled()
    })
  })

  describe("validate then confirm", () => {
    it("validates in dry-run mode and shows the summary with what will be replaced", async () => {
      const user = userEvent.setup()
      setup([
        jsonResponse({ importado: false, valido: true, resumen: RESUMEN, reemplaza: REEMPLAZA, advertencias: [ADVERTENCIA] }),
      ])
      const dialogo = await abrirYElegir(user, xlsx())

      await user.click(within(dialogo).getByRole("button", { name: /validar plantilla/i }))

      const resumen = await within(dialogo).findByTestId("import-resumen")
      expect(resumen).toHaveTextContent("1 objetivo")
      expect(resumen).toHaveTextContent("4 actividades")
      expect(resumen).toHaveTextContent("7 entregables")
      expect(resumen).toHaveTextContent("2 indicadores")
      expect(resumen).toHaveTextContent("8 rubros con presupuesto")
      expect(resumen).toHaveTextContent("32 celdas de programación")
      expect(within(dialogo).getByTestId("import-reemplaza")).toHaveTextContent(
        "Se reemplazará: 2 objetivos, 3 actividades, 4 entregables y 1 indicador.",
      )
      expect(within(dialogo).getByTestId("import-advertencias")).toHaveTextContent("No encontramos al responsable.")

      const [url, init] = postCalls()[0] as [string, RequestInit]
      expect(url).toBe("/api/v1/projects/p1/import")
      const form = init.body as FormData
      expect(form.get("modo")).toBe("validar")
      expect((form.get("archivo") as File).name).toBe("plantilla.xlsx")
      // multipart: the browser sets the boundary, so no JSON content type is forced.
      expect(JSON.stringify(init.headers ?? {})).not.toMatch(/content-type/i)
    })

    it("confirms with a second POST that is not a dry run, then toasts, refreshes and closes", async () => {
      const user = userEvent.setup()
      setup([
        jsonResponse({ importado: false, valido: true, resumen: RESUMEN, reemplaza: REEMPLAZA, advertencias: [] }),
        jsonResponse({ importado: true, lote_id: "lote-1", resumen: RESUMEN, advertencias: [] }),
      ])
      const invalidate = vi.spyOn(queryClient, "invalidateQueries")
      const dialogo = await abrirYElegir(user, xlsx())
      await user.click(within(dialogo).getByRole("button", { name: /validar plantilla/i }))

      await user.click(await within(dialogo).findByRole("button", { name: /confirmar importación/i }))

      await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Plantilla importada."))
      const form = (postCalls()[1] as [string, RequestInit])[1].body as FormData
      expect(form.get("modo")).toBeNull()
      expect(postCalls()).toHaveLength(2)
      const keys = invalidate.mock.calls.map(([filtro]) => JSON.stringify((filtro as { queryKey: unknown }).queryKey))
      for (const parte of ["objectives", "activities", "deliverables", "indicators", "budget", "programming", "detail"]) {
        expect(keys.some((k) => k.includes(parte))).toBe(true)
      }
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    })

    it("shows the server message when the confirmation is refused (409)", async () => {
      const user = userEvent.setup()
      setup([
        jsonResponse({ importado: false, valido: true, resumen: RESUMEN, reemplaza: REEMPLAZA, advertencias: [] }),
        jsonResponse({ error: "Solo se puede importar una plantilla en un proyecto en Borrador.", code: "INVALID_STATE" }, 409),
      ])
      const dialogo = await abrirYElegir(user, xlsx())
      await user.click(within(dialogo).getByRole("button", { name: /validar plantilla/i }))

      await user.click(await within(dialogo).findByRole("button", { name: /confirmar importación/i }))

      expect(await within(dialogo).findByRole("alert")).toHaveTextContent("Solo se puede importar una plantilla")
      expect(toast.success).not.toHaveBeenCalled()
    })
  })

  describe("validation report", () => {
    async function validarConErrores(reporte = REPORTE) {
      const user = userEvent.setup()
      setup([jsonResponse({ error: "La plantilla tiene errores.", code: "VALIDATION_ERROR", reporte }, 400)])
      const dialogo = await abrirYElegir(user, xlsx())
      await user.click(within(dialogo).getByRole("button", { name: /validar plantilla/i }))
      await within(dialogo).findByTestId("import-errores")
      return { user, dialogo }
    }

    it("groups the errors by sheet in tables with rule, row, column, value and message", async () => {
      const { dialogo } = await validarConErrores()

      const grupos = within(dialogo).getAllByTestId("import-errores-hoja")
      expect(grupos).toHaveLength(2)
      expect(grupos[0]).toHaveTextContent("4. Actividades")
      expect(grupos[0]).toHaveTextContent("2 errores")
      expect(within(grupos[0] as HTMLElement).getAllByRole("row")).toHaveLength(3)
      expect(grupos[0]).toHaveTextContent("V-07")
      expect(grupos[0]).toHaveTextContent("La semana fin supera la duración.")
      expect(grupos[1]).toHaveTextContent("7. Presupuesto")
      expect(grupos[1]).toHaveTextContent("1 error")
      expect(within(dialogo).queryByRole("button", { name: /confirmar importación/i })).not.toBeInTheDocument()
    })

    it("tells the user when the list was truncated", async () => {
      const { dialogo } = await validarConErrores({ ...REPORTE, truncado: true })

      expect(within(dialogo).getByText(/primeros 500 errores/i)).toBeInTheDocument()
    })

    it("downloads the report as a CSV built in the browser", async () => {
      const { user, dialogo } = await validarConErrores()

      await user.click(within(dialogo).getByRole("button", { name: /descargar reporte/i }))

      expect(blobs).toHaveLength(1)
      expect(blobs[0]?.type).toContain("text/csv")
      const texto = await new Promise<string>((resolve) => {
        const lector = new FileReader()
        lector.onload = () => resolve(String(lector.result))
        lector.readAsText(blobs[0] as Blob)
      })
      expect(texto).toContain("Tipo;Regla;Hoja;Fila;Columna;Valor;Mensaje")
      expect(texto).toContain("V-12;7. Presupuesto")
      expect(clicked.at(-1)?.download).toBe("PRY-2026-001-reporte-importacion.csv")
    })

    it("picking another file clears the previous report", async () => {
      const { user, dialogo } = await validarConErrores()

      await user.upload(within(dialogo).getByLabelText(/archivo de la plantilla/i), xlsx("otra.xlsx"))

      expect(within(dialogo).queryByTestId("import-errores")).not.toBeInTheDocument()
    })
  })

  it("shows the generic server message for a non-report failure (413)", async () => {
    const user = userEvent.setup()
    setup([jsonResponse({ error: "El archivo supera el límite de 4 MB.", code: "FILE_TOO_LARGE" }, 413)])
    const dialogo = await abrirYElegir(user, xlsx())

    await user.click(within(dialogo).getByRole("button", { name: /validar plantilla/i }))

    expect(await within(dialogo).findByRole("alert")).toHaveTextContent("El archivo supera el límite de 4 MB.")
  })
})
