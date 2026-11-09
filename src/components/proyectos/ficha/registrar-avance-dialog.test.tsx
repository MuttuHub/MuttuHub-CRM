// T9 / S9: the header's «Registrar avance» dialog. The queries are real; only `fetch` is mocked.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, useState, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectListRow } from "@/hooks/projects"
import { RegistrarAvanceDialog } from "./registrar-avance-dialog"

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

const STAMP = { created_at: "2026-10-08T00:00:00.000Z", updated_at: "2026-10-08T00:00:00.000Z" }

function actividad(id: string, codigo: string, nombre: string, responsable_id: string | null = null) {
  return {
    ...STAMP,
    id,
    proyecto_id: "p1",
    objetivo_id: "o1",
    codigo,
    nombre,
    semana_inicio: 1,
    semana_fin: 3,
    fecha_inicio: "2026-10-05",
    fecha_fin: "2026-12-10",
    peso: 1,
    peso_manual: false,
    responsable_id,
    fuera_de_duracion: false,
  }
}

const ACTIVIDADES = [
  actividad("a1", "1.1", "Diagnóstico inicial"),
  actividad("a2", "1.2", "Taller de formación", "u9"),
  actividad("a3", "1.3", "Visitas de seguimiento"),
]

const TECNICO = {
  base: "vigente",
  corte: "2026-11-06",
  estado: "EN_EJECUCION",
  avance_real: 40,
  avance_programado: 50,
  desviacion_pp: 10,
  color: "amarillo",
  tope_en_curso: 90,
  actividades: [
    { id: "a1", codigo: "1.1", peso: 1, progreso: 100, estado: "FINALIZADA", fecha_cumplimiento: "2026-10-20" },
    { id: "a2", codigo: "1.2", peso: 1, progreso: 40, estado: "EN_CURSO", fecha_cumplimiento: null },
    { id: "a3", codigo: "1.3", peso: 1, progreso: 0, estado: "NO_INICIADA", fecha_cumplimiento: null },
  ],
  umbrales: { umbral1: 10, umbral2: 20, confirmado: false },
}

// a3 has one deliverable already counted in full: its reports may reach 100 %.
const ENTREGABLE = {
  ...STAMP,
  id: "e3",
  proyecto_id: "p1",
  actividad_id: "a3",
  codigo: "ENT-3",
  descripcion: "Acta de visita",
  cantidad_meta: "2.00",
  unidad: "actas",
  tipo_medio_exigido: "PDF firmado",
}

const AVANCE_CONTADO = {
  id: "av3",
  proyecto_id: "p1",
  entregable_id: "e3",
  fecha: "2026-10-20",
  cantidad: "2.00",
  observacion: null,
  justificacion_exceso: null,
  registrado_por_id: "u1",
  created_at: "2026-10-20T00:00:00.000Z",
  anulado_at: null,
  anulado_por_id: null,
  motivo_anulacion: null,
  medios: 1,
  cuenta: true,
  soportes: [],
}

function reporte(id: string, actividadId: string, porcentaje: string) {
  return {
    id,
    proyecto_id: "p1",
    actividad_id: actividadId,
    fecha: "2026-10-20",
    porcentaje,
    observacion: "Taller inicial.",
    registrado_por_id: "u1",
    registrado_por_nombre: "Ana Pérez",
    created_at: "2026-10-20T00:00:00.000Z",
    anulado_at: null,
    anulado_por_id: null,
    motivo_anulacion: null,
    medios: 0,
  }
}

function Harness({ actividadId = null }: { actividadId?: string | null }) {
  const [open, setOpen] = useState(true)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir
      </button>
      <RegistrarAvanceDialog proyecto={PROYECTO} open={open} onOpenChange={setOpen} actividadId={actividadId} />
    </>
  )
}

describe("RegistrarAvanceDialog", () => {
  const fetchMock = vi.fn()

  function setup({
    actividadId = null,
    progresoPendiente = false,
  }: { actividadId?: string | null; progresoPendiente?: boolean } = {}) {
    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"
      if (url.endsWith("/api/v1/auth/me")) {
        return Promise.resolve(jsonResponse({ usuario: { id: "u1", nombre: "Ana Pérez", rol: "ADMINISTRADOR" } }))
      }
      if (url.endsWith("/members")) {
        return Promise.resolve(
          jsonResponse({
            miembros: [
              {
                id: "m1",
                usuario: { id: "u9", nombre: "Carla Ruiz", rol: "COORDINADOR" },
                agregado_por_id: "u1",
                created_at: "2026-10-07T13:00:00.000Z",
                removed_at: null,
              },
            ],
          }),
        )
      }
      if (url.split("?")[0].endsWith("/technical-status")) return Promise.resolve(jsonResponse(TECNICO))
      if (url.endsWith("/activities")) return Promise.resolve(jsonResponse({ actividades: ACTIVIDADES }))
      if (url.endsWith("/deliverables")) return Promise.resolve(jsonResponse({ entregables: [ENTREGABLE] }))
      if (url.endsWith("/deliverables/e3/progress")) {
        if (progresoPendiente) return new Promise(() => {})
        return Promise.resolve(jsonResponse({ estado: "EN_EJECUCION", meta: "2.00", avances: [AVANCE_CONTADO] }))
      }
      if (url.endsWith("/activities/a2/progress") && method === "GET") {
        return Promise.resolve(jsonResponse({ estado: "EN_EJECUCION", reportes: [reporte("r1", "a2", "40.00")] }))
      }
      if (url.endsWith("/activities/a2/progress") && method === "POST") {
        return Promise.resolve(jsonResponse({ reporte: reporte("r9", "a2", "55.00") }, 201))
      }
      if (/\/activities\/a\d\/progress$/.test(url)) {
        return Promise.resolve(jsonResponse({ estado: "EN_EJECUCION", reportes: [] }))
      }
      return Promise.resolve(jsonResponse({}))
    })
    return render(<Harness actividadId={actividadId} />, { wrapper: createWrapper() })
  }

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("lists only the activities that still take reports and preselects the first unfinished one", async () => {
    setup()

    const dialog = await screen.findByRole("dialog", { name: "Registrar avance" })
    const select = await within(dialog).findByRole("combobox", { name: "Actividad" })
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "1.2 · Taller de formación",
      "1.3 · Visitas de seguimiento",
    ])
    expect(select).toHaveValue("a2")
    expect(dialog).toHaveAccessibleDescription("1.2 · Taller de formación")
    const resumen = within(dialog).getByTestId("registrar-avance-resumen")
    expect(resumen).toHaveTextContent("40 % registrado · tope 90 %")
    expect(resumen).toHaveTextContent("Responsable: Carla Ruiz")
    const form = within(dialog).getByRole("form", { name: "Registrar avance 1.2" })
    expect(within(form).getByLabelText("Avance total de la actividad (%)")).toBeInTheDocument()
    expect(within(form).getByRole("button", { name: "Guardar avance" })).toBeInTheDocument()
  })

  it("preselects the activity it was asked for", async () => {
    setup({ actividadId: "a3" })

    const dialog = await screen.findByRole("dialog", { name: "Registrar avance" })
    expect(await within(dialog).findByRole("combobox", { name: "Actividad" })).toHaveValue("a3")
    expect(within(dialog).getByRole("form", { name: "Registrar avance 1.3" })).toBeInTheDocument()
  })

  it("swaps the summary and the form when another activity is chosen, with the 100 % tope once its deliverables are complete", async () => {
    const user = userEvent.setup()
    setup()

    const dialog = await screen.findByRole("dialog", { name: "Registrar avance" })
    const select = await within(dialog).findByRole("combobox", { name: "Actividad" })
    await user.selectOptions(select, "a3")

    expect(dialog).toHaveAccessibleDescription("1.3 · Visitas de seguimiento")
    expect(within(dialog).getByRole("form", { name: "Registrar avance 1.3" })).toBeInTheDocument()
    expect(within(dialog).queryByRole("form", { name: "Registrar avance 1.2" })).not.toBeInTheDocument()
    const resumen = within(dialog).getByTestId("registrar-avance-resumen")
    await waitFor(() => expect(resumen).toHaveTextContent("0 % registrado · tope 100 %"))
    expect(resumen).not.toHaveTextContent("Responsable:")
  })

  it("saves the report for the chosen activity, closes and announces it", async () => {
    const user = userEvent.setup()
    setup()

    const dialog = await screen.findByRole("dialog", { name: "Registrar avance" })
    const form = await within(dialog).findByRole("form", { name: "Registrar avance 1.2" })
    await user.type(within(form).getByLabelText("Avance total de la actividad (%)"), "55")
    await user.type(within(form).getByLabelText("Qué se hizo"), "Segundo taller.")
    await user.click(within(form).getByRole("button", { name: "Guardar avance" }))

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Registrar avance" })).not.toBeInTheDocument())
    expect(screen.getByRole("status")).toHaveTextContent("Avance registrado: la 1.2 queda en 55 %.")
    const post = fetchMock.mock.calls.find(
      ([url, init]) => String(url).endsWith("/activities/a2/progress") && init?.method === "POST",
    )
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({ porcentaje: 55, observacion: "Segundo taller." })
  })

  // T12: the tope depends on the deliverables' progress; until it arrives the form must not offer a wrong tope.
  it("waits for the deliverables' progress before showing the summary and the form", async () => {
    setup({ actividadId: "a3", progresoPendiente: true })

    const dialog = await screen.findByRole("dialog", { name: "Registrar avance" })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/deliverables/e3/progress", expect.any(Object)))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(within(dialog).queryByTestId("registrar-avance-resumen")).not.toBeInTheDocument()
    expect(within(dialog).queryByRole("form", { name: "Registrar avance 1.3" })).not.toBeInTheDocument()
  })

  // T12: the success notice belongs to that save; opening the dialog again clears it.
  it("clears the success notice when the dialog opens again", async () => {
    const user = userEvent.setup()
    setup()

    const dialog = await screen.findByRole("dialog", { name: "Registrar avance" })
    const form = await within(dialog).findByRole("form", { name: "Registrar avance 1.2" })
    await user.type(within(form).getByLabelText("Avance total de la actividad (%)"), "55")
    await user.type(within(form).getByLabelText("Qué se hizo"), "Segundo taller.")
    await user.click(within(form).getByRole("button", { name: "Guardar avance" }))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Avance registrado"))

    await user.click(screen.getByRole("button", { name: "Abrir" }))
    await screen.findByRole("dialog", { name: "Registrar avance" })
    expect(screen.getByRole("status", { hidden: true })).toHaveTextContent("")
  })

  it("closes on Cancelar without saving", async () => {
    const user = userEvent.setup()
    setup()

    const dialog = await screen.findByRole("dialog", { name: "Registrar avance" })
    const form = await within(dialog).findByRole("form", { name: "Registrar avance 1.2" })
    await user.click(within(form).getByRole("button", { name: "Cancelar" }))

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Registrar avance" })).not.toBeInTheDocument())
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false)
  })
})
