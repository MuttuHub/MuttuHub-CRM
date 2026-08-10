import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./card"

describe("Card", () => {
  it("renders the full composite with data slots", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Título</CardTitle>
          <CardDescription>Descripción</CardDescription>
        </CardHeader>
        <CardContent>Contenido</CardContent>
        <CardFooter>Pie</CardFooter>
      </Card>,
    )
    expect(screen.getByText("Título")).toBeInTheDocument()
    expect(screen.getByText("Descripción")).toBeInTheDocument()
    expect(screen.getByText("Contenido")).toBeInTheDocument()
    expect(screen.getByText("Pie")).toBeInTheDocument()
    expect(screen.getByText("Título").closest("[data-slot=card-header]")).toBeInTheDocument()
    expect(screen.getByText("Título").closest("[data-slot=card]")).toBeInTheDocument()
    expect(document.querySelectorAll("[data-slot^=card]")).toHaveLength(6)
  })

  it("marks the size via data-size", () => {
    const { container } = render(<Card size="sm" />)
    expect(container.firstElementChild).toHaveAttribute("data-size", "sm")
  })

  it("renders CardAction in the header grid position", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>T</CardTitle>
          <CardAction>
            <button type="button">Acción</button>
          </CardAction>
        </CardHeader>
      </Card>,
    )
    expect(screen.getByRole("button", { name: "Acción" }).closest("[data-slot=card-action]")).toBeInTheDocument()
  })
})