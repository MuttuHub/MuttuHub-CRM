// Actividades de un grupo (S3 U4; T12/S6): el formulario elige el tipo y una
// transversal se lista en «Gestión del proyecto», nunca bajo un objetivo vacío.
// Queries reales; solo se burla `fetch`, igual que en estructura-objetivos.test.tsx.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectListRow } from "@/hooks/projects"
import { EstructuraActividades } from "./estructura-actividades"

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
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

const PROYECTO: ProjectListRow = {
  id: "p1",
  codigo: "PRY-2026-001",
  nombre: "Fortalecimiento",
  estado: "BORRADOR",
  origen: "INDEPENDIENTE",
  cliente: { id: "c1", nombre: "Alcaldía" },
  responsable: null,
  fecha_inicio: "2026-01-05",
  fecha_fin: "2026-03-29",
  duracion_semanas: 12,
  valor_total: null,
  diferencia_valor_oportunidad: null,
  alertas: [],
  beneficiarios_meta: null,
  lineas: [],
  municipios: [],
}

const STAMP = { proyecto_id: "p1", created_at: "2026-10-08T00:00:00.000Z", updated_at: "2026-10-08T00:00:00.000Z" }

const NORMAL = {
  ...STAMP,
  id: "a1",
  objetivo_id: "o1",
  tipo: "NORMAL",
  codigo: "ACT-1",
  nombre: "Taller de formación",
  semana_inicio: 1,
  semana_fin: 3,
  fecha_inicio: "2026-01-05",
  fecha_fin: "2026-01-25",
  peso: 2.5,
  responsable_id: null,
  fuera_de_duracion: false,
}

const TRANSVERSAL = {
  ...STAMP,
  id: "a9",
  objetivo_id: null,
  tipo: "TRANSVERSAL",
  codigo: "ACT-9",
  nombre: "Coordinación",
  semana_inicio: 1,
  semana_fin: 12,
  fecha_inicio: "2026-01-05",
  fecha_fin: "2026-03-29",
  peso: 12,
  responsable_id: null,
  fuera_de_duracion: false,
}

const HINT_TRANSVERSAL = "Las actividades transversales van en «Gestión del proyecto», sin objetivo."
const HINT_GRUPO_GESTION =
  "Las actividades de «Gestión del proyecto» son transversales y no tienen objetivo."

describe("EstructuraActividades (T12 S6)", () => {
  const fetchMock = vi.fn()

  function setup({
    objetivoId = "o1" as string | null,
    actividades = [NORMAL] as unknown[],
    canEdit = true,
  }: { objetivoId?: string | null; actividades?: unknown[]; canEdit?: boolean } = {}) {
    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"
      if (url.endsWith("/api/v1/catalogs/users")) return Promise.resolve(jsonResponse({ users: [] }))
      if (url.endsWith("/projects/p1/deliverables")) return Promise.resolve(jsonResponse({ entregables: [] }))
      if (url.endsWith("/projects/p1/activities") && method === "GET") {
        return Promise.resolve(jsonResponse({ actividades }))
      }
      if (method === "POST" && url.endsWith("/projects/p1/activities")) {
        return Promise.resolve(jsonResponse({ actividad: TRANSVERSAL }, 201))
      }
      if (method === "PATCH" && url.endsWith("/projects/p1/activities/a1")) {
        return Promise.resolve(jsonResponse({ actividad: NORMAL }))
      }
      return Promise.resolve(jsonResponse({ ok: true }))
    })
    return render(
      <EstructuraActividades proyecto={PROYECTO} objetivoId={objetivoId} canEdit={canEdit} />,
      { wrapper: createWrapper() },
    )
  }

  function mutationCall(method: string, suffix: string) {
    const call = fetchMock.mock.calls.find(
      ([url, init]) => (init?.method ?? "GET") === method && String(url).endsWith(suffix),
    )
    if (!call) return undefined
    const init = call[1] as RequestInit | undefined
    return { url: String(call[0]), body: init?.body ? JSON.parse(String(init.body)) : undefined }
  }

  async function nuevaActividad(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole("button", { name: "Agregar actividad" }))
    const form = screen.getByRole("form", { name: "Nueva actividad" })
    await user.type(within(form).getByLabelText("Código"), "ACT-9")
    await user.type(within(form).getByLabelText("Nombre"), "Coordinación")
    await user.type(within(form).getByLabelText("Semana inicial"), "1")
    await user.type(within(form).getByLabelText("Semana final"), "4")
    return form
  }

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("lists a transversal under «Gestión del proyecto», never under an objective", async () => {
    setup({ objetivoId: null, actividades: [NORMAL, TRANSVERSAL] })

    expect(await screen.findByRole("heading", { name: "Gestión del proyecto" })).toBeInTheDocument()
    const filas = screen.getAllByTestId("estructura-actividad")
    expect(filas).toHaveLength(1)
    expect(filas[0]).toHaveTextContent("ACT-9")
    // La actividad normal del objetivo o1 no se cuela en el grupo de gestión.
    expect(screen.queryByText("ACT-1")).not.toBeInTheDocument()
  })

  it("creates a transversal in «Gestión del proyecto» with tipo TRANSVERSAL and no objective", async () => {
    const user = userEvent.setup()
    setup({ objetivoId: null, actividades: [TRANSVERSAL] })

    const form = await nuevaActividad(user)
    // En el grupo de gestión no hay objetivo que elegir: la actividad es transversal por definición.
    expect(within(form).queryByRole("combobox", { name: "Tipo" })).not.toBeInTheDocument()
    expect(within(form).getByText(HINT_GRUPO_GESTION)).toBeInTheDocument()
    await user.click(within(form).getByRole("button", { name: "Guardar" }))

    await waitFor(() => expect(mutationCall("POST", "/activities")).toBeDefined())
    const body = mutationCall("POST", "/activities")?.body
    expect(body).toEqual({
      codigo: "ACT-9",
      nombre: "Coordinación",
      semana_inicio: 1,
      semana_fin: 4,
      tipo: "TRANSVERSAL",
    })
    // «en las transversales el objetivo va vacío»: la clave no viaja.
    expect(body).not.toHaveProperty("objetivo_id")
  })

  it("lets an objective activity choose Transversal and explains where it goes", async () => {
    const user = userEvent.setup()
    setup({ objetivoId: "o1" })

    await user.click(await screen.findByRole("button", { name: "Agregar actividad" }))
    const form = screen.getByRole("form", { name: "Nueva actividad" })
    await user.click(within(form).getByRole("combobox", { name: "Tipo" }))
    expect(await screen.findByRole("option", { name: "Normal" })).toBeInTheDocument()
    await user.click(await screen.findByRole("option", { name: "Transversal" }))
    expect(within(form).getByText(HINT_TRANSVERSAL)).toBeInTheDocument()
  })

  it("keeps the card objective and the default Normal type for a normal activity", async () => {
    const user = userEvent.setup()
    setup({ objetivoId: "o1" })

    const form = await nuevaActividad(user)
    await user.click(within(form).getByRole("button", { name: "Guardar" }))

    await waitFor(() => expect(mutationCall("POST", "/activities")).toBeDefined())
    expect(mutationCall("POST", "/activities")?.body).toEqual({
      objetivo_id: "o1",
      codigo: "ACT-9",
      nombre: "Coordinación",
      semana_inicio: 1,
      semana_fin: 4,
    })
  })

  it("moves an activity to transversal sending tipo and the cleared objective in the same patch", async () => {
    const user = userEvent.setup()
    setup({ objetivoId: "o1" })

    await user.click(await screen.findByRole("button", { name: "Editar actividad ACT-1" }))
    const form = screen.getByRole("form", { name: "Editar actividad ACT-1" })
    await user.click(within(form).getByRole("combobox", { name: "Tipo" }))
    await user.click(await screen.findByRole("option", { name: "Transversal" }))
    await user.click(within(form).getByRole("button", { name: "Guardar" }))

    await waitFor(() => expect(mutationCall("PATCH", "/activities/a1")).toBeDefined())
    expect(mutationCall("PATCH", "/activities/a1")?.body).toEqual({
      codigo: "ACT-1",
      nombre: "Taller de formación",
      semana_inicio: 1,
      semana_fin: 3,
      responsable_id: null,
      tipo: "TRANSVERSAL",
      objetivo_id: null,
    })
  })

  it("leaves tipo out of a patch that does not change it", async () => {
    const user = userEvent.setup()
    setup({ objetivoId: "o1" })

    await user.click(await screen.findByRole("button", { name: "Editar actividad ACT-1" }))
    const form = screen.getByRole("form", { name: "Editar actividad ACT-1" })
    await user.click(within(form).getByRole("button", { name: "Guardar" }))

    await waitFor(() => expect(mutationCall("PATCH", "/activities/a1")).toBeDefined())
    expect(mutationCall("PATCH", "/activities/a1")?.body).toEqual({
      codigo: "ACT-1",
      nombre: "Taller de formación",
      semana_inicio: 1,
      semana_fin: 3,
      responsable_id: null,
    })
  })
})
