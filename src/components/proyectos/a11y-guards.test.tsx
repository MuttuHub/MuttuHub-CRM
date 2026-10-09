// S10 WU5: guards that keep the Projects forms and progress bars accessible. jsdom only: class and
// attribute checks, no layout. Real screenshots are out of scope (they need the running app).

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectBudgetRubro, ProjectDeliverable, ProjectListRow } from "@/hooks/projects"
import { EjecucionAvanceForm } from "./ejecucion-avance-form"
import { GastoForm } from "./gasto-form"
import { SolicitarModificacion } from "./modificacion-form"

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return createElement(QueryClientProvider, { client }, children)
}

const PROYECTO = {
  id: "p1",
  codigo: "PRY-2026-001",
  nombre: "Fortalecimiento",
  estado: "EN_EJECUCION",
  fecha_inicio: "2026-10-05",
  fecha_fin: "2027-01-29",
  valor_total: "37200000.00",
  lineas: [],
  municipios: [],
} as unknown as ProjectListRow

const RUBROS: ProjectBudgetRubro[] = [
  { rubro_id: "r12", codigo: "R12", nombre: "Transporte", activo: true, linea_id: "l12", asignado: "24000000.00", heredado_pendiente: false },
]

const ENTREGABLE = {
  id: "e1",
  proyecto_id: "p1",
  actividad_id: "a1",
  codigo: "ENT-1",
  descripcion: "Acta",
  cantidad_meta: "2.00",
  unidad: "actas",
  tipo_medio_exigido: "PDF",
} as ProjectDeliverable

/** Every field the user fills must expose a non-empty accessible name (label, aria-label, legend). */
function expectNamedControls(root: HTMLElement) {
  const controls = Array.from(root.querySelectorAll<HTMLElement>("input, select, textarea"))
  expect(controls.length).toBeGreaterThan(0)
  for (const control of controls) {
    const labels = Array.from((control as HTMLInputElement).labels ?? []).map((label) => label.textContent?.trim() ?? "")
    const name = [control.getAttribute("aria-label"), control.getAttribute("aria-labelledby"), ...labels].filter(Boolean).join(" ").trim()
    expect(name, `unnamed control: ${control.outerHTML.slice(0, 100)}`).not.toBe("")
  }
}

describe("Projects forms: accessible names", () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue(new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }))
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it("gasto form, including both support variants", async () => {
    const user = userEvent.setup()
    render(<GastoForm proyecto={PROYECTO} rubros={RUBROS} onDone={() => {}} />, { wrapper })
    const form = screen.getByRole("form")
    expectNamedControls(form)
    await user.click(within(form).getByLabelText("Archivo"))
    expectNamedControls(form)
    await user.click(within(form).getByLabelText("Enlace"))
    expectNamedControls(form)
  })

  it("avance form, including both medio variants", async () => {
    const user = userEvent.setup()
    render(<EjecucionAvanceForm projectId="p1" entregable={ENTREGABLE} meta="2.00" avances={[]} onDone={() => {}} />, { wrapper })
    const form = screen.getByRole("form", { name: "Registrar avance ENT-1" })
    expectNamedControls(form)
    await user.click(within(form).getByLabelText("Archivo"))
    expectNamedControls(form)
    await user.click(within(form).getByLabelText("Enlace"))
    expectNamedControls(form)
  })

  it("modificación dialog", async () => {
    const user = userEvent.setup()
    render(<SolicitarModificacion proyecto={PROYECTO} />, { wrapper })
    await user.click(screen.getByRole("button", { name: "Solicitar modificación" }))
    expectNamedControls(await screen.findByRole("dialog"))
  })
})

describe("progress bars", () => {
  it("no Projects component uses a native <progress> (it has no accessible name or semáforo band)", () => {
    const dir = __dirname
    const offenders = readdirSync(dir)
      .filter((file) => file.endsWith(".tsx") && !file.includes(".test."))
      .filter((file) => /<progress[\s>]/.test(readFileSync(path.join(dir, file), "utf8")))
    expect(offenders).toEqual([])
  })

  it("every ProgressBar usage in the Projects components passes an aria-label", () => {
    const dir = __dirname
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".tsx") && !f.includes(".test."))) {
      const source = readFileSync(path.join(dir, file), "utf8")
      for (const match of source.matchAll(/<ProgressBar\b[\s\S]*?\/>/g)) {
        expect(match[0], `${file}: ProgressBar without aria-label`).toMatch(/aria-label=/)
      }
    }
  })
})
