import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { SelectorArchivo } from "./selector-archivo"

function renderSelector(props: Partial<Parameters<typeof SelectorArchivo>[0]> = {}) {
  const onChange = vi.fn()
  render(
    <>
      <label htmlFor="sel">Archivo del soporte</label>
      <SelectorArchivo id="sel" onChange={onChange} {...props} />
    </>,
  )
  return onChange
}

describe("SelectorArchivo", () => {
  it("speaks Spanish instead of the browser's «Choose File · No file chosen»", () => {
    renderSelector()
    expect(screen.getByText("Elegir archivo")).toBeInTheDocument()
    expect(screen.getByText("Ningún archivo elegido")).toBeInTheDocument()
  })

  it("keeps the real file input reachable by its label and shows the chosen file's name", async () => {
    const onChange = renderSelector({ accept: ".pdf" })
    const input = screen.getByLabelText("Archivo del soporte") as HTMLInputElement
    expect(input.type).toBe("file")
    expect(input.accept).toBe(".pdf")

    const archivo = new File(["x"], "acta-firmada.pdf", { type: "application/pdf" })
    await userEvent.upload(input, archivo)

    expect(onChange).toHaveBeenCalledWith(archivo)
    expect(screen.getByText("acta-firmada.pdf")).toBeInTheDocument()
    expect(screen.queryByText("Ningún archivo elegido")).not.toBeInTheDocument()
  })

  it("disables the input when asked", () => {
    renderSelector({ disabled: true })
    expect(screen.getByLabelText("Archivo del soporte")).toBeDisabled()
  })
})
