// Thin dialog wrapper around the ficha content (removed once the list opens the page in a new tab).

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ProjectFichaDialog } from "./project-ficha-dialog"

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

describe("ProjectFichaDialog", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("wraps the ficha content in a dialog without a back link", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ error: "El proyecto no existe.", code: "NOT_FOUND" }, 404)),
    )

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ProjectFichaDialog projectId="p1" onClose={vi.fn()} />
      </QueryClientProvider>,
    )

    expect(await screen.findByRole("dialog")).toBeInTheDocument()
    expect(await screen.findByRole("heading", { name: "Proyecto no encontrado" })).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /Volver a proyectos/ })).not.toBeInTheDocument()
  })
})
