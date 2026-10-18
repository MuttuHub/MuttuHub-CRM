// Shared CRM pieces: the priority chip must never present an unknown value as a valid one (Z3-11).
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { PrioridadChip } from "./shared"

describe("PrioridadChip", () => {
  it.each([
    ["ALTA", "Alta"],
    ["MEDIA", "Media"],
    ["BAJA", "Baja"],
  ])("labels %s as %s", (prioridad, label) => {
    render(<PrioridadChip prioridad={prioridad} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it("renders an unknown priority as its raw value instead of a valid one", () => {
    render(<PrioridadChip prioridad="CRITICA" />)
    expect(screen.getByText("CRITICA")).toBeInTheDocument()
    expect(screen.queryByText("Baja")).not.toBeInTheDocument()
  })

  it("keeps the em dash for an empty priority", () => {
    render(<PrioridadChip prioridad={null} />)
    expect(screen.getByText("—")).toBeInTheDocument()
  })
})
