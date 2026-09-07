import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { PasswordInput } from "./password-input"

describe("PasswordInput", () => {
  it("oculta la contraseña por defecto y la muestra al tocar el ojito", async () => {
    const user = userEvent.setup()
    render(
      <PasswordInput
        aria-label="Contraseña"
        id="password"
        autoComplete="current-password"
        value="s3cret"
        onChange={() => {}}
      />,
    )

    const campo = screen.getByLabelText("Contraseña") as HTMLInputElement
    expect(campo.type).toBe("password")

    await user.click(screen.getByRole("button", { name: "Mostrar contraseña" }))

    const visible = screen.getByLabelText("Contraseña") as HTMLInputElement
    expect(visible.type).toBe("text")

    await user.click(screen.getByRole("button", { name: "Ocultar contraseña" }))

    const oculto = screen.getByLabelText("Contraseña") as HTMLInputElement
    expect(oculto.type).toBe("password")
  })
})
