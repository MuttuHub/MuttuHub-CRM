// B8 (S2): adjuntar un soporte a un gasto existente. Las mutaciones son reales; solo `fetch`.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SIN_SOPORTE_TEXT } from "./gasto-form"
import { AdjuntarSoporte } from "./gasto-soportes"

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
  wrapper.displayName = "QueryClientTestWrapper"
  return wrapper
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

describe("AdjuntarSoporte", () => {
  const fetchMock = vi.fn()

  function setup(attachStatus = 201, attachBody: unknown = { gasto: { id: "g1" } }) {
    fetchMock.mockImplementation((input: unknown) => {
      const url = String(input)
      if (url.endsWith("/expenses/sign")) {
        return Promise.resolve(
          jsonResponse({ storage_path: "proyectos/p1/soportes/u_f.pdf", token: "t", signed_url: "https://s.example/up", max_bytes: 10, allowed_extensions: ["pdf"] }),
        )
      }
      if (url === "https://s.example/up") return Promise.resolve(new Response(null, { status: 200 }))
      if (url.endsWith("/expenses/g1/attachments")) return Promise.resolve(jsonResponse(attachBody, attachStatus))
      return Promise.resolve(jsonResponse({}))
    })
    return render(<AdjuntarSoporte projectId="p1" gastoId="g1" />, { wrapper: createWrapper() })
  }

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("shows only the button until it is opened, and Cancelar closes the form", async () => {
    const user = userEvent.setup()
    setup()
    expect(screen.queryByRole("form", { name: "Adjuntar soporte" })).toBeNull()
    await user.click(screen.getByRole("button", { name: "Adjuntar soporte" }))
    expect(screen.getByRole("form", { name: "Adjuntar soporte" })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Cancelar" }))
    expect(screen.queryByRole("form", { name: "Adjuntar soporte" })).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("asks for a support before sending anything", async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole("button", { name: "Adjuntar soporte" }))
    await user.click(screen.getByRole("button", { name: "Adjuntar" }))
    expect(screen.getByRole("alert")).toHaveTextContent(SIN_SOPORTE_TEXT)
    await user.click(screen.getByRole("radio", { name: "Enlace" }))
    await user.type(screen.getByLabelText("URL"), "https://drive.example.com/f/1")
    await user.click(screen.getByRole("button", { name: "Adjuntar" }))
    expect(screen.getByRole("alert")).toHaveTextContent(SIN_SOPORTE_TEXT)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("attaches a link with one POST to the expense attachments and closes the form", async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole("button", { name: "Adjuntar soporte" }))
    await user.click(screen.getByRole("radio", { name: "Enlace" }))
    await user.type(screen.getByLabelText("URL"), "https://drive.example.com/f/1")
    await user.type(screen.getByLabelText("Nombre del enlace"), "Carpeta")
    await user.click(screen.getByRole("button", { name: "Adjuntar" }))

    await waitFor(() => expect(screen.queryByRole("form", { name: "Adjuntar soporte" })).toBeNull())
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("/api/v1/projects/p1/expenses/g1/attachments")
    expect(JSON.parse(init.body as string)).toEqual({ url_externa: "https://drive.example.com/f/1", nombre: "Carpeta" })
  })

  it("signs, uploads and confirms a file", async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole("button", { name: "Adjuntar soporte" }))
    await user.upload(screen.getByLabelText("Archivo del soporte"), new File([new Uint8Array(4)], "factura.pdf", { type: "application/pdf" }))
    await user.click(screen.getByRole("button", { name: "Adjuntar" }))

    await waitFor(() => expect(screen.queryByRole("form", { name: "Adjuntar soporte" })).toBeNull())
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "/api/v1/projects/p1/expenses/sign",
      "https://s.example/up",
      "/api/v1/projects/p1/expenses/g1/attachments",
    ])
  })

  it("shows the server error inline and keeps the form open (for example the 5-support limit)", async () => {
    const user = userEvent.setup()
    setup(400, { error: "Puedes adjuntar máximo 5 soportes.", code: "VALIDATION_ERROR" })
    await user.click(screen.getByRole("button", { name: "Adjuntar soporte" }))
    await user.click(screen.getByRole("radio", { name: "Enlace" }))
    await user.type(screen.getByLabelText("URL"), "https://drive.example.com/f/1")
    await user.type(screen.getByLabelText("Nombre del enlace"), "Carpeta")
    await user.click(screen.getByRole("button", { name: "Adjuntar" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Puedes adjuntar máximo 5 soportes.")
    expect(screen.getByRole("form", { name: "Adjuntar soporte" })).toBeInTheDocument()
  })
})
