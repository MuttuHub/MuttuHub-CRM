// Hooks de la importación del presupuesto en el formato de la PO (P3): la
// mutación es real y solo se burlan `fetch`, `sonner` y la descarga del navegador.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/lib/api/http"
import {
  BudgetImportReportError,
  downloadBudgetTemplate,
  projectQueryKeys,
  useImportBudget,
} from "./projects"

const { toast } = vi.hoisted(() => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock("sonner", () => ({ toast }))

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

const PREVIEW = {
  importado: false,
  valido: true,
  rubros: [
    { rubro_id: "r1", codigo: "R01", nombre: "Personal", actual: "0.00", nuevo: "1000.00", diferencia: "1000.00", en_archivo: true },
  ],
  suma_actual: "0.00",
  suma_nueva: "1000.00",
  valor_total: "2000.00",
  diferencia: "-1000.00",
  cambios: 1,
}

const archivo = () => new File([new Uint8Array(4)], "presupuesto.xlsx")

describe("useImportBudget", () => {
  const fetchMock = vi.fn()
  let queryClient: QueryClient

  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    fetchMock.mockReset()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it("validates with a multipart POST (archivo + modo=validar) and refreshes nothing", async () => {
    fetchMock.mockResolvedValue(jsonResponse(PREVIEW))
    const invalidate = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useImportBudget("p1"), { wrapper })

    let data: unknown
    await act(async () => {
      data = await result.current.mutateAsync({ archivo: archivo(), validar: true })
    })

    expect(data).toEqual(PREVIEW)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("/api/v1/projects/p1/budget/import")
    expect(init.method).toBe("POST")
    const form = init.body as FormData
    expect(form.get("archivo")).toBeInstanceOf(File)
    expect(form.get("modo")).toBe("validar")
    expect(invalidate).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it("applies without modo and invalidates the budget queries", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ importado: true, cambios: 1, presupuesto: {} }))
    const invalidate = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useImportBudget("p1"), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ archivo: archivo(), validar: false })
    })

    const form = (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as FormData
    expect(form.get("modo")).toBeNull()
    const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey)
    expect(keys).toContainEqual(projectQueryKeys.budget("p1"))
    expect(keys).toContainEqual(projectQueryKeys.programming("p1"))
    expect(keys).toContainEqual(["projects", "financial-sheet", "p1"])
    expect(toast.success).toHaveBeenCalledWith("Presupuesto importado.")
  })

  it("turns the 400 with the report into BudgetImportReportError", async () => {
    const errores = [{ fila: 3, rubro: "Material POP", mensaje: "No encontramos el rubro." }]
    fetchMock.mockResolvedValue(jsonResponse({ error: "El archivo tiene errores.", code: "VALIDATION_ERROR", reporte: { errores } }, 400))
    const { result } = renderHook(() => useImportBudget("p1"), { wrapper })

    let error: unknown
    await act(async () => {
      error = await result.current.mutateAsync({ archivo: archivo(), validar: true }).catch((e: unknown) => e)
    })
    expect(error).toBeInstanceOf(BudgetImportReportError)
    expect((error as BudgetImportReportError).errores).toEqual(errores)
  })

  it("keeps any other failure as ApiError with its status", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "Solo en borrador.", code: "INVALID_STATE" }, 409))
    const { result } = renderHook(() => useImportBudget("p1"), { wrapper })

    let error: unknown
    await act(async () => {
      error = await result.current.mutateAsync({ archivo: archivo(), validar: false }).catch((e: unknown) => e)
    })
    expect(error).toBeInstanceOf(ApiError)
    expect(error).not.toBeInstanceOf(BudgetImportReportError)
    expect((error as ApiError).status).toBe(409)
  })
})

describe("downloadBudgetTemplate", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("downloads the blank template with the server's file name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(new Blob(["xlsx"]), { headers: { "Content-Disposition": 'attachment; filename="plantilla-presupuesto.xlsx"' } }),
      ),
    )
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:mock", revokeObjectURL: vi.fn() })
    const clicked: HTMLAnchorElement[] = []
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this)
    })

    await downloadBudgetTemplate("p1")

    expect(fetch).toHaveBeenCalledWith("/api/v1/projects/p1/budget/template", { method: "GET" })
    expect(clicked.map((a) => a.download)).toEqual(["plantilla-presupuesto.xlsx"])
  })

  it("throws the server's message when the download fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "No tienes permisos sobre este proyecto.", code: "FORBIDDEN" }, 403)))
    await expect(downloadBudgetTemplate("p1")).rejects.toThrow("No tienes permisos sobre este proyecto.")
  })
})
