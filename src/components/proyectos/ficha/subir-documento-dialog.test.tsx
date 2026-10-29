// «Subir documento» dialog of the Documentos tab: a project-origin document as a file (sign ->
// upload -> confirm) or as an https link with a name. Real mutation hooks; only `fetch` is mocked.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SubirDocumentoDialog } from "./subir-documento-dialog"

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

const SIGNED = {
  storage_path: "proyectos/p1/soportes/u_contrato.pdf",
  token: "tok",
  signed_url: "https://storage.example/up",
  max_bytes: 10,
  allowed_extensions: ["pdf"],
}

describe("SubirDocumentoDialog", () => {
  const fetchMock = vi.fn()
  const onOpenChange = vi.fn()

  function setup() {
    return render(<SubirDocumentoDialog projectId="p1" open onOpenChange={onOpenChange} />, { wrapper: createWrapper() })
  }

  beforeEach(() => {
    fetchMock.mockReset()
    onOpenChange.mockReset()
    fetchMock.mockImplementation((input: unknown) => {
      const url = String(input)
      if (url.endsWith("/supports/sign")) return Promise.resolve(jsonResponse(SIGNED))
      if (url === SIGNED.signed_url) return Promise.resolve(new Response(null, { status: 200 }))
      return Promise.resolve(jsonResponse({ soporte: { id: "d1" } }, 201))
    })
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it("uploads a file through sign, storage and confirm, then closes", async () => {
    const user = userEvent.setup()
    setup()

    expect(screen.getByRole("heading", { name: "Subir documento" })).toBeInTheDocument()
    await user.upload(screen.getByLabelText("Archivo"), new File(["%PDF"], "contrato.pdf", { type: "application/pdf" }))
    await user.click(screen.getByRole("button", { name: "Subir documento" }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      "/api/v1/projects/p1/supports/sign",
      SIGNED.signed_url,
      "/api/v1/projects/p1/supports",
    ])
  })

  it("stores a link with its name", async () => {
    const user = userEvent.setup()
    setup()

    await user.click(screen.getByRole("radio", { name: "Enlace" }))
    await user.type(screen.getByLabelText("URL"), "https://drive.example/acta")
    await user.type(screen.getByLabelText("Nombre del enlace"), "Acta de inicio")
    await user.click(screen.getByRole("button", { name: "Subir documento" }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({
      url_externa: "https://drive.example/acta",
      nombre: "Acta de inicio",
    })
  })

  it("asks for the missing file or link before calling the API", async () => {
    const user = userEvent.setup()
    setup()

    await user.click(screen.getByRole("button", { name: "Subir documento" }))
    expect(screen.getByRole("alert")).toHaveTextContent("Selecciona el archivo.")

    await user.click(screen.getByRole("radio", { name: "Enlace" }))
    await user.type(screen.getByLabelText("URL"), "https://drive.example/acta")
    await user.click(screen.getByRole("button", { name: "Subir documento" }))
    expect(screen.getByRole("alert")).toHaveTextContent("Completa el enlace y su nombre.")

    expect(fetchMock).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it("shows the API error inline and stays open", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ error: "El enlace debe ser una URL https válida (máximo 2000 caracteres)." }, 400)),
    )
    const user = userEvent.setup()
    setup()

    await user.click(screen.getByRole("radio", { name: "Enlace" }))
    await user.type(screen.getByLabelText("URL"), "https://drive.example/acta")
    await user.type(screen.getByLabelText("Nombre del enlace"), "Acta")
    await user.click(screen.getByRole("button", { name: "Subir documento" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("El enlace debe ser una URL https válida")
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it("locks Cancelar while the upload is in flight, like the other project dialogs", async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}))
    const user = userEvent.setup()
    setup()

    await user.click(screen.getByRole("radio", { name: "Enlace" }))
    await user.type(screen.getByLabelText("URL"), "https://drive.example/acta")
    await user.type(screen.getByLabelText("Nombre del enlace"), "Acta")
    await user.click(screen.getByRole("button", { name: "Subir documento" }))

    expect(await screen.findByRole("button", { name: "Subiendo…" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled()
  })

  it("closes on Cancelar without calling the API", async () => {
    const user = userEvent.setup()
    setup()

    await user.click(screen.getByRole("button", { name: "Cancelar" }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
