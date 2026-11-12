// T9 / S9: the header's «Registrar gasto» dialog. The queries are real; only `fetch` is mocked.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, useState, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectListRow } from "@/hooks/projects"
import { RegistrarGastoDialog } from "./registrar-gasto-dialog"

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
  wrapper.displayName = "QueryClientTestWrapper"
  return wrapper
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

const PROYECTO: ProjectListRow = {
  id: "p1",
  codigo: "PRY-2026-001",
  nombre: "Fortalecimiento",
  estado: "EN_EJECUCION",
  origen: "INDEPENDIENTE",
  cliente: { id: "c1", nombre: "Alcaldía" },
  responsable: null,
  fecha_inicio: "2026-01-05",
  fecha_fin: "2026-12-20",
  duracion_semanas: 50,
  valor_total: null,
  diferencia_valor_oportunidad: null,
  alertas: [],
  beneficiarios_meta: null,
  lineas: [],
  municipios: [],
}

const BUDGET = {
  estado: "EN_EJECUCION",
  rubros: [
    { rubro_id: "r12", codigo: "R12", nombre: "Transporte", activo: true, linea_id: "l12", asignado: "24000000.00", heredado_pendiente: false },
  ],
  suma: "24000000.00",
  valor_total: "83500000.00",
  diferencia: "59500000.00",
}

function Harness() {
  const [open, setOpen] = useState(true)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir
      </button>
      <RegistrarGastoDialog proyecto={PROYECTO} open={open} onOpenChange={setOpen} />
    </>
  )
}

describe("RegistrarGastoDialog", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    fetchMock.mockImplementation((input: unknown) =>
      Promise.resolve(String(input).endsWith("/budget") ? jsonResponse(BUDGET) : jsonResponse({})),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("opens the expense form with the budget rubros, titled with the project code", async () => {
    render(<Harness />, { wrapper: createWrapper() })

    const dialog = await screen.findByRole("dialog", { name: "Registrar gasto" })
    expect(dialog).toHaveAccessibleDescription("PRY-2026-001 · cuenta como ejecutado al registrarlo.")
    const form = await within(dialog).findByRole("form", { name: "Registrar gasto" })
    const rubro = within(form).getByLabelText("Rubro")
    await waitFor(() =>
      expect(within(rubro).getAllByRole("option").map((option) => option.textContent)).toContain("R12 · Transporte"),
    )
    expect(within(form).getByRole("button", { name: "Registrar" })).toBeInTheDocument()
  })

  // T12: a failed budget read is said, instead of an empty form that claims there are no rubros.
  it("shows the error when the budget cannot be read, without the form", async () => {
    fetchMock.mockImplementation((input: unknown) =>
      Promise.resolve(
        String(input).endsWith("/budget")
          ? jsonResponse({ error: "No pudimos leer el presupuesto." }, 500)
          : jsonResponse({}),
      ),
    )
    render(<Harness />, { wrapper: createWrapper() })

    const dialog = await screen.findByRole("dialog", { name: "Registrar gasto" })
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("No pudimos leer el presupuesto.")
    expect(within(dialog).queryByRole("form", { name: "Registrar gasto" })).not.toBeInTheDocument()
  })

  it("keeps the form with the budget it already has when a later read fails, and says the read failed", async () => {
    const user = userEvent.setup()
    render(<Harness />, { wrapper: createWrapper() })
    const primera = await screen.findByRole("dialog", { name: "Registrar gasto" })
    await user.click(await within(primera).findByRole("button", { name: "Cancelar" }))
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Registrar gasto" })).not.toBeInTheDocument())

    fetchMock.mockImplementation((input: unknown) =>
      Promise.resolve(
        String(input).endsWith("/budget")
          ? jsonResponse({ error: "No pudimos leer el presupuesto." }, 500)
          : jsonResponse({}),
      ),
    )
    await user.click(screen.getByRole("button", { name: "Abrir" }))

    const dialog = await screen.findByRole("dialog", { name: "Registrar gasto" })
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("No pudimos leer el presupuesto.")
    expect(within(dialog).getByRole("form", { name: "Registrar gasto" })).toBeInTheDocument()
  })

  it("closes on Cancelar", async () => {
    const user = userEvent.setup()
    render(<Harness />, { wrapper: createWrapper() })

    const dialog = await screen.findByRole("dialog", { name: "Registrar gasto" })
    await user.click(await within(dialog).findByRole("button", { name: "Cancelar" }))

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Registrar gasto" })).not.toBeInTheDocument())
  })
})
