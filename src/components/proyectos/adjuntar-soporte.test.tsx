// Control genérico "Adjuntar archivo" (AJ-06, S6/S7), probado en aislamiento: no conoce al padre
// (gasto/avance/medición) — recibe una mutación ya acotada a `{ soporte }` y sus propios textos.

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { AdjuntarArchivoControl, type AdjuntarArchivoMutation } from "./adjuntar-soporte"

function mutation(overrides: Partial<AdjuntarArchivoMutation> = {}): AdjuntarArchivoMutation {
  return {
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
    reset: vi.fn(),
    ...overrides,
  }
}

describe("AdjuntarArchivoControl", () => {
  it("renders the 'Adjuntar archivo' button and opens a form named after it", async () => {
    const user = userEvent.setup()
    render(<AdjuntarArchivoControl adjuntar={mutation()} errorFallback="x" sinSoporteText="Falta soporte" />)
    expect(screen.getByRole("button", { name: "Adjuntar archivo" })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Adjuntar archivo" }))
    expect(screen.getByRole("form", { name: "Adjuntar archivo" })).toBeInTheDocument()
  })

  it("accepts a custom aria-label for the button and the form without changing the visible text", async () => {
    const user = userEvent.setup()
    render(
      <AdjuntarArchivoControl
        adjuntar={mutation()}
        errorFallback="x"
        sinSoporteText="Falta soporte"
        ariaLabel="Adjuntar medio al avance"
      />,
    )
    const boton = screen.getByRole("button", { name: "Adjuntar medio al avance" })
    expect(boton).toHaveTextContent("Adjuntar archivo")
    await user.click(boton)
    expect(screen.getByRole("form", { name: "Adjuntar medio al avance" })).toBeInTheDocument()
  })

  it("asks for a support before sending anything", async () => {
    const user = userEvent.setup()
    const adjuntar = mutation()
    render(<AdjuntarArchivoControl adjuntar={adjuntar} errorFallback="x" sinSoporteText="Falta soporte" />)
    await user.click(screen.getByRole("button", { name: "Adjuntar archivo" }))
    await user.click(screen.getByRole("button", { name: "Adjuntar" }))
    expect(screen.getByRole("alert")).toHaveTextContent("Falta soporte")
    expect(adjuntar.mutate).not.toHaveBeenCalled()
  })

  it("shows the selected filename and a Quitar button that clears it without closing the form", async () => {
    const user = userEvent.setup()
    render(<AdjuntarArchivoControl adjuntar={mutation()} errorFallback="x" sinSoporteText="Falta soporte" />)
    await user.click(screen.getByRole("button", { name: "Adjuntar archivo" }))
    await user.upload(
      screen.getByLabelText("Archivo del soporte"),
      new File([new Uint8Array(1)], "factura.pdf", { type: "application/pdf" }),
    )

    expect(screen.getByText("factura.pdf")).toBeInTheDocument()
    expect(screen.queryByLabelText("Archivo del soporte")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Quitar" }))

    expect(screen.queryByText("factura.pdf")).not.toBeInTheDocument()
    expect(screen.getByLabelText("Archivo del soporte")).toBeInTheDocument()
    expect(screen.getByRole("form", { name: "Adjuntar archivo" })).toBeInTheDocument()
  })

  it("sends { soporte } to the mutation for a file, scoped to the caller's own variables shape", async () => {
    const user = userEvent.setup()
    const adjuntar = mutation()
    render(<AdjuntarArchivoControl adjuntar={adjuntar} errorFallback="x" sinSoporteText="Falta soporte" />)
    await user.click(screen.getByRole("button", { name: "Adjuntar archivo" }))
    const file = new File([new Uint8Array(1)], "factura.pdf", { type: "application/pdf" })
    await user.upload(screen.getByLabelText("Archivo del soporte"), file)
    await user.click(screen.getByRole("button", { name: "Adjuntar" }))

    expect(adjuntar.mutate).toHaveBeenCalledTimes(1)
    const [variables, options] = (adjuntar.mutate as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(variables).toEqual({ soporte: { tipo: "archivo", file } })
    expect(options?.onSuccess).toBeTypeOf("function")
  })

  it("sends { soporte } to the mutation for a link", async () => {
    const user = userEvent.setup()
    const adjuntar = mutation()
    render(<AdjuntarArchivoControl adjuntar={adjuntar} errorFallback="x" sinSoporteText="Falta soporte" />)
    await user.click(screen.getByRole("button", { name: "Adjuntar archivo" }))
    await user.click(screen.getByRole("radio", { name: "Enlace" }))
    await user.type(screen.getByLabelText("URL"), "https://drive.example.com/f/1")
    await user.type(screen.getByLabelText("Nombre del enlace"), "Carpeta")
    await user.click(screen.getByRole("button", { name: "Adjuntar" }))

    expect(adjuntar.mutate).toHaveBeenCalledTimes(1)
    const [variables] = (adjuntar.mutate as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(variables).toEqual({ soporte: { tipo: "enlace", url_externa: "https://drive.example.com/f/1", nombre: "Carpeta" } })
  })

  it("shows the mutation's inline error and keeps the form open", async () => {
    const user = userEvent.setup()
    const adjuntar = mutation({ isError: true, error: new Error("Puedes adjuntar máximo 5 soportes.") })
    render(<AdjuntarArchivoControl adjuntar={adjuntar} errorFallback="x" sinSoporteText="Falta soporte" />)
    await user.click(screen.getByRole("button", { name: "Adjuntar archivo" }))
    expect(screen.getByRole("alert")).toHaveTextContent("Puedes adjuntar máximo 5 soportes.")
    expect(screen.getByRole("form", { name: "Adjuntar archivo" })).toBeInTheDocument()
  })

  it("Cancelar closes the form without calling the mutation", async () => {
    const user = userEvent.setup()
    const adjuntar = mutation()
    render(<AdjuntarArchivoControl adjuntar={adjuntar} errorFallback="x" sinSoporteText="Falta soporte" />)
    await user.click(screen.getByRole("button", { name: "Adjuntar archivo" }))
    await user.click(screen.getByRole("button", { name: "Cancelar" }))
    expect(screen.queryByRole("form", { name: "Adjuntar archivo" })).not.toBeInTheDocument()
    expect(adjuntar.mutate).not.toHaveBeenCalled()
  })
})
