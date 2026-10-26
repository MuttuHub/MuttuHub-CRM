// Hooks of the expenses import (B8): attach a support to an existing expense (S2) and, below, the
// workbook import. The mutations are real; only `fetch` and `sonner` are mocked.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/lib/api/http"
import {
  ExpensesImportReportError,
  downloadExpensesTemplate,
  useAttachExpenseSupport,
  useImportExpenses,
} from "./projects"

const { toast } = vi.hoisted(() => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock("sonner", () => ({ toast }))

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

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

const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string)

describe("useAttachExpenseSupport", () => {
  it("posts a link straight to the expense attachments and refreshes the expenses", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ gasto: { id: "g1" } }, 201))
    const invalidate = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useAttachExpenseSupport("p1"), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ id: "g1", soporte: { tipo: "enlace", url_externa: "https://drive.example.com/f/1", nombre: "Carpeta" } })
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("/api/v1/projects/p1/expenses/g1/attachments")
    expect(init.method).toBe("POST")
    expect(bodyOf(fetchMock.mock.calls[0])).toEqual({ url_externa: "https://drive.example.com/f/1", nombre: "Carpeta" })
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toContainEqual(["projects", "expenses"])
  })

  it("signs, uploads the file and then confirms it (sign -> PUT -> attachments)", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ storage_path: "proyectos/p1/soportes/k_f.pdf", token: "t", signed_url: "https://storage.example.com/up", max_bytes: 1, allowed_extensions: [] }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(jsonResponse({ gasto: { id: "g1" } }, 201))
    const { result } = renderHook(() => useAttachExpenseSupport("p1"), { wrapper })
    const file = new File([new Uint8Array(8)], "factura.pdf", { type: "application/pdf" })

    await act(async () => {
      await result.current.mutateAsync({ id: "g1", soporte: { tipo: "archivo", file } })
    })

    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      "/api/v1/projects/p1/expenses/sign",
      "https://storage.example.com/up",
      "/api/v1/projects/p1/expenses/g1/attachments",
    ])
    expect(bodyOf(fetchMock.mock.calls[0])).toEqual({ nombre: "factura.pdf", tamano_bytes: 8, tipo_mime: "application/pdf" })
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[1].method).toBe("PUT")
    expect(bodyOf(fetchMock.mock.calls[2])).toEqual({
      storage_path: "proyectos/p1/soportes/k_f.pdf",
      nombre: "factura.pdf",
      tamano_bytes: 8,
      tipo_mime: "application/pdf",
    })
  })

  it("does not confirm anything when the upload fails and keeps the server error", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ storage_path: "k", token: "t", signed_url: "https://storage.example.com/up", max_bytes: 1, allowed_extensions: [] }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
    const { result } = renderHook(() => useAttachExpenseSupport("p1"), { wrapper })

    let error: unknown
    await act(async () => {
      error = await result.current
        .mutateAsync({ id: "g1", soporte: { tipo: "archivo", file: new File([new Uint8Array(1)], "a.pdf") } })
        .catch((e: unknown) => e)
    })
    expect(error).toBeInstanceOf(ApiError)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("rethrows the API error of the attach (for example the 5-support limit) without a toast", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "Puedes adjuntar máximo 5 soportes.", code: "VALIDATION_ERROR" }, 400))
    const { result } = renderHook(() => useAttachExpenseSupport("p1"), { wrapper })

    let error: unknown
    await act(async () => {
      error = await result.current
        .mutateAsync({ id: "g1", soporte: { tipo: "enlace", url_externa: "https://x.co", nombre: "x" } })
        .catch((e: unknown) => e)
    })
    expect((error as ApiError).message).toBe("Puedes adjuntar máximo 5 soportes.")
    expect((error as ApiError).status).toBe(400)
    expect(toast.error).not.toHaveBeenCalled()
  })
})

const PREVIEW = {
  importado: false,
  resumen: { total: 2, validas: 1, invalidas: 1, valor_validas: "1500000.50" },
  filas: [
    { fila: 2, rubro: "Transporte", tercero: "Proveedor SAS", numero_documento: "FE-1", valor: "1500000.50", periodo: "2026-10", valida: true, mensaje: null, alertas: [] },
    { fila: 3, rubro: "Inventado", tercero: null, numero_documento: null, valor: null, periodo: null, valida: false, mensaje: "No encontramos el rubro.", alertas: [] },
  ],
}
const archivo = () => new File([new Uint8Array(4)], "gastos.xlsx")

describe("useImportExpenses", () => {
  it("validates with a multipart POST (archivo + modo=validar) and refreshes nothing", async () => {
    fetchMock.mockResolvedValue(jsonResponse(PREVIEW))
    const invalidate = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useImportExpenses("p1"), { wrapper })

    let data: unknown
    await act(async () => {
      data = await result.current.mutateAsync({ archivo: archivo(), validar: true })
    })

    expect(data).toEqual(PREVIEW)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("/api/v1/projects/p1/expenses/import")
    expect(init.method).toBe("POST")
    const form = init.body as FormData
    expect(form.get("archivo")).toBeInstanceOf(File)
    expect(form.get("modo")).toBe("validar")
    expect(invalidate).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it("applies without modo, refreshes the expenses and announces how many were created", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ importado: true, creados: 2, lote_id: "l1", valor_total: "10.00", gastos: [], rechazadas: [], alertas: [] }),
    )
    const invalidate = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useImportExpenses("p1"), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ archivo: archivo(), validar: false })
    })

    const form = (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as FormData
    expect(form.get("modo")).toBeNull()
    const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey)
    expect(keys).toContainEqual(["projects", "expenses"])
    expect(keys).toContainEqual(["projects", "financial-sheet"])
    expect(toast.success).toHaveBeenCalledWith("2 gastos importados.")
  })

  it("turns the 400 with the report into ExpensesImportReportError", async () => {
    const errores = [{ fila: null, rubro: null, mensaje: "Faltan las columnas obligatorias." }]
    fetchMock.mockResolvedValue(jsonResponse({ error: "El archivo tiene errores.", code: "VALIDATION_ERROR", reporte: { errores } }, 400))
    const { result } = renderHook(() => useImportExpenses("p1"), { wrapper })

    let error: unknown
    await act(async () => {
      error = await result.current.mutateAsync({ archivo: archivo(), validar: true }).catch((e: unknown) => e)
    })
    expect(error).toBeInstanceOf(ExpensesImportReportError)
    expect((error as ExpensesImportReportError).errores).toEqual(errores)
  })

  it("keeps any other failure as ApiError with its status", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "Solo en ejecución.", code: "INVALID_STATE" }, 409))
    const { result } = renderHook(() => useImportExpenses("p1"), { wrapper })

    let error: unknown
    await act(async () => {
      error = await result.current.mutateAsync({ archivo: archivo(), validar: false }).catch((e: unknown) => e)
    })
    expect(error).toBeInstanceOf(ApiError)
    expect(error).not.toBeInstanceOf(ExpensesImportReportError)
    expect((error as ApiError).status).toBe(409)
  })
})

describe("downloadExpensesTemplate", () => {
  it("downloads the template with the server's file name", async () => {
    fetchMock.mockResolvedValue(
      new Response(new Blob(["xlsx"]), { headers: { "Content-Disposition": 'attachment; filename="plantilla-gastos.xlsx"' } }),
    )
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:mock", revokeObjectURL: vi.fn() })
    const clicked: HTMLAnchorElement[] = []
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this)
    })

    await downloadExpensesTemplate("p1")

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/expenses/template", { method: "GET" })
    expect(clicked.map((a) => a.download)).toEqual(["plantilla-gastos.xlsx"])
    vi.restoreAllMocks()
  })

  it("throws the server's message when the download fails", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "No tienes permisos sobre este proyecto.", code: "FORBIDDEN" }, 403))
    await expect(downloadExpensesTemplate("p1")).rejects.toThrow("No tienes permisos sobre este proyecto.")
  })
})
