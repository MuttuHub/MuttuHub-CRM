// Resumen de la ficha (U3; rediseño S2/S6): el aviso de Novedades, las tres cifras (Avance técnico, Gasto y
// Tiempo) con su color, su porqué y sus ayudas ⓘ, «Qué falta» con la acción de cada fila, y al lado los datos
// del proyecto y el equipo. En BORRADOR, «Próximos pasos» en lugar de cifras y «Qué falta». Las queries son
// reales; solo se burla `fetch`.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectListRow } from "@/hooks/projects"
import { FichaResumen, type AccionAtencion } from "./ficha-resumen"

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
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
  origen: "OPORTUNIDAD",
  cliente: { id: "c1", nombre: "Alcaldía" },
  responsable: { id: "u1", nombre: "Ana Pérez" },
  fecha_inicio: "2026-10-05",
  fecha_fin: "2027-01-29",
  duracion_semanas: 17,
  valor_total: "177360000.00",
  diferencia_valor_oportunidad: "-32640000.00",
  alertas: [],
  beneficiarios_meta: 500,
  lineas: [
    { id: "l1", codigo: "L1", nombre: "Productividad", principal: true },
    { id: "l2", codigo: "L2", nombre: "Emprendimiento", principal: false },
  ] as ProjectListRow["lineas"],
  municipios: [{ id: "m1", nombre: "Medellín", departamento: "Antioquia" }] as ProjectListRow["municipios"],
}

const tecnico = (color: string, real = 35.7, programado = 77.3) => ({
  corte: "2026-11-05", avance_real: real, avance_programado: programado, desviacion_pp: programado - real, color,
})
const financiero = (color: string, extra: Record<string, unknown> = {}) => ({
  corte: "2026-11-05", asignado: "100.00", programado: "50.00", ejecutado: "12.45", ea: 12.4, ep: 24.9, color, alerta_retraso: false, ...extra,
})

function kpis(overrides: Record<string, unknown> = {}) {
  return {
    base: "vigente", corte: "2026-11-05", estado: "EN_EJECUCION", medible: true, confirmado: false,
    tecnico: tecnico("rojo"), cronograma: null, entregables: null, indicadores: null, beneficiarios: null,
    financiero: financiero("verde"), ...overrides,
  }
}

describe("FichaResumen", () => {
  const fetchMock = vi.fn()

  function mockApi({
    kpisBody = kpis(),
    items = [] as unknown[],
    objetivos = [] as unknown[],
    actividades = [] as unknown[],
    suma = "0.00",
    rol = null as string | null,
  } = {}) {
    fetchMock.mockImplementation((input: unknown) => {
      const url = String(input)
      if (url.endsWith("/auth/me")) {
        return Promise.resolve(jsonResponse({ usuario: rol ? { id: "u9", nombre: "Gestor", rol } : null }))
      }
      if (url.includes("/catalogs/users")) return Promise.resolve(jsonResponse({ users: [] }))
      if (url.includes("/kpis")) return Promise.resolve(jsonResponse(kpisBody))
      if (url.includes("/attention")) return Promise.resolve(jsonResponse({ corte: "2026-11-05", medible: true, items }))
      if (url.endsWith("/objectives")) return Promise.resolve(jsonResponse({ objetivos }))
      if (url.endsWith("/activities")) return Promise.resolve(jsonResponse({ actividades }))
      if (url.endsWith("/budget")) {
        return Promise.resolve(jsonResponse({ estado: "BORRADOR", rubros: [], suma, valor_total: null, diferencia: null }))
      }
      if (url.endsWith("/members")) return Promise.resolve(jsonResponse({ miembros: [] }))
      return Promise.resolve(jsonResponse({}))
    })
  }

  function renderResumen(proyecto: ProjectListRow = PROYECTO, onIrA = vi.fn(), onAccion?: (accion: AccionAtencion) => void) {
    const resultado = render(<FichaResumen proyecto={proyecto} onIrA={onIrA} onAccion={onAccion} />, {
      wrapper: createWrapper(),
    })
    return Object.assign(onIrA, { unmount: resultado.unmount })
  }

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    window.localStorage.clear()
  })

  afterEach(() => vi.unstubAllGlobals())

  it("opens with the Novedades notice above the figures", async () => {
    mockApi()

    renderResumen()

    const aviso = screen.getByTestId("aviso-novedades")
    expect(aviso).toHaveTextContent("Novedades")
    const estado = await screen.findByTestId("resumen-estado")
    expect(aviso.compareDocumentPosition(estado) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it.each([
    ["verde", "Verde · al día"],
    ["amarillo", "Amarillo · atención"],
    ["rojo", "Rojo · en riesgo"],
  ])("names a %s technical figure as «%s», with the real progress against the planned one", async (color, label) => {
    mockApi({ kpisBody: kpis({ tecnico: tecnico(color) }) })

    renderResumen()

    const cifra = await screen.findByTestId("salud-tecnico")
    expect(cifra).toHaveAttribute("data-color", color)
    expect(within(cifra).getByRole("heading", { name: "Avance técnico" })).toBeInTheDocument()
    expect(cifra).toHaveTextContent(label)
    expect(cifra).toHaveTextContent("35,7 %")
    expect(cifra).toHaveTextContent("real de 77,3 % programado")
    expect(within(cifra).getByRole("progressbar", { name: "Avance real 35,7 % de 77,3 % programado" })).toBeInTheDocument()
  })

  it.each([
    [35.7, 77.3, "Va 41,6 puntos por debajo de lo programado al 05 de nov."],
    [80, 77, "Va 3 puntos por encima de lo programado al 05 de nov."],
    [50, 50, "Va igual a lo programado al 05 de nov."],
  ])("explains the technical gap in points (real %s, planned %s)", async (real, programado, frase) => {
    mockApi({ kpisBody: kpis({ tecnico: tecnico("amarillo", real, programado) }) })

    renderResumen()

    expect(await screen.findByTestId("salud-tecnico")).toHaveTextContent(frase)
  })

  it("explains the technical color and the planned progress with ⓘ helps", async () => {
    mockApi()
    const user = userEvent.setup()

    renderResumen()

    const cifra = await screen.findByTestId("salud-tecnico")
    await user.click(within(cifra).getByRole("button", { name: "Ayuda: Avance técnico" }))
    expect(
      await screen.findByText(
        "Compara el avance real de las actividades con el que deberían llevar a la fecha de corte. Gerencia aún no confirma los límites de cada color.",
      ),
    ).toBeInTheDocument()
    await user.keyboard("{Escape}")
    await user.click(within(cifra).getByRole("button", { name: "Ayuda: Avance programado" }))
    expect(
      await screen.findByText("Lo que el cronograma esperaba a la fecha de corte, según la duración de cada actividad."),
    ).toBeInTheDocument()
  })

  it("shows the spending as a share of what was planned to date, with its color and help", async () => {
    mockApi()
    const user = userEvent.setup()

    renderResumen()

    const cifra = await screen.findByTestId("salud-financiero")
    expect(cifra).toHaveAttribute("data-color", "verde")
    expect(within(cifra).getByRole("heading", { name: "Gasto" })).toBeInTheDocument()
    expect(cifra).toHaveTextContent("Verde · al día")
    expect(cifra).toHaveTextContent("24,9 %")
    expect(cifra).toHaveTextContent("de lo programado a hoy")
    expect(within(cifra).getByRole("progressbar", { name: "24,9 % de lo programado a hoy" })).toBeInTheDocument()
    expect(cifra).not.toHaveTextContent("posible retraso")
    await user.click(within(cifra).getByRole("button", { name: "Ayuda: % de lo programado" }))
    expect(
      await screen.findByText(
        "Lo gastado frente a lo que el presupuesto planeaba gastar hasta hoy. No es el porcentaje del valor total.",
      ),
    ).toBeInTheDocument()
  })

  it("warns about a possible delay under the spending figure, shorter on a phone", async () => {
    mockApi({ kpisBody: kpis({ financiero: financiero("amarillo", { alerta_retraso: true }) }) })

    renderResumen()

    const cifra = await screen.findByTestId("salud-financiero")
    const largo = within(cifra).getByText("Gasta poco mientras el avance técnico está atrasado: posible retraso.")
    const corto = within(cifra).getByText("Gasta poco y el avance está atrasado: posible retraso.")
    expect(largo.className).toMatch(/(^|\s)sm:inline(\s|$)/)
    expect(corto.className).toMatch(/(^|\s)sm:hidden(\s|$)/)
  })

  it("keeps today's «of the budget» reading when there is no spending plan", async () => {
    mockApi({ kpisBody: kpis({ financiero: financiero("verde", { ep: null, ea: 12.4 }) }) })

    renderResumen()

    const cifra = await screen.findByTestId("salud-financiero")
    expect(cifra).toHaveTextContent("12,4 %")
    expect(cifra).toHaveTextContent("ejecutado del presupuesto")
    expect(cifra).not.toHaveTextContent("de lo programado")
  })

  it("shows the time figure: dates, the week of the cut over the duration, value and beneficiaries", async () => {
    mockApi()

    renderResumen()

    const tiempo = await screen.findByTestId("cifra-tiempo")
    expect(within(tiempo).getByRole("heading", { name: "Tiempo" })).toBeInTheDocument()
    expect(tiempo).toHaveTextContent("05 de oct de 2026 → 29 de ene de 2027")
    expect(await within(tiempo).findByText("Semana 5")).toBeInTheDocument()
    expect(tiempo).toHaveTextContent("de 17")
    expect(within(tiempo).getByRole("progressbar", { name: "Semana 5 de 17" })).toBeInTheDocument()
    expect(tiempo).toHaveTextContent("Valor total $ 177.360.000 · 500 beneficiarios")
  })

  it("leaves out the beneficiaries without a goal and shows «—» without dates", async () => {
    mockApi()

    renderResumen({ ...PROYECTO, beneficiarios_meta: null, fecha_inicio: null, fecha_fin: null, duracion_semanas: null })

    const tiempo = await screen.findByTestId("cifra-tiempo")
    expect(tiempo).toHaveTextContent("— → —")
    expect(tiempo).not.toHaveTextContent("beneficiarios")
    expect(within(tiempo).queryByRole("progressbar")).not.toBeInTheDocument()
  })

  it("explains that a project that is not measurable has no figures yet, and still shows the time", async () => {
    mockApi({ kpisBody: kpis({ medible: false, tecnico: null, financiero: null }) })

    renderResumen({ ...PROYECTO, estado: "PLANIFICACION" })

    expect(await screen.findByText(/Los indicadores se calculan cuando el proyecto está en ejecución/)).toBeInTheDocument()
    expect(screen.queryByTestId("salud-tecnico")).not.toBeInTheDocument()
    expect(screen.getByTestId("cifra-tiempo")).toBeInTheDocument()
  })

  it("shows the readable error of the figures", async () => {
    fetchMock.mockImplementation((input: unknown) =>
      Promise.resolve(
        String(input).includes("/kpis")
          ? jsonResponse({ error: "boom", code: "INTERNAL_ERROR" }, 500)
          : jsonResponse({ corte: "2026-11-05", medible: true, items: [], miembros: [], usuario: null }),
      ),
    )

    renderResumen()

    expect(await screen.findByText("No pudimos cargar el estado del proyecto. Inténtalo de nuevo.")).toBeInTheDocument()
  })

  it("keeps the links from each figure to its tab", async () => {
    mockApi()
    const user = userEvent.setup()

    const onIrA = renderResumen()
    await user.click(within(await screen.findByTestId("salud-tecnico")).getByRole("button", { name: "Ver actividades" }))
    await user.click(within(screen.getByTestId("salud-financiero")).getByRole("button", { name: "Ver finanzas" }))

    expect(onIrA.mock.calls.map(([destino]) => destino)).toEqual(["actividades", "finanzas"])
  })

  it("lists «Qué falta» after the figures and hands each row action to the caller", async () => {
    mockApi({
      items: [{ tipo: "indicador_bajo_meta", titulo: "x", detalle: "Personas: 12 de meta 60.", indicador_id: "i1" }],
    })
    const user = userEvent.setup()
    const onAccion = vi.fn()

    renderResumen(PROYECTO, vi.fn(), onAccion)

    const falta = await screen.findByRole("region", { name: "Qué falta" })
    expect(screen.getByTestId("resumen-estado").compareDocumentPosition(falta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await user.click(await within(falta).findByRole("button", { name: "Ver indicadores" }))
    expect(onAccion).toHaveBeenCalledWith({ tipo: "ver-indicadores" })
  })

  it("shows «Datos del proyecto» next to «Qué falta», then the team, with no beneficiaries registry (M5)", async () => {
    mockApi()

    renderResumen()

    const datos = await screen.findByTestId("datos-generales")
    expect(within(datos).getByRole("heading", { name: "Datos del proyecto" })).toBeInTheDocument()
    for (const texto of [
      "ClienteAlcaldía",
      "OrigenDesde una oportunidad ganada",
      "Valor total$ 177.360.000",
      "Frente a la oportunidad-$ 32.640.000",
      "Beneficiarios500",
    ]) {
      expect(datos).toHaveTextContent(texto)
    }
    expect(datos).toHaveTextContent("Productividad")
    expect(datos).toHaveTextContent("Principal")
    expect(datos).toHaveTextContent("Medellín · Antioquia")
    expect(datos).not.toHaveTextContent("Diferencia valor oportunidad")
    const falta = screen.getByTestId("requiere-atencion")
    expect(falta.compareDocumentPosition(datos) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const equipo = await screen.findByTestId("equipo")
    expect(datos.compareDocumentPosition(equipo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByTestId("registro-beneficiarios")).not.toBeInTheDocument()
    expect(screen.queryByText("Registro de beneficiarios")).not.toBeInTheDocument()
  })

  it("omits the opportunity difference when it is null", async () => {
    mockApi()

    renderResumen({ ...PROYECTO, diferencia_valor_oportunidad: null })

    expect(await screen.findByTestId("datos-generales")).not.toHaveTextContent("Frente a la oportunidad")
  })

  it("shows the description in the project data, and hides it when there is none", async () => {
    mockApi()
    const primero = renderResumen({ ...PROYECTO, descripcion: "Alcance del convenio" })
    const datos = await screen.findByTestId("datos-generales")
    expect(within(datos).getByTestId("resumen-descripcion")).toHaveTextContent("Alcance del convenio")
    primero.unmount()

    renderResumen({ ...PROYECTO, descripcion: null })
    await screen.findByTestId("datos-generales")
    expect(screen.queryByTestId("resumen-descripcion")).not.toBeInTheDocument()
  })

  it("lets the figures and columns shrink so nothing overflows a 390 px screen", async () => {
    mockApi()

    renderResumen()

    const estado = await screen.findByTestId("resumen-estado")
    expect(estado.className).toMatch(/(^|\s)grid-cols-1(\s|$)/)
    expect(estado.className).toMatch(/(^|\s)md:grid-cols-3(\s|$)/)
    for (const cifra of [await screen.findByTestId("salud-tecnico"), screen.getByTestId("cifra-tiempo")]) {
      expect(cifra.className).toMatch(/(^|\s)min-w-0(\s|$)/)
    }
    for (const columna of screen.getAllByTestId("resumen-columna")) expect(columna.className).toMatch(/(^|\s)min-w-0(\s|$)/)
  })

  it("replaces the figures and «Qué falta» with the setup checklist in a draft, and shows the dates in the data", async () => {
    mockApi({ objetivos: [{ id: "o1" }], actividades: [{ id: "a1" }], suma: "1000.00" })

    renderResumen({ ...PROYECTO, estado: "BORRADOR" })

    await screen.findByTestId("proximos-pasos")
    expect(screen.queryByTestId("resumen-estado")).not.toBeInTheDocument()
    expect(screen.queryByTestId("requiere-atencion")).not.toBeInTheDocument()
    expect(screen.getByTestId("datos-generales")).toHaveTextContent("Fechas05 de oct de 2026 → 29 de ene de 2027 · 17 semanas")
    expect(screen.getByTestId("paso-datos")).toHaveAttribute("data-hecho", "true")
    await vi.waitFor(() => expect(screen.getByTestId("paso-estructura")).toHaveAttribute("data-hecho", "true"))
    await vi.waitFor(() => expect(screen.getByTestId("paso-presupuesto")).toHaveAttribute("data-hecho", "true"))
    expect(screen.getByTestId("paso-linea-base")).toHaveAttribute("data-hecho", "false")
    expect(screen.getByTestId("paso-linea-base")).toHaveTextContent(/Aprobar línea base/)
    expect(screen.queryByRole("button", { name: /Aprobar línea base/ })).not.toBeInTheDocument()
  })

  it("flags pending steps, hints the Excel load and links them to their tab", async () => {
    mockApi()
    const user = userEvent.setup()

    const onIrA = renderResumen({ ...PROYECTO, estado: "BORRADOR", valor_total: null })

    const estructura = await screen.findByTestId("paso-estructura")
    await vi.waitFor(() => expect(estructura).toHaveAttribute("data-hecho", "false"))
    expect(screen.getByTestId("paso-datos")).toHaveAttribute("data-hecho", "false")
    expect(estructura).toHaveTextContent("Puedes cargarlos desde Excel en Actividades.")
    await user.click(within(estructura).getByRole("button", { name: "Ir a Actividades" }))
    await user.click(within(screen.getByTestId("paso-presupuesto")).getByRole("button", { name: "Ir a Finanzas" }))
    expect(onIrA.mock.calls.map(([destino]) => destino)).toEqual(["actividades", "finanzas"])
  })

  describe("Editar datos generales (UX-3)", () => {
    const BOTON = { name: "Editar datos generales" }

    it.each(["ADMINISTRADOR", "GERENCIA"])("offers «Editar» to %s in a draft and while running", async (rol) => {
      mockApi({ rol })

      renderResumen({ ...PROYECTO, estado: "BORRADOR" })
      expect(await screen.findByRole("button", BOTON)).toHaveTextContent("Editar")
    })

    it.each(["COORDINADOR", "COLABORADOR"])("hides the edit button from %s (the PATCH is ADM/GER only)", async (rol) => {
      mockApi({ rol })

      renderResumen()
      await screen.findByTestId("datos-generales")
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/auth/me", expect.any(Object)))

      expect(screen.queryByRole("button", BOTON)).not.toBeInTheDocument()
    })

    it("hides the button in a state that allows no edits, even for GERENCIA", async () => {
      mockApi({ rol: "GERENCIA" })
      renderResumen({ ...PROYECTO, estado: "CERRADO" })
      await screen.findByTestId("datos-generales")
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/auth/me", expect.any(Object)))

      expect(screen.queryByRole("button", BOTON)).not.toBeInTheDocument()
    })

    // Z5-6: the unknown-user case (`usuario: null`) on a state that does allow edits was never mounted.
    it("hides the button while the user is unknown, in a state that allows edits", async () => {
      mockApi()
      renderResumen({ ...PROYECTO, estado: "BORRADOR" })
      await screen.findByTestId("datos-generales")
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/auth/me", expect.any(Object)))

      expect(screen.queryByRole("button", BOTON)).not.toBeInTheDocument()
    })

    it("opens the dialog with the execution fields, and its link closes it and goes to the Historial", async () => {
      mockApi({ rol: "GERENCIA" })
      const user = userEvent.setup()
      const onIrA = renderResumen()

      await user.click(await screen.findByRole("button", BOTON))
      const dialog = await screen.findByRole("dialog", { name: "Editar datos generales" })
      expect(within(dialog).queryByLabelText("Valor total")).not.toBeInTheDocument()

      await user.click(within(dialog).getByRole("button", { name: "Solicitar modificación" }))

      expect(onIrA).toHaveBeenCalledWith("historial")
      await vi.waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    })
  })
})
