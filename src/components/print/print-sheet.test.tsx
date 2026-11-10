// Shared print sheet (PR-R2, R9): every /print/* view uses one sheet with a letter page, exact colors, a
// repeated header (logo, report title, classification) and footer (who generated it and when, page number),
// rows that don't split, and auto-print only once the data is ready and the fonts have loaded.

import { act, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PrintSheet } from "./print-sheet"

const apiGet = vi.fn()
vi.mock("@/lib/api/http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/http")>()),
  apiGet: (...args: unknown[]) => apiGet(...args),
}))

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function stubFonts(ready: Promise<unknown>) {
  Object.defineProperty(document, "fonts", { configurable: true, value: { ready } })
}

const toolbar = { description: "Vista de impresión.", fallbackHref: "/reportes" }

describe("PrintSheet", () => {
  let print: ReturnType<typeof vi.fn>

  beforeEach(() => {
    print = vi.fn()
    vi.stubGlobal("print", print)
    apiGet.mockReturnValue(new Promise(() => {}))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    // @ts-expect-error -- remove the per-test stub so jsdom's default (no FontFaceSet) comes back
    delete document.fonts
  })

  it("renders the header (logo, classification) and footer (report title, generated-by line, note)", () => {
    render(
      <PrintSheet title="Tareas del equipo" toolbar={toolbar} ready generatedBy="Mariana Ortiz">
        <p>contenido del reporte</p>
      </PrintSheet>,
    )

    const header = screen.getByTestId("print-sheet-header")
    expect(header).toContainElement(screen.getByRole("img", { name: "Muttu Innovación Social" }))
    expect(header).toHaveTextContent("Interno · Gerencia")

    const footer = screen.getByTestId("print-sheet-footer")
    expect(footer).toHaveTextContent("Muttu Hub · Tareas del equipo")
    expect(footer).toHaveTextContent("Uso interno de Muttu · no compartir fuera de la organización")
    expect(footer).toHaveTextContent(/Generado el .+ por Mariana Ortiz/)

    expect(screen.getByText("contenido del reporte")).toBeInTheDocument()
    expect(screen.getByTestId("imprimir-barra")).toHaveClass("print-hide")
  })

  it("labels a personal report with the person's name and its own note", () => {
    render(
      <PrintSheet
        title="Mi resumen"
        classification="personal"
        toolbar={toolbar}
        ready={false}
        generatedBy="Camila Pérez"
      >
        <p>x</p>
      </PrintSheet>,
    )

    expect(screen.getByTestId("print-sheet-header")).toHaveTextContent("Personal · Camila Pérez")
    expect(screen.getByTestId("print-sheet-footer")).toHaveTextContent("Solo para la persona indicada")
  })

  it("fetches who is generating the report when it isn't given", async () => {
    apiGet.mockResolvedValue({ usuario: { id: "u1", nombre: "Mariana Ortiz", rol: "admin" } })
    render(
      <PrintSheet title="Reporte semanal" toolbar={toolbar} ready>
        <p>x</p>
      </PrintSheet>,
    )

    expect(apiGet).toHaveBeenCalledWith("/api/v1/auth/me")
    await waitFor(() =>
      expect(screen.getByTestId("print-sheet-footer")).toHaveTextContent("por Mariana Ortiz"),
    )
  })

  it("prints only after the data is ready and document.fonts.ready resolves", async () => {
    const fonts = deferred()
    stubFonts(fonts.promise)
    const { rerender } = render(
      <PrintSheet title="T" toolbar={toolbar} ready={false} generatedBy="Ana">
        <p>x</p>
      </PrintSheet>,
    )
    await act(async () => {})
    expect(print).not.toHaveBeenCalled()

    rerender(
      <PrintSheet title="T" toolbar={toolbar} ready generatedBy="Ana">
        <p>x</p>
      </PrintSheet>,
    )
    await act(async () => {})
    expect(print).not.toHaveBeenCalled()

    await act(async () => {
      fonts.resolve()
      await fonts.promise
    })
    expect(print).toHaveBeenCalledTimes(1)
  })

  it("waits for the generated-by lookup before printing, so the name is on paper", async () => {
    stubFonts(Promise.resolve())
    let resolveMe!: (v: unknown) => void
    apiGet.mockReturnValue(new Promise((r) => (resolveMe = r)))
    render(
      <PrintSheet title="T" toolbar={toolbar} ready>
        <p>x</p>
      </PrintSheet>,
    )
    await act(async () => {})
    expect(print).not.toHaveBeenCalled()

    await act(async () => {
      resolveMe({ usuario: { id: "u1", nombre: "Ana", rol: "admin" } })
    })
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1))
  })

  it("does not print if it unmounts before the fonts are ready", async () => {
    const fonts = deferred()
    stubFonts(fonts.promise)
    const { unmount } = render(
      <PrintSheet title="T" toolbar={toolbar} ready generatedBy="Ana">
        <p>x</p>
      </PrintSheet>,
    )
    unmount()
    await act(async () => {
      fonts.resolve()
      await fonts.promise
    })
    expect(print).not.toHaveBeenCalled()
  })

  it("ships the print rules: letter page, page numbers, exact colors, repeated header/footer, unbroken rows", () => {
    const { container } = render(
      <PrintSheet title="T" toolbar={toolbar} ready={false} generatedBy="Ana">
        <p>x</p>
      </PrintSheet>,
    )
    const css = container.querySelector("style")?.textContent ?? ""
    expect(css).toMatch(/@page\s*{[^}]*size:\s*letter/)
    expect(css).toContain('"Página " counter(page) " de " counter(pages)')
    expect(css).toContain("print-color-adjust: exact")
    expect(css).toContain("-webkit-print-color-adjust: exact")
    // Chromium repeats @page margin boxes on every page; table-header-group / table-footer-group
    // do not repeat when the break falls inside a single anonymous row, and a fixed element
    // repeats but paints over the body.
    expect(css).toMatch(/@top-left\s*{[^}]*content:/)
    expect(css).toMatch(/@top-right\s*{[^}]*content:/)
    expect(css).toMatch(/@bottom-left\s*{[^}]*content:/)
    expect(css).toMatch(/@bottom-center\s*{[^}]*content:/)
    expect(css).toContain("table-header-group")
    expect(css).toMatch(/tr,\s*\.print-sheet li\s*{[^}]*break-inside:\s*avoid/)
  })
})
