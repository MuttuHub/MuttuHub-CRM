// S4 U6: semáforo técnico. Presentacional puro: el color sale del API y se
// pinta tal cual, sin recalcularlo.

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { ProjectTechnicalStatus } from "@/hooks/projects"
import { SemaforoTecnico } from "./semaforo-tecnico"

const TECNICO: ProjectTechnicalStatus = {
  base: "vigente",
  corte: "2026-10-25",
  estado: "EN_EJECUCION",
  avance_real: 21.4,
  avance_programado: 57.1,
  desviacion_pp: 35.7,
  color: "rojo",
  actividades: [],
  umbrales: { umbral1: 10, umbral2: 20, confirmado: false },
}

describe("SemaforoTecnico", () => {
  it("paints the API color verbatim and shows real, programmed, deviation and corte", () => {
    render(<SemaforoTecnico tecnico={TECNICO} />)

    const semaforo = screen.getByTestId("semaforo-tecnico")
    expect(semaforo).toHaveAttribute("data-color", "rojo")
    expect(semaforo).toHaveTextContent("Rojo")
    expect(semaforo).toHaveTextContent("21,4 %")
    expect(semaforo).toHaveTextContent("57,1 %")
    expect(semaforo).toHaveTextContent("35,7 pp")
    expect(semaforo).toHaveTextContent("25 de oct de 2026")
  })

  it("shows the 'No confirmado' badge only while the thresholds are unconfirmed", () => {
    const { rerender } = render(<SemaforoTecnico tecnico={TECNICO} />)

    expect(screen.getByText("No confirmado")).toBeInTheDocument()

    rerender(<SemaforoTecnico tecnico={{ ...TECNICO, umbrales: { ...TECNICO.umbrales, confirmado: true } }} />)

    expect(screen.queryByText("No confirmado")).not.toBeInTheDocument()
  })

  it("renders each API color value as its own tone, never recomputed", () => {
    for (const [color, label] of [
      ["verde", "Verde"],
      ["amarillo", "Amarillo"],
      ["rojo", "Rojo"],
    ] as const) {
      const { unmount } = render(<SemaforoTecnico tecnico={{ ...TECNICO, color }} />)
      expect(screen.getByTestId("semaforo-tecnico")).toHaveAttribute("data-color", color)
      expect(screen.getByTestId("semaforo-tecnico")).toHaveTextContent(label)
      unmount()
    }
  })
})
