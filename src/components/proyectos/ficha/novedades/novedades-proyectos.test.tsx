// Página «Novedades de Proyectos» (rediseño S2, tablero Ayudas y novedades): solo lectura, un h1, la fecha de la
// entrega, siete tarjetas «Antes / Ahora» y el enlace de vuelta al proyecto de origen (o al portafolio).

import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { NovedadesProyectos } from "./novedades-proyectos"

describe("NovedadesProyectos", () => {
  it("has one page title, the release date and the plain-words intro", () => {
    render(<NovedadesProyectos />)

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1)
    expect(screen.getByRole("heading", { level: 1, name: "Qué cambió en Proyectos" })).toBeInTheDocument()
    expect(screen.getByText("Novedades · 05 nov 2026")).toBeInTheDocument()
    expect(screen.getByText(/Estos cambios responden a los ajustes que pidió Coordinación\. Ya están en la app\./)).toBeInTheDocument()
    // No rule codes on screen.
    expect(document.body.textContent).not.toMatch(/AJ-0\d/)
  })

  it("lists the seven changes, each with «Antes» and «Ahora»", () => {
    render(<NovedadesProyectos />)

    const tarjetas = screen.getAllByRole("article")
    expect(tarjetas.map((t) => within(t).getByRole("heading").textContent)).toEqual([
      "Registrar avance",
      "Historial de avances",
      "Actividades finalizadas",
      "Finanzas",
      "Lista de gastos",
      "Adjuntar archivos",
      "Contadores",
    ])
    const primera = tarjetas[0]!
    expect(primera).toHaveTextContent("Antes")
    expect(primera).toHaveTextContent("Solo la persona responsable de la actividad veía el botón.")
    expect(primera).toHaveTextContent("Ahora")
    expect(primera).toHaveTextContent("Cualquier integrante del equipo lo registra, también desde la cabecera del proyecto.")
    expect(tarjetas[3]).toHaveTextContent("«40,3 % de lo programado» y cada barra con el color de su semáforo.")
  })

  it("goes back to the project it came from", () => {
    render(<NovedadesProyectos desdeProyectoId="p 1" />)

    const volver = screen.getByRole("link", { name: "Volver al proyecto" })
    expect(volver).toHaveAttribute("href", "/proyectos/p%201")
    expect(volver.className).toMatch(/(^|\s)min-h-11(\s|$)/)
  })

  it("goes back to the portfolio when it was opened directly", () => {
    render(<NovedadesProyectos desdeProyectoId={null} />)

    expect(screen.getByRole("link", { name: "Volver a Proyectos" })).toHaveAttribute("href", "/proyectos")
  })
})
