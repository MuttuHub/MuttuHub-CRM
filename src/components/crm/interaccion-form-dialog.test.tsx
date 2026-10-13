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
import { InteraccionFormDialog } from "./interaccion-form-dialog"

const { addLogMutation, useOpportunitiesMock } = vi.hoisted(() => ({
  addLogMutation: { isPending: false, mutateAsync: vi.fn() },
  useOpportunitiesMock: vi.fn<() => { data: Oportunidad[] }>(() => ({ data: [] })),
}))

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
