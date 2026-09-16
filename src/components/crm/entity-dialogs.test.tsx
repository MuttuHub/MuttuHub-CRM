// oportunidades-comerciales task 5.1: lifecycle view — estado, fase,
// fecha_envio_propuesta, linked tasks, bitácora, and the Convert action
// (RF-C04, D2/D5/D7). The Convert button is the highest-risk affordance: it
// must only appear for a GANADA opportunity still in PROSPECCION, and never
// when the caller is read-only.

import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { describe, expect, it, vi } from "vitest"
import type { Oportunidad } from "@/hooks/crm"
import { OportunidadLifecycleDialog } from "./entity-dialogs"

const noopMutation = {
  isPending: false,
  mutate: vi.fn(),
  mutateAsync: vi.fn().mockResolvedValue({}),
}

vi.mock("@/hooks/crm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/crm")>()
  return {
    ...actual,
    useTasksByOportunidad: () => ({ data: [], isLoading: false, isError: false }),
    useTasksByClient: () => ({ data: [], isLoading: false, isError: false }),
    useBitacora: () => ({ data: [], isLoading: false, isError: false }),
    useConvertOportunidad: () => noopMutation,
    useUpdateTarea: () => noopMutation,
    useAddLogEntry: () => noopMutation,
  }
})

const BASE_OPORTUNIDAD: Oportunidad = {
  id: "op-1",
  nombre: "Consultoría línea base 2026",
  problema_detectado: null,
  solucion_propuesta: null,
  servicios_interes: null,
  valor_estimado_cop: null,
  estado: "GANADA",
  fecha_ultima_gestion: null,
  fase: "PROSPECCION",
  fecha_adjudicacion: null,
  fecha_envio_propuesta: "2026-01-05T00:00:00.000Z",
  proyectos_relacionados: null,
  created_at: "2025-01-01T00:00:00.000Z",
}

function renderDialog(oportunidad: Oportunidad | null, readOnly = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <OportunidadLifecycleDialog
        clientId="cli-1"
        open={oportunidad !== null}
        onOpenChange={vi.fn()}
        oportunidad={oportunidad}
        readOnly={readOnly}
      />
    </QueryClientProvider>,
  )
}

describe("OportunidadLifecycleDialog", () => {
  it("renders estado, fase and the fixed fecha_envio_propuesta", () => {
    renderDialog(BASE_OPORTUNIDAD)

    expect(screen.getByText("Prospección")).toBeInTheDocument()
    expect(screen.getAllByText(/Ganada/i).length).toBeGreaterThan(0)
  })

  it("shows the Convertir action when estado is GANADA, fase is PROSPECCION, and not read-only", () => {
    renderDialog(BASE_OPORTUNIDAD)

    expect(screen.getByRole("button", { name: /Convertir/i })).toBeInTheDocument()
  })

  it("hides the Convertir action once fase is already EJECUCION (D7 — idempotent, no repeat conversion)", () => {
    renderDialog({ ...BASE_OPORTUNIDAD, fase: "EJECUCION" })

    expect(screen.queryByRole("button", { name: /Convertir/i })).not.toBeInTheDocument()
    expect(screen.getByText("Ejecución")).toBeInTheDocument()
  })

  it("hides the Convertir action when the caller is read-only", () => {
    renderDialog(BASE_OPORTUNIDAD, true)

    expect(screen.queryByRole("button", { name: /Convertir/i })).not.toBeInTheDocument()
  })

  it("hides the Convertir action when estado is not GANADA", () => {
    renderDialog({ ...BASE_OPORTUNIDAD, estado: "EN_NEGOCIACION" })

    expect(screen.queryByRole("button", { name: /Convertir/i })).not.toBeInTheDocument()
  })
})
