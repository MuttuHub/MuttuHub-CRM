// T5a (S9): the initial allies of a new posición propia project. The component is controlled; these
// tests pin the defaults of a new ally, the edits of each row, its removal and what is sent.

import { useState } from "react"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import {
  AliadosIniciales,
  aliadosParaEnviar,
  validarAliados,
  type AliadoInicial,
} from "./aliados-iniciales"

vi.setConfig({ testTimeout: 20000 })

const CLIENTES = [
  { id: "c1", nombre: "Cliente Uno" },
  { id: "c2", nombre: "Cliente Dos" },
]

function Controlado({ inicial = [], onChange }: { inicial?: AliadoInicial[]; onChange?: (a: AliadoInicial[]) => void }) {
  const [aliados, setAliados] = useState<AliadoInicial[]>(inicial)
  return (
    <AliadosIniciales
      clientes={CLIENTES}
      aliados={aliados}
      onChange={(siguientes) => {
        setAliados(siguientes)
        onChange?.(siguientes)
      }}
    />
  )
}

describe("AliadosIniciales", () => {
  it("adds a picked client as ALIADO en gestión, without aporte", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Controlado onChange={onChange} />)
    expect(screen.getByText("Aún no hay aliados.")).toBeInTheDocument()

    await user.click(screen.getByRole("combobox", { name: "Cliente aliado" }))
    await user.click(await screen.findByRole("option", { name: "Cliente Dos" }))

    expect(onChange).toHaveBeenLastCalledWith([{ cliente_id: "c2", rol: "ALIADO", estado: "EN_GESTION", aporte: "" }])
    const fila = screen.getByRole("listitem", { name: "Aliado: Cliente Dos" })
    expect(within(fila).getByRole("combobox", { name: "Rol de Cliente Dos" })).toHaveTextContent("Aliado")
    expect(within(fila).getByRole("combobox", { name: "Estado de Cliente Dos" })).toHaveTextContent("En gestión")
    expect(within(fila).getByLabelText("Aporte de Cliente Dos")).toHaveValue(null)
  })

  it("removes an ally and offers its client again", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Controlado inicial={[{ cliente_id: "c1", rol: "FINANCIADOR", estado: "COMPROMETIDO", aporte: "10" }]} onChange={onChange} />)

    await user.click(screen.getByRole("button", { name: "Quitar Cliente Uno" }))

    expect(onChange).toHaveBeenLastCalledWith([])
    await user.click(screen.getByRole("combobox", { name: "Cliente aliado" }))
    expect(await screen.findByRole("option", { name: "Cliente Uno" })).toBeInTheDocument()
  })

  it("sends the aporte as a number and omits it when blank", () => {
    expect(
      aliadosParaEnviar([
        { cliente_id: "c1", rol: "FINANCIADOR", estado: "COMPROMETIDO", aporte: " 1500.5 " },
        { cliente_id: "c2", rol: "PROSPECTO", estado: "EN_GESTION", aporte: "" },
      ]),
    ).toEqual([
      { cliente_id: "c1", rol: "FINANCIADOR", estado: "COMPROMETIDO", aporte_cop: 1500.5 },
      { cliente_id: "c2", rol: "PROSPECTO", estado: "EN_GESTION" },
    ])
  })

  it("rejects a negative or non-numeric aporte and accepts zero or blank", () => {
    const fila = (aporte: string): AliadoInicial => ({ cliente_id: "c1", rol: "ALIADO", estado: "EN_GESTION", aporte })
    expect(validarAliados([fila("-1")])).toBe("El aporte de cada aliado debe ser un número mayor o igual a 0.")
    expect(validarAliados([fila("abc")])).toBe("El aporte de cada aliado debe ser un número mayor o igual a 0.")
    expect(validarAliados([fila("0"), fila("")])).toBeNull()
  })
})
