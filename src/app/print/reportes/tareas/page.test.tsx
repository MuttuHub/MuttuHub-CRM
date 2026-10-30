// El reporte imprimible de tareas se abre en la misma pestaña (S4). Desde 2.4b su «Volver» vive en la barra
// compartida de kanban/print-report, así que la página ya no pinta uno propio (no hay dos «Volver»).

import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import PrintReportesPage from "./page"

vi.mock("@/components/kanban/print-report", () => ({
  PrintReportes: () => <p>reporte de tareas</p>,
}))

describe("/print/reportes/tareas", () => {
  it("renders the task report without a page-level Volver of its own", () => {
    render(<PrintReportesPage />)

    expect(screen.getByText("reporte de tareas")).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Volver" })).not.toBeInTheDocument()
  })
})
