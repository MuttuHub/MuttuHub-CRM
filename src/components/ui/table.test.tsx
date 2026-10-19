import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table"

function Sample({ selected = false }: { selected?: boolean }) {
  return (
    <Table>
      <TableCaption>Resumen</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Nombre</TableHead>
          <TableHead scope="col" numeric>
            Valor
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow data-state={selected ? "selected" : undefined}>
          <TableCell>Ana</TableCell>
          <TableCell numeric>1.200</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  )
}

describe("Table", () => {
  it("renders semantic table structure with column headers", () => {
    render(<Sample />)
    expect(screen.getByRole("table")).toBeInTheDocument()
    const headers = screen.getAllByRole("columnheader")
    expect(headers).toHaveLength(2)
    expect(headers[0]).toHaveAttribute("scope", "col")
    expect(screen.getByRole("cell", { name: "Ana" })).toBeInTheDocument()
  })

  it("keeps the horizontal-scroll container", () => {
    const { container } = render(<Sample />)
    expect(container.querySelector("[data-slot=table-container]")).toHaveClass(
      "overflow-x-auto",
    )
  })

  it("uses 44px rows", () => {
    render(<Sample />)
    for (const row of screen.getAllByRole("row")) {
      expect(row).toHaveClass("h-11")
    }
  })

  it("styles headers as eyebrows", () => {
    render(<Sample />)
    const th = screen.getAllByRole("columnheader")[0]
    expect(th).toHaveClass("text-xs", "font-bold", "uppercase", "tracking-widest", "text-ink-500")
  })

  it("renders cells with tabular numerals", () => {
    render(<Sample />)
    expect(screen.getByRole("cell", { name: "Ana" })).toHaveClass("tabular-nums")
  })

  it("right-aligns numeric headers and cells without leaking the prop to the DOM", () => {
    render(<Sample />)
    const th = screen.getAllByRole("columnheader")[1]
    const td = screen.getByRole("cell", { name: "1.200" })
    expect(th).toHaveClass("text-right")
    expect(td).toHaveClass("text-right", "tabular-nums")
    expect(th).not.toHaveAttribute("numeric")
    expect(td).not.toHaveAttribute("numeric")
    expect(screen.getByRole("cell", { name: "Ana" })).not.toHaveClass("text-right")
  })

  it("draws a primary rail on the selected row only", () => {
    render(<Sample selected />)
    const rows = screen.getAllByRole("row")
    expect(rows[1].className).toContain("data-[state=selected]:shadow-[inset_3px_0_0_var(--primary)]")
    expect(rows[1]).toHaveAttribute("data-state", "selected")
  })
})
