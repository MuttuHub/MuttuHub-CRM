// Sección "Estructura técnica" de la ficha (S3 U4). Las queries y las mutaciones
// son reales; solo se burla `fetch`, igual que en project-team.test.tsx.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectListRow } from "@/hooks/projects"
import { ProjectEstructura } from "./project-estructura"

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

const OBJ1 = { ...STAMP, id: "o1", codigo: "OBJ-1", descripcion: "Fortalecer capacidades", orden: 1 }
const OBJ2 = { ...STAMP, id: "o2", codigo: "OBJ-2", descripcion: "Medir resultados", orden: 2 }

const ACT1 = {
  ...STAMP,
  id: "a1",
  objetivo_id: "o1",
  codigo: "ACT-1",
  nombre: "Taller de formación",
  semana_inicio: 1,
  semana_fin: 3,
  fecha_inicio: "2026-01-05",
  fecha_fin: "2026-01-25",
  peso: 2.5,
  peso_manual: true,
  responsable_id: "u2",
  fuera_de_duracion: false,
}
const ACT2 = {
  ...ACT1,
  id: "a2",
  codigo: "ACT-2",
  nombre: "Informe final",
  semana_inicio: 10,
  semana_fin: 14,
  fecha_inicio: "2026-03-09",
  fecha_fin: "2026-04-12",
  peso: 5,
  peso_manual: false,
  responsable_id: null,
  fuera_de_duracion: true,
}

const ENT1 = {
  ...STAMP,
  id: "e1",
  actividad_id: "a1",
  codigo: "ENT-1",
  descripcion: "Acta de asistencia",
  cantidad_meta: "4.00",
  unidad: "actas",
  tipo_medio_exigido: "PDF firmado",
}

const IND1 = {
  ...STAMP,
  id: "i1",
  objetivo_id: "o1",
  codigo: "IND-1",
  nombre: "Personas formadas",
  meta: "100.00",
  unidad: "personas",
  linea_base: "20.00",
}

const USERS = [
  { id: "u1", nombre: "Ana Pérez" },
  { id: "u2", nombre: "Luis Gómez" },
]

type Setup = {
  rol?: "ADMINISTRADOR" | "GERENCIA" | "COORDINADOR"
  proyecto?: Partial<ProjectListRow>
  objetivos?: unknown[]
  actividades?: unknown[]
  entregables?: unknown[]
  indicadores?: unknown[]
  listStatus?: number
  /** Respuesta forzada para una mutación: clave "METHOD sufijo-de-url". */
  overrides?: Record<string, Response>
}

describe("ProjectEstructura", () => {
  const fetchMock = vi.fn()

  function setup({
    rol = "ADMINISTRADOR",
    proyecto = {},
    objetivos = [OBJ1, OBJ2],
    actividades = [ACT1, ACT2],
    entregables = [ENT1],
    indicadores = [IND1],
    listStatus = 200,
    overrides = {},
  }: Setup = {}) {
    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"
      if (url.endsWith("/api/v1/auth/me")) {
        return Promise.resolve(jsonResponse({ usuario: { id: "u1", nombre: "Ana", rol } }))
      }
      if (url.endsWith("/api/v1/catalogs/users")) return Promise.resolve(jsonResponse({ users: USERS }))
      const forced = Object.entries(overrides).find(
        ([key]) => key.split(" ")[0] === method && url.endsWith(key.split(" ")[1]),
      )
      if (forced) return Promise.resolve(forced[1])
      const lists: Record<string, [string, unknown[]]> = {
        objectives: ["objetivos", objetivos],
        activities: ["actividades", actividades],
        deliverables: ["entregables", entregables],
        indicators: ["indicadores", indicadores],
      }
      const match = /\/projects\/p1\/(objectives|activities|deliverables|indicators)$/.exec(url)
      if (match && method === "GET") {
        const [field, rows] = lists[match[1]]
        return Promise.resolve(
          listStatus === 200
            ? jsonResponse({ [field]: rows })
            : jsonResponse({ error: "No pudimos cargar la estructura.", code: "INTERNAL_ERROR" }, listStatus),
        )
      }
      if (match && method === "POST") return Promise.resolve(jsonResponse({ ok: true }, 201))
      return Promise.resolve(jsonResponse({ ok: true }))
    })
    return render(<ProjectEstructura proyecto={{ ...PROYECTO, ...proyecto }} />, {
      wrapper: createWrapper(),
    })
  }

  function mutationCall(method: string, suffix: string) {
    const call = fetchMock.mock.calls.find(
      ([url, init]) => (init?.method ?? "GET") === method && String(url).endsWith(suffix),
    )
    return call ? { url: String(call[0]), body: call[1].body ? JSON.parse(call[1].body) : undefined } : undefined
  }

  async function objetivo(codigo: string) {
    const cards = await screen.findAllByTestId("estructura-objetivo")
    const card = cards.find((c) => within(c).queryByText(codigo))
    if (!card) throw new Error(`objetivo ${codigo} not found`)
    return card
  }

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe("read model", () => {
    it("mounts the week Gantt for a read-only COORDINADOR too", async () => {
      setup({ rol: "COORDINADOR" })

      expect(await screen.findByTestId("gantt")).toBeInTheDocument()
      expect(await screen.findByTestId("gantt-bar-a1")).toBeInTheDocument()
    })

    it("lists objectives with their activity and indicator counts", async () => {
      setup()

      const o1 = await objetivo("OBJ-1")
      expect(o1).toHaveTextContent("Fortalecer capacidades")
      await waitFor(() => expect(o1).toHaveTextContent("2 actividades"))
      expect(o1).toHaveTextContent("1 indicador")
      const o2 = await objetivo("OBJ-2")
      await waitFor(() => expect(o2).toHaveTextContent("0 actividades"))
    })

    it("shows each activity with weeks, derived dates, weight and responsable", async () => {
      setup()

      const act = (await screen.findAllByTestId("estructura-actividad"))[0]
      expect(act).toHaveTextContent("ACT-1")
      expect(act).toHaveTextContent("Taller de formación")
      expect(act).toHaveTextContent("Semanas 1–3")
      expect(act).toHaveTextContent("05 de ene de 2026")
      expect(act).toHaveTextContent("25 de ene de 2026")
      expect(act).toHaveTextContent("Peso 2,5")
      expect(act).toHaveTextContent("Peso manual")
      await waitFor(() => expect(act).toHaveTextContent("Luis Gómez"))
    })

    it("marks activities that exceed the project duration, and only those", async () => {
      setup()

      const [a1, a2] = await screen.findAllByTestId("estructura-actividad")
      expect(a2).toHaveTextContent("Fuera de la duración del proyecto")
      expect(a2).not.toHaveTextContent("Peso manual")
      expect(a1).not.toHaveTextContent("Fuera de la duración del proyecto")
    })

    it("lists deliverables per activity and warns about activities without any", async () => {
      setup()

      const [a1, a2] = await screen.findAllByTestId("estructura-actividad")
      await waitFor(() => expect(within(a1).getByTestId("estructura-entregable")).toHaveTextContent("ENT-1"))
      const entregable = within(a1).getByTestId("estructura-entregable")
      expect(entregable).toHaveTextContent("Acta de asistencia")
      expect(entregable).toHaveTextContent("4 actas")
      expect(entregable).toHaveTextContent("PDF firmado")
      expect(within(a1).queryByTestId("estructura-sin-entregables")).not.toBeInTheDocument()
      expect(within(a2).getByTestId("estructura-sin-entregables")).toHaveTextContent(
        "no tiene entregables",
      )
    })

    it("lists indicators with goal, unit and baseline", async () => {
      setup()

      const o1 = await objetivo("OBJ-1")
      const indicador = await within(o1).findByTestId("estructura-indicador")
      expect(indicador).toHaveTextContent("IND-1")
      expect(indicador).toHaveTextContent("Personas formadas")
      expect(indicador).toHaveTextContent("100 personas")
      expect(indicador).toHaveTextContent("Línea base 20")
    })

    it("shows a loading skeleton while the structure loads", () => {
      fetchMock.mockImplementation(() => new Promise(() => {}))
      render(<ProjectEstructura proyecto={PROYECTO} />, { wrapper: createWrapper() })

      expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
    })

    it("shows an empty state when the project has no objectives", async () => {
      setup({ objetivos: [], actividades: [], entregables: [], indicadores: [] })

      expect(await screen.findByText("Este proyecto todavía no tiene objetivos.")).toBeInTheDocument()
    })

    it("shows a readable error when the structure cannot be loaded", async () => {
      setup({ listStatus: 500 })

      const alerta = await screen.findByRole("alert")
      expect(alerta).toHaveTextContent("No pudimos cargar la estructura.")
    })
  })

  describe("permissions", () => {
    it("is read-only for a non-manager role", async () => {
      setup({ rol: "COORDINADOR" })

      await objetivo("OBJ-1")
      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/auth/me", expect.any(Object)))
      expect(screen.queryByRole("button", { name: /Agregar/ })).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: /Editar/ })).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: /Eliminar/ })).not.toBeInTheDocument()
    })

    it("is read-only for a manager once the project left BORRADOR, and says why", async () => {
      setup({ proyecto: { estado: "EN_EJECUCION" } })

      await objetivo("OBJ-1")
      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/auth/me", expect.any(Object)))
      expect(screen.queryByRole("button", { name: /Agregar/ })).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: /Eliminar/ })).not.toBeInTheDocument()
      expect(screen.getByText(/solo se edita mientras el proyecto está en borrador/i)).toBeInTheDocument()
    })

    it("offers the controls to a manager on a BORRADOR project", async () => {
      setup({ rol: "GERENCIA" })

      expect(await screen.findByRole("button", { name: "Agregar objetivo" })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Editar objetivo OBJ-1" })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Eliminar objetivo OBJ-1" })).toBeInTheDocument()
    })
  })

  describe("objectives (manager, BORRADOR)", () => {
    it("creates an objective with codigo and descripcion", async () => {
      const user = userEvent.setup()
      setup()

      await user.click(await screen.findByRole("button", { name: "Agregar objetivo" }))
      const form = screen.getByRole("form", { name: "Nuevo objetivo" })
      await user.type(within(form).getByLabelText("Código"), "OBJ-3")
      await user.type(within(form).getByLabelText("Descripción"), "Escalar la intervención")
      await user.click(within(form).getByRole("button", { name: "Guardar" }))

      await waitFor(() => expect(mutationCall("POST", "/objectives")).toBeDefined())
      expect(mutationCall("POST", "/objectives")?.body).toEqual({
        codigo: "OBJ-3",
        descripcion: "Escalar la intervención",
      })
    })

    it("shows the server 409 inline when the code is duplicated", async () => {
      const user = userEvent.setup()
      setup({
        overrides: {
          "POST /objectives": jsonResponse(
            { error: "Ya existe un objetivo con ese código en el proyecto.", code: "CONFLICT" },
            409,
          ),
        },
      })

      await user.click(await screen.findByRole("button", { name: "Agregar objetivo" }))
      const form = screen.getByRole("form", { name: "Nuevo objetivo" })
      await user.type(within(form).getByLabelText("Código"), "OBJ-1")
      await user.type(within(form).getByLabelText("Descripción"), "Repetido")
      await user.click(within(form).getByRole("button", { name: "Guardar" }))

      expect(await within(form).findByRole("alert")).toHaveTextContent(
        "Ya existe un objetivo con ese código en el proyecto.",
      )
    })

    it("edits an objective with PATCH", async () => {
      const user = userEvent.setup()
      setup()

      await user.click(await screen.findByRole("button", { name: "Editar objetivo OBJ-1" }))
      const form = screen.getByRole("form", { name: "Editar objetivo OBJ-1" })
      const descripcion = within(form).getByLabelText("Descripción")
      expect(descripcion).toHaveValue("Fortalecer capacidades")
      await user.clear(descripcion)
      await user.type(descripcion, "Nueva descripción")
      await user.click(within(form).getByRole("button", { name: "Guardar" }))

      await waitFor(() => expect(mutationCall("PATCH", "/objectives/o1")).toBeDefined())
      expect(mutationCall("PATCH", "/objectives/o1")?.body).toEqual({
        codigo: "OBJ-1",
        descripcion: "Nueva descripción",
      })
    })

    it("deletes an objective and shows the server 409 when it still has children", async () => {
      const user = userEvent.setup()
      setup({
        overrides: {
          "DELETE /objectives/o2": jsonResponse(
            { error: "No puedes eliminar un objetivo que tiene actividades.", code: "CONFLICT" },
            409,
          ),
        },
      })

      await user.click(await screen.findByRole("button", { name: "Eliminar objetivo OBJ-2" }))

      const alerta = await screen.findByRole("alert")
      expect(alerta).toHaveTextContent("No puedes eliminar un objetivo que tiene actividades.")
      expect(mutationCall("DELETE", "/objectives/o2")).toBeDefined()
    })
  })

  describe("activities", () => {
    it("creates an activity with weeks and no dates, omitting an empty weight", async () => {
      const user = userEvent.setup()
      setup()

      const o2 = await objetivo("OBJ-2")
      await user.click(within(o2).getByRole("button", { name: "Agregar actividad" }))
      const form = within(o2).getByRole("form", { name: "Nueva actividad" })
      await user.type(within(form).getByLabelText("Código"), "ACT-9")
      await user.type(within(form).getByLabelText("Nombre"), "Seguimiento")
      await user.type(within(form).getByLabelText("Semana inicial"), "2")
      await user.type(within(form).getByLabelText("Semana final"), "4")
      await user.click(within(form).getByRole("button", { name: "Guardar" }))

      await waitFor(() => expect(mutationCall("POST", "/activities")).toBeDefined())
      expect(mutationCall("POST", "/activities")?.body).toEqual({
        objetivo_id: "o2",
        codigo: "ACT-9",
        nombre: "Seguimiento",
        semana_inicio: 2,
        semana_fin: 4,
      })
    })

    it("sends a manual weight and the chosen responsable", async () => {
      const user = userEvent.setup()
      setup()

      const o2 = await objetivo("OBJ-2")
      await user.click(within(o2).getByRole("button", { name: "Agregar actividad" }))
      const form = within(o2).getByRole("form", { name: "Nueva actividad" })
      await user.type(within(form).getByLabelText("Código"), "ACT-9")
      await user.type(within(form).getByLabelText("Nombre"), "Seguimiento")
      await user.type(within(form).getByLabelText("Semana inicial"), "1")
      await user.type(within(form).getByLabelText("Semana final"), "1")
      await user.type(within(form).getByLabelText("Peso (opcional)"), "3.5")
      await user.click(within(form).getByRole("combobox", { name: "Responsable" }))
      await user.click(await screen.findByRole("option", { name: "Luis Gómez" }))
      await user.click(within(form).getByRole("button", { name: "Guardar" }))

      await waitFor(() => expect(mutationCall("POST", "/activities")).toBeDefined())
      expect(mutationCall("POST", "/activities")?.body).toMatchObject({
        peso: 3.5,
        responsable_id: "u2",
      })
    })

    it("shows the server 400 inline for out-of-range weeks", async () => {
      const user = userEvent.setup()
      setup({
        overrides: {
          "POST /activities": jsonResponse(
            {
              error: "La semana final no puede superar la duración del proyecto (12 semanas).",
              code: "VALIDATION_ERROR",
            },
            400,
          ),
        },
      })

      const o2 = await objetivo("OBJ-2")
      await user.click(within(o2).getByRole("button", { name: "Agregar actividad" }))
      const form = within(o2).getByRole("form", { name: "Nueva actividad" })
      await user.type(within(form).getByLabelText("Código"), "ACT-9")
      await user.type(within(form).getByLabelText("Nombre"), "Seguimiento")
      await user.type(within(form).getByLabelText("Semana inicial"), "1")
      await user.type(within(form).getByLabelText("Semana final"), "99")
      await user.click(within(form).getByRole("button", { name: "Guardar" }))

      expect(await within(form).findByRole("alert")).toHaveTextContent(
        "La semana final no puede superar la duración del proyecto (12 semanas).",
      )
    })

    it("clears a manual weight on edit by sending null", async () => {
      const user = userEvent.setup()
      setup()

      await user.click(await screen.findByRole("button", { name: "Editar actividad ACT-1" }))
      const form = screen.getByRole("form", { name: "Editar actividad ACT-1" })
      const peso = within(form).getByLabelText("Peso (opcional)")
      expect(peso).toHaveValue("2.5")
      await user.clear(peso)
      await user.click(within(form).getByRole("button", { name: "Guardar" }))

      await waitFor(() => expect(mutationCall("PATCH", "/activities/a1")).toBeDefined())
      expect(mutationCall("PATCH", "/activities/a1")?.body).toMatchObject({ peso: null })
    })

    it("replaces the activity form with a hint when the project has no dates", async () => {
      setup({ proyecto: { fecha_inicio: null, fecha_fin: null, duracion_semanas: null } })

      const o2 = await objetivo("OBJ-2")
      expect(
        within(o2).getByText("Define las fechas del proyecto antes de crear actividades."),
      ).toBeInTheDocument()
      expect(within(o2).queryByRole("button", { name: "Agregar actividad" })).not.toBeInTheDocument()
    })

    it("deletes an activity and surfaces a 409 from the server", async () => {
      const user = userEvent.setup()
      setup({
        overrides: {
          "DELETE /activities/a1": jsonResponse(
            { error: "No puedes eliminar una actividad que tiene entregables.", code: "CONFLICT" },
            409,
          ),
        },
      })

      await user.click(await screen.findByRole("button", { name: "Eliminar actividad ACT-1" }))

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "No puedes eliminar una actividad que tiene entregables.",
      )
    })
  })

  describe("deliverables", () => {
    it("creates a deliverable with a numeric goal", async () => {
      const user = userEvent.setup()
      setup()

      const [, a2] = await screen.findAllByTestId("estructura-actividad")
      await user.click(await within(a2).findByRole("button", { name: "Agregar entregable" }))
      const form = within(a2).getByRole("form", { name: "Nuevo entregable" })
      await user.type(within(form).getByLabelText("Código"), "ENT-9")
      await user.type(within(form).getByLabelText("Descripción"), "Informe")
      await user.type(within(form).getByLabelText("Cantidad meta"), "2,5")
      await user.type(within(form).getByLabelText("Unidad"), "informes")
      await user.type(within(form).getByLabelText("Tipo de medio exigido"), "PDF")
      await user.click(within(form).getByRole("button", { name: "Guardar" }))

      await waitFor(() => expect(mutationCall("POST", "/deliverables")).toBeDefined())
      expect(mutationCall("POST", "/deliverables")?.body).toEqual({
        actividad_id: "a2",
        codigo: "ENT-9",
        descripcion: "Informe",
        cantidad_meta: 2.5,
        unidad: "informes",
        tipo_medio_exigido: "PDF",
      })
    })

    it("rejects a non-numeric goal before calling the server", async () => {
      const user = userEvent.setup()
      setup()

      const [, a2] = await screen.findAllByTestId("estructura-actividad")
      await user.click(await within(a2).findByRole("button", { name: "Agregar entregable" }))
      const form = within(a2).getByRole("form", { name: "Nuevo entregable" })
      await user.type(within(form).getByLabelText("Código"), "ENT-9")
      await user.type(within(form).getByLabelText("Descripción"), "Informe")
      await user.type(within(form).getByLabelText("Cantidad meta"), "abc")
      await user.type(within(form).getByLabelText("Unidad"), "informes")
      await user.type(within(form).getByLabelText("Tipo de medio exigido"), "PDF")
      await user.click(within(form).getByRole("button", { name: "Guardar" }))

      expect(await within(form).findByRole("alert")).toHaveTextContent("Ingresa un número válido.")
      expect(mutationCall("POST", "/deliverables")).toBeUndefined()
    })

    it("deletes a deliverable", async () => {
      const user = userEvent.setup()
      setup()

      await user.click(await screen.findByRole("button", { name: "Eliminar entregable ENT-1" }))

      await waitFor(() => expect(mutationCall("DELETE", "/deliverables/e1")).toBeDefined())
    })
  })

  describe("indicators", () => {
    it("creates an indicator and omits an empty baseline", async () => {
      const user = userEvent.setup()
      setup()

      const o2 = await objetivo("OBJ-2")
      await user.click(within(o2).getByRole("button", { name: "Agregar indicador" }))
      const form = within(o2).getByRole("form", { name: "Nuevo indicador" })
      await user.type(within(form).getByLabelText("Código"), "IND-9")
      await user.type(within(form).getByLabelText("Nombre"), "Cobertura")
      await user.type(within(form).getByLabelText("Meta"), "80")
      await user.type(within(form).getByLabelText("Unidad"), "%")
      await user.click(within(form).getByRole("button", { name: "Guardar" }))

      await waitFor(() => expect(mutationCall("POST", "/indicators")).toBeDefined())
      expect(mutationCall("POST", "/indicators")?.body).toEqual({
        objetivo_id: "o2",
        codigo: "IND-9",
        nombre: "Cobertura",
        meta: 80,
        unidad: "%",
      })
    })

    it("sends null to clear the baseline on edit", async () => {
      const user = userEvent.setup()
      setup()

      await user.click(await screen.findByRole("button", { name: "Editar indicador IND-1" }))
      const form = screen.getByRole("form", { name: "Editar indicador IND-1" })
      await user.clear(within(form).getByLabelText("Línea base (opcional)"))
      await user.click(within(form).getByRole("button", { name: "Guardar" }))

      await waitFor(() => expect(mutationCall("PATCH", "/indicators/i1")).toBeDefined())
      expect(mutationCall("PATCH", "/indicators/i1")?.body).toMatchObject({ linea_base: null, meta: 100 })
    })
  })
})
