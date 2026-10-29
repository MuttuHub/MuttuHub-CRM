// El reporte imprimible de tareas también se abre en la misma pestaña (S4): la página le pone «Volver» encima
// de la barra del reporte (que vive en kanban/print-report y se integra a la barra compartida en 2.4b).

import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import PrintReportesPage from "./page"

vi.mock("@/components/kanban/print-report", () => ({
  PrintReportes: () => <p>reporte de tareas</p>,
}))

describe("/print/reportes/tareas", () => {
  it("shows Volver, falling back to Reportes, above the task report", () => {
    render(<PrintReportesPage />)

    const volver = screen.getByRole("link", { name: "Volver" })
    expect(volver).toHaveAttribute("href", "/reportes")
    expect(volver).not.toHaveAttribute("target")
    expect(volver.closest(".print-hide")).not.toBeNull()
    expect(screen.getByText("reporte de tareas")).toBeInTheDocument()
  })
})
