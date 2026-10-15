// F2: 390 px responsive contract, read from the real sources (jsdom has no layout engine, so scrollWidth cannot be
// measured here; the fixes are class contracts verified by these guards and by the browser screenshots).

import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const read = (file: string) => readFileSync(path.resolve(__dirname, file), "utf8")

describe("390 px responsive guards", () => {
  const dashboard = read("project-dashboard.tsx")

  it("Tablero: filters wrap in a grid and every filter control fills its cell", () => {
    expect(dashboard).toMatch(/<div className="grid [^"]*grid-cols-1 [^"]*gap-3[^"]*lg:flex [^"]*lg:flex-wrap[^"]*">\s*<Filtro label="Estado"/)
    expect(dashboard).toMatch(/<label className="[^"]*\bmin-w-0\b[^"]*">\s*\{label\}/)
  })

  it("Tablero: cards can shrink so their tables scroll in their own container", () => {
    expect(dashboard).toMatch(/cn\("surface flex min-w-0 flex-col/)
  })

  it("shell header: the title block yields to the actions and the title is smaller on phones", () => {
    const header = read("../shell/header.tsx")
    expect(header).toMatch(/<h1 className="[^"]*text-\[26px\][^"]*sm:text-\[31px\]/)
    expect(header).toMatch(/gap-1\.5 sm:gap-2\.5/)
  })

  it("Gastos KPIs: one column on phones and money values never wrap", () => {
    const kpis = read("gastos-kpis.tsx")
    expect(kpis).toMatch(/grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5/)
    expect(kpis).toMatch(/<span className="whitespace-nowrap" title=/)
  })

  it("Avance monthly table: scrolls inside its own container with a minimum width", () => {
    const curve = read("curve-s-chart.tsx")
    expect(curve).toMatch(/<Table data-testid="curve-s-tabla" className="min-w-\[[0-9]+px\]">/)
    expect(curve).toMatch(/data-testid="curve-s-chart" className="[^"]*\bmin-w-0\b/)
  })
})
