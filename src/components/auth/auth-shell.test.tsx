import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { AuthShell } from "./auth-shell"

// Shared by /auth/reset-password (+ confirm). Guards the centered layout
// while the login (AccesoPage) gets the v6 brand panel (V2.1).
describe("AuthShell", () => {
  it("renders children inside a centered, page-token shell", () => {
    const { container } = render(
      <AuthShell>
        <p>contenido</p>
      </AuthShell>,
    )
    expect(screen.getByText("contenido")).toBeTruthy()
    const root = container.firstElementChild as HTMLElement
    expect(root.className).toContain("min-h-screen")
    expect(root.className).toContain("items-center")
    expect(root.className).toContain("justify-center")
    expect(root.className).toContain("bg-page")
    expect(screen.getByText("contenido").parentElement?.className).toContain("max-w-[400px]")
  })
})
