// v7 alignment, unit C3b: the "Registrar interacción" dialog. It writes through
// the per-client bitácora (POST /clients/:id/log) — the only write path for the
// immutable interactions — carrying tipo, the optional oportunidad link, the
// resumen and the optional próximo paso. These tests pin the payload the server
// receives and the validation that keeps an empty note out of the log.

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { describe, expect, it, vi } from "vitest"
import type { Oportunidad } from "@/hooks/crm"
import type { ProjectListRow } from "@/hooks/projects"
import { InteraccionFormDialog } from "./interaccion-form-dialog"

// The dialog drives ~8 userEvent interactions; under a loaded full-suite run the
// 5 s default is not enough, so give the file a generous budget.
vi.setConfig({ testTimeout: 20000 })

const { addLogMutation, useOpportunitiesMock, useProjectsMock } = vi.hoisted(() => ({
  addLogMutation: { isPending: false, mutateAsync: vi.fn() },
  useOpportunitiesMock: vi.fn<() => { data: Oportunidad[] }>(() => ({ data: [] })),
  useProjectsMock: vi.fn<
    (filters: unknown, options?: unknown) => { data: { proyectos: Partial<ProjectListRow>[] } }
  >(() => ({ data: { proyectos: [] } })),
}))

vi.mock("@/hooks/projects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/projects")>()
  return { ...actual, useProjects: useProjectsMock }
})

vi.mock("@/hooks/crm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/crm")>()
  return {
    ...actual,
    useAddLogEntry: () => addLogMutation,
    useOpportunities: useOpportunitiesMock,
  }
})

const OPORTUNIDAD: Oportunidad = {
  id: "op-1",
  nombre: "Consultoría línea base 2026",
  problema_detectado: null,
  solucion_propuesta: null,
  servicios_interes: null,
  valor_estimado_cop: null,
  estado: "PRESENTADA",
  fecha_ultima_gestion: null,
  fase: "PROSPECCION",
  fecha_adjudicacion: null,
  fecha_envio_propuesta: null,
  proyectos_relacionados: null,
  created_at: "2025-01-01T00:00:00.000Z",
}

const CLIENTS = [
  { id: "c-1", nombre: "Alcaldía de Barranquilla" },
  { id: "c-2", nombre: "Fundación Horizonte" },
]

function renderDialog(onOpenChange = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <InteraccionFormDialog open onOpenChange={onOpenChange} clients={CLIENTS} />
    </QueryClientProvider>,
  )
}

function triggerWith(text: string) {
  return screen.getAllByRole("combobox").find((cb) => cb.textContent?.includes(text))!
}

describe("InteraccionFormDialog", () => {
  it("submits tipo, aliado, oportunidad, resumen and próximo paso through the per-client log", async () => {
    const user = userEvent.setup()
    addLogMutation.mutateAsync.mockReset()
    addLogMutation.mutateAsync.mockResolvedValue({})
    useOpportunitiesMock.mockReturnValue({ data: [OPORTUNIDAD] })
    const onOpenChange = vi.fn()

    renderDialog(onOpenChange)

    await user.click(triggerWith("Elige un aliado"))
    await user.click(await screen.findByRole("option", { name: "Alcaldía de Barranquilla" }))

    await user.click(triggerWith("Sin oportunidad"))
    await user.click(await screen.findByRole("option", { name: OPORTUNIDAD.nombre }))

    await user.click(triggerWith("Reunión"))
    await user.click(await screen.findByRole("option", { name: "Correo" }))

    await user.type(
      screen.getByLabelText(/Resumen/),
      "Correo con la propuesta ajustada",
    )
    await user.type(screen.getByLabelText(/Próximo paso/), "Confirmar la reunión del lunes")

    await user.click(screen.getByRole("button", { name: "Registrar" }))

    expect(addLogMutation.mutateAsync).toHaveBeenCalledWith({
      texto: "Correo con la propuesta ajustada",
      oportunidad_id: "op-1",
      tipo: "CORREO",
      proximo_paso: "Confirmar la reunión del lunes",
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("sends a null próximo paso and a null oportunidad when they are left empty", async () => {
    const user = userEvent.setup()
    addLogMutation.mutateAsync.mockReset()
    addLogMutation.mutateAsync.mockResolvedValue({})
    useOpportunitiesMock.mockReturnValue({ data: [] })

    renderDialog()

    await user.click(triggerWith("Elige un aliado"))
    await user.click(await screen.findByRole("option", { name: "Fundación Horizonte" }))
    await user.type(screen.getByLabelText(/Resumen/), "Visita de diagnóstico")

    await user.click(screen.getByRole("button", { name: "Registrar" }))

    expect(addLogMutation.mutateAsync).toHaveBeenCalledWith({
      texto: "Visita de diagnóstico",
      oportunidad_id: null,
      tipo: "REUNION",
      proximo_paso: null,
    })
  })

  // T8 (odd/tasks/reportes-etiqueta-y-posicion-propia.md, S16): the interaction can name the posición
  // propia project it was about; only projects where the chosen client is an ally are offered.
  it("offers the client's posición propia projects and sends the chosen one", async () => {
    const user = userEvent.setup()
    addLogMutation.mutateAsync.mockReset()
    addLogMutation.mutateAsync.mockResolvedValue({})
    useOpportunitiesMock.mockReturnValue({ data: [] })
    useProjectsMock.mockReturnValue({
      data: {
        proyectos: [
          { id: "pry-1", codigo: "PRY-2026-001", nombre: "Ruta textil", origen: "POSICION_PROPIA" },
          { id: "pry-2", codigo: "PRY-2026-002", nombre: "Consultoría directa", origen: "INDEPENDIENTE" },
        ],
      },
    })

    renderDialog()

    await user.click(triggerWith("Elige un aliado"))
    await user.click(await screen.findByRole("option", { name: "Alcaldía de Barranquilla" }))
    expect(useProjectsMock).toHaveBeenLastCalledWith({ cliente_id: "c-1" }, { enabled: true })

    await user.click(triggerWith("Sin proyecto"))
    expect(screen.queryByRole("option", { name: /Consultoría directa/ })).toBeNull()
    await user.click(await screen.findByRole("option", { name: "PRY-2026-001 · Ruta textil" }))
    await user.type(screen.getByLabelText(/Resumen/), "Reunión de seguimiento del aporte")

    await user.click(screen.getByRole("button", { name: "Registrar" }))

    expect(addLogMutation.mutateAsync).toHaveBeenCalledWith({
      texto: "Reunión de seguimiento del aporte",
      oportunidad_id: null,
      tipo: "REUNION",
      proximo_paso: null,
      proyecto_id: "pry-1",
    })
  })

  it("does not load projects before a client is chosen", () => {
    useProjectsMock.mockClear()

    renderDialog()

    expect(useProjectsMock).toHaveBeenCalledWith({ cliente_id: undefined }, { enabled: false })
    expect(useProjectsMock).not.toHaveBeenCalledWith(expect.anything(), { enabled: true })
  })

  it("blocks the submit and asks for an aliado when none is chosen", async () => {
    const user = userEvent.setup()
    addLogMutation.mutateAsync.mockReset()
    useOpportunitiesMock.mockReturnValue({ data: [] })

    renderDialog()

    await user.type(screen.getByLabelText(/Resumen/), "Nota sin aliado")
    await user.click(screen.getByRole("button", { name: "Registrar" }))

    expect(addLogMutation.mutateAsync).not.toHaveBeenCalled()
    expect(screen.getByRole("alert")).toHaveTextContent(/aliado/i)
  })

  it("blocks the submit when the resumen is empty", async () => {
    const user = userEvent.setup()
    addLogMutation.mutateAsync.mockReset()
    useOpportunitiesMock.mockReturnValue({ data: [] })

    renderDialog()

    await user.click(triggerWith("Elige un aliado"))
    await user.click(await screen.findByRole("option", { name: "Alcaldía de Barranquilla" }))
    await user.click(screen.getByRole("button", { name: "Registrar" }))

    expect(addLogMutation.mutateAsync).not.toHaveBeenCalled()
    expect(screen.getByRole("alert")).toHaveTextContent(/resumen/i)
  })
})

describe("InteraccionFormDialog — modal review (2.7)", () => {
  it("disables Cancelar while the interaction is being saved", () => {
    addLogMutation.isPending = true
    try {
      renderDialog()
      expect(screen.getByRole("button", { name: "Guardando…" })).toBeDisabled()
      expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled()
    } finally {
      addLogMutation.isPending = false
    }
  })

  it("keeps Cancelar enabled when nothing is saving", () => {
    renderDialog()
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeEnabled()
  })
})
