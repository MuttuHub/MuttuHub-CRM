// Sección "Estructura técnica" de la ficha (S3 U4). Las queries y las mutaciones
// son reales; solo se burla `fetch`, igual que en project-team.test.tsx.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectListRow, ProjectTechnicalObjective } from "@/hooks/projects"
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

const ROLLUP1: ProjectTechnicalObjective = {
  codigo: "OBJ-1",
  programado: 80,
  ejecutado: 60,
  desviacion_pp: 20,
  color: "amarillo",
}

/** Respuesta del estado técnico (S14 P6) con los acumulados por objetivo. */
const TECNICO = (objetivos: ProjectTechnicalObjective[]) => ({
  base: "vigente",
  corte: "2026-10-25",
  estado: "EN_EJECUCION",
  avance_real: 60,
  avance_programado: 80,
  desviacion_pp: 20,
  color: "amarillo",
  actividades: [],
  objetivos,
  umbrales: { umbral1: 10, umbral2: 20, confirmado: false },
})

type Setup = {
  rol?: "ADMINISTRADOR" | "GERENCIA" | "COORDINADOR" | "COLABORADOR"
  /** Si el usuario actual es integrante activo del proyecto. */
  miembro?: boolean
  proyecto?: Partial<ProjectListRow>
  objetivos?: unknown[]
  actividades?: unknown[]
  entregables?: unknown[]
  indicadores?: unknown[]
  listStatus?: number
  /** Acumulados por objetivo que devuelve el estado técnico (S14 P6). */
  rollups?: ProjectTechnicalObjective[]
  /** Estado HTTP del estado técnico; 200 devuelve los roll-ups. */
  tecnicoStatus?: number
  /** Respuesta forzada para una mutación: clave "METHOD sufijo-de-url". */
  overrides?: Record<string, Response>
}

/** Deleting a structure row asks first: confirm it in the dialog the trash button opens. */
async function confirmarEliminacion(user: ReturnType<typeof userEvent.setup>, nombre: string) {
  const dialogo = await screen.findByRole("dialog", { name: `¿Eliminar ${nombre}?` })
  await user.click(within(dialogo).getByRole("button", { name: "Eliminar" }))
}

describe("ProjectEstructura", () => {
  const fetchMock = vi.fn()

  function setup({
    rol = "ADMINISTRADOR",
    miembro = false,
    proyecto = {},
    objetivos = [OBJ1, OBJ2],
    actividades = [ACT1, ACT2],
    entregables = [ENT1],
    indicadores = [IND1],
    listStatus = 200,
    rollups = [],
    tecnicoStatus = 200,
    overrides = {},
  }: Setup = {}) {
    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"
      if (url.endsWith("/api/v1/auth/me")) {
        return Promise.resolve(jsonResponse({ usuario: { id: "u1", nombre: "Ana", rol } }))
      }
      if (url.endsWith("/projects/p1/members")) {
        return Promise.resolve(
          jsonResponse({
            miembros: miembro
              ? [
                  {
                    id: "m1",
                    usuario: { id: "u1", nombre: "Ana", rol },
                    agregado_por_id: "u1",
                    created_at: "2026-01-01T00:00:00.000Z",
                    removed_at: null,
                  },
                ]
              : [],
          }),
        )
      }
      if (url.endsWith("/api/v1/catalogs/users")) return Promise.resolve(jsonResponse({ users: USERS }))
      if (url.endsWith("/projects/p1/technical-status")) {
        return Promise.resolve(
          tecnicoStatus === 200
            ? jsonResponse(TECNICO(rollups))
            : jsonResponse(
                { error: "No pudimos calcular el semáforo técnico. Inténtalo de nuevo.", code: "INTERNAL_ERROR" },
                tecnicoStatus,
              ),
        )
      }
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
    it("no longer renders the week Gantt: it moved to its own tab", async () => {
      setup({ rol: "COORDINADOR" })

      await objetivo("OBJ-1")
      expect(screen.queryByTestId("gantt")).not.toBeInTheDocument()
      expect(screen.queryByTestId("gantt-bar-a1")).not.toBeInTheDocument()
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
      // AJ-02: the weight is its duration in weeks, so there is nothing a «Peso manual» badge could mark.
      expect(act).not.toHaveTextContent("Peso manual")
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

    it("shows the default empty text when a project past BORRADOR has no objectives", async () => {
      setup({ proyecto: { estado: "EN_EJECUCION" }, objetivos: [], actividades: [], entregables: [], indicadores: [] })

      expect(await screen.findByText("Este proyecto todavía no tiene objetivos.")).toBeInTheDocument()
    })

    it("shows a readable error when the structure cannot be loaded", async () => {
      setup({ listStatus: 500 })

      const alerta = await screen.findByRole("alert")
      expect(alerta).toHaveTextContent("No pudimos cargar la estructura.")
    })
  })

  describe("Metas e indicadores (S14 P6)", () => {
    it("labels the section as the tab it feeds", async () => {
      setup()

      const seccion = await screen.findByTestId("estructura")
      expect(within(seccion).getByText("Metas e indicadores")).toBeInTheDocument()
      expect(within(seccion).queryByText("Estructura técnica")).not.toBeInTheDocument()
    })

    it("shows each objective roll-up, reading the technical status once", async () => {
      setup({ proyecto: { estado: "EN_EJECUCION" }, rollups: [ROLLUP1] })

      const o1 = await objetivo("OBJ-1")
      const rollup = await within(o1).findByTestId("estructura-objetivo-rollup")
      expect(rollup).toHaveTextContent("60 %")
      expect(within(rollup).getByText("Semáforo: Amarillo")).toHaveAttribute("data-color", "amarillo")
      const o2 = await objetivo("OBJ-2")
      expect(within(o2).queryByTestId("estructura-objetivo-rollup")).not.toBeInTheDocument()
      expect(
        fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/technical-status")),
      ).toHaveLength(1)
    })

    it("shows no roll-up for a non-measurable project (BORRADOR)", async () => {
      setup({ proyecto: { estado: "BORRADOR" }, rollups: [ROLLUP1] })

      const o1 = await objetivo("OBJ-1")
      expect(within(o1).queryByTestId("estructura-objetivo-rollup")).not.toBeInTheDocument()
    })
  })

  describe("template import controls (S7)", () => {
    it("offers download and import to a manager on a BORRADOR project", async () => {
      setup()

      const controles = await screen.findByTestId("estructura-plantilla")
      expect(within(controles).getByRole("button", { name: /descargar plantilla/i })).toBeInTheDocument()
      expect(within(controles).getByRole("button", { name: /importar plantilla/i })).toBeInTheDocument()
    })

    it("shows them to a COLABORADOR member of the project (S5)", async () => {
      setup({ rol: "COLABORADOR", miembro: true })

      await objetivo("OBJ-1")
      const controles = await screen.findByTestId("estructura-plantilla")
      expect(within(controles).getByRole("button", { name: /descargar plantilla/i })).toBeInTheDocument()
      expect(within(controles).getByRole("button", { name: /importar plantilla/i })).toBeInTheDocument()
    })

    it("shows the Excel/manual entry points to a COLABORADOR member of an empty draft", async () => {
      setup({ rol: "COLABORADOR", miembro: true, objetivos: [], actividades: [], entregables: [], indicadores: [] })

      expect(await screen.findByRole("button", { name: "Cargar desde Excel" })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Crear a mano" })).toBeInTheDocument()
    })

    it("hides them from a non-manager role", async () => {
      setup({ rol: "COORDINADOR" })

      await objetivo("OBJ-1")
      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/auth/me", expect.any(Object)))
      expect(screen.queryByTestId("estructura-plantilla")).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: /importar plantilla/i })).not.toBeInTheDocument()
    })

    it("hides them from a manager once the project left BORRADOR", async () => {
      setup({ proyecto: { estado: "EN_EJECUCION" } })

      await objetivo("OBJ-1")
      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/auth/me", expect.any(Object)))
      expect(screen.queryByRole("button", { name: /descargar plantilla/i })).not.toBeInTheDocument()
    })
  })

  describe("PO structure import (B3)", () => {
    const PO = { name: "Importar estructura (formato PO)" }

    it("offers it to a manager on a BORRADOR project with structure", async () => {
      setup()
      expect(await screen.findByRole("button", PO)).toBeInTheDocument()
    })

    it("offers it on an empty draft next to the template entry points", async () => {
      setup({ objetivos: [], actividades: [], entregables: [], indicadores: [] })
      await screen.findByTestId("estructura-vacia")
      expect(screen.getByRole("button", PO)).toBeInTheDocument()
    })

    it("hides it from a non-member COORDINADOR", async () => {
      setup({ rol: "COORDINADOR" })
      await objetivo("OBJ-1")
      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/auth/me", expect.any(Object)))
      expect(screen.queryByRole("button", PO)).not.toBeInTheDocument()
    })

    it("hides it once the project left BORRADOR", async () => {
      setup({ proyecto: { estado: "EN_EJECUCION" } })
      await objetivo("OBJ-1")
      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/auth/me", expect.any(Object)))
      expect(screen.queryByRole("button", PO)).not.toBeInTheDocument()
    })
  })

  describe("empty draft: the Excel template is the primary way in (U6)", () => {
    const VACIO = { objetivos: [], actividades: [], entregables: [], indicadores: [] }

    it("offers 'Cargar desde Excel' as the primary action and 'Crear a mano' as the secondary one", async () => {
      setup(VACIO)

      const vacia = await screen.findByTestId("estructura-vacia")
      expect(within(vacia).getByRole("button", { name: "Cargar desde Excel" })).toBeInTheDocument()
      expect(within(vacia).getByRole("button", { name: "Crear a mano" })).toBeInTheDocument()
      expect(vacia).toHaveTextContent("Descarga la plantilla, complétala y súbela")
      // One set of Excel controls: the toolbar buttons wait until there is a structure.
      expect(screen.queryByTestId("estructura-plantilla")).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "Importar plantilla" })).not.toBeInTheDocument()
    })

    it("opens the import dialog from 'Cargar desde Excel'", async () => {
      const user = userEvent.setup()
      setup(VACIO)

      await user.click(await screen.findByRole("button", { name: "Cargar desde Excel" }))

      const dialogo = await screen.findByRole("dialog")
      expect(dialogo).toHaveTextContent("Importar plantilla de proyecto")
      expect(within(dialogo).getByRole("button", { name: "Descargar plantilla" })).toBeEnabled()
    })

    it("falls back to the manual form with 'Crear a mano'", async () => {
      const user = userEvent.setup()
      setup(VACIO)

      await user.click(await screen.findByRole("button", { name: "Crear a mano" }))

      expect(await screen.findByRole("button", { name: "Agregar objetivo" })).toBeInTheDocument()
      expect(screen.queryByTestId("estructura-vacia")).not.toBeInTheDocument()
    })

    it("says the dates are missing and blocks the template download until they are set", async () => {
      const user = userEvent.setup()
      setup({ ...VACIO, proyecto: { fecha_inicio: null, fecha_fin: null, duracion_semanas: null } })

      const vacia = await screen.findByTestId("estructura-vacia")
      expect(vacia).toHaveTextContent("Define las fechas del proyecto para poder descargar la plantilla.")

      await user.click(within(vacia).getByRole("button", { name: "Cargar desde Excel" }))
      const dialogo = await screen.findByRole("dialog")
      expect(within(dialogo).getByRole("button", { name: "Descargar plantilla" })).toBeDisabled()
    })

    it("gives a non-manager a short explanation instead of actions", async () => {
      setup({ ...VACIO, rol: "COORDINADOR" })

      const vacia = await screen.findByTestId("estructura-vacia")
      expect(vacia).toHaveTextContent("Aún no hay estructura")
      expect(vacia).toHaveTextContent("Quien gestiona proyectos")
      expect(screen.queryByRole("button", { name: "Cargar desde Excel" })).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "Crear a mano" })).not.toBeInTheDocument()
    })

    it("keeps download and import in the toolbar once there is a structure", async () => {
      setup()

      const controles = await screen.findByTestId("estructura-plantilla")
      expect(within(controles).getByRole("button", { name: /descargar plantilla/i })).toBeInTheDocument()
      expect(within(controles).getByRole("button", { name: /importar plantilla/i })).toBeInTheDocument()
      expect(screen.queryByTestId("estructura-vacia")).not.toBeInTheDocument()
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
      await confirmarEliminacion(user, "objetivo OBJ-2")

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

    it("offers no weight field and sends the chosen responsable (S4: the weight is not editable)", async () => {
      const user = userEvent.setup()
      setup()

      const o2 = await objetivo("OBJ-2")
      await user.click(within(o2).getByRole("button", { name: "Agregar actividad" }))
      const form = within(o2).getByRole("form", { name: "Nueva actividad" })
      expect(within(form).queryByLabelText("Peso (opcional)")).not.toBeInTheDocument()
      await user.type(within(form).getByLabelText("Código"), "ACT-9")
      await user.type(within(form).getByLabelText("Nombre"), "Seguimiento")
      await user.type(within(form).getByLabelText("Semana inicial"), "2")
      await user.type(within(form).getByLabelText("Semana final"), "4")
      await user.click(within(form).getByRole("combobox", { name: "Responsable" }))
      await user.click(await screen.findByRole("option", { name: "Luis Gómez" }))
      await user.click(within(form).getByRole("button", { name: "Guardar" }))

      await waitFor(() => expect(mutationCall("POST", "/activities")).toBeDefined())
      expect(mutationCall("POST", "/activities")?.body).toEqual({
        objetivo_id: "o2",
        codigo: "ACT-9",
        nombre: "Seguimiento",
        semana_inicio: 2,
        semana_fin: 4,
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

    it("keeps the weight out of the edit payload", async () => {
      const user = userEvent.setup()
      setup()

      await user.click(await screen.findByRole("button", { name: "Editar actividad ACT-1" }))
      const form = screen.getByRole("form", { name: "Editar actividad ACT-1" })
      expect(within(form).queryByLabelText("Peso (opcional)")).not.toBeInTheDocument()
      await user.click(within(form).getByRole("button", { name: "Guardar" }))

      await waitFor(() => expect(mutationCall("PATCH", "/activities/a1")).toBeDefined())
      expect(mutationCall("PATCH", "/activities/a1")?.body).not.toHaveProperty("peso")
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
      await confirmarEliminacion(user, "actividad ACT-1")

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
      await confirmarEliminacion(user, "entregable ENT-1")

      await waitFor(() => expect(mutationCall("DELETE", "/deliverables/e1")).toBeDefined())
    })

    it("asks before deleting and keeps the deliverable when the user cancels", async () => {
      const user = userEvent.setup()
      setup()

      await user.click(await screen.findByRole("button", { name: "Eliminar entregable ENT-1" }))

      const dialogo = await screen.findByRole("dialog", { name: "¿Eliminar entregable ENT-1?" })
      expect(mutationCall("DELETE", "/deliverables/e1")).toBeUndefined()
      await user.click(within(dialogo).getByRole("button", { name: "Cancelar" }))

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
      expect(mutationCall("DELETE", "/deliverables/e1")).toBeUndefined()
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
