// Ficha de proyecto de solo lectura (E-06). Estas pruebas fijan lo observable:
// el estado cargado con sus campos (incluida la línea principal y los
// municipios), el esqueleto de carga y el estado de error legible para un
// 403/404. La query es real (`useProject`) y solo se burla `fetch`, igual que
// en projects.test.ts.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectListRow } from "@/hooks/projects"
import { ProjectFicha } from "./project-ficha"

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
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
  nombre: "Fortalecimiento de capacidades locales",
  estado: "EN_EJECUCION",
  origen: "OPORTUNIDAD",
  cliente: { id: "c1", nombre: "Alcaldía de Barranquilla" },
  responsable: { id: "u1", nombre: "Ana Pérez" },
  fecha_inicio: "2026-01-05",
  fecha_fin: "2026-03-30",
  duracion_semanas: 12,
  valor_total: "180000000.00",
  diferencia_valor_oportunidad: "-5000000.00",
  alertas: [],
  beneficiarios_meta: 1200,
  lineas: [
    { id: "l1", codigo: "LE-01", nombre: "Educación", principal: true },
    { id: "l2", codigo: "LE-02", nombre: "Salud", principal: false },
  ],
  municipios: [{ id: "m1", nombre: "Barranquilla", departamento: "Atlántico" }],
}

const KPIS_PANEL = {
  base: "vigente",
  corte: "2026-03-15",
  estado: "EN_EJECUCION",
  medible: true,
  confirmado: false,
  tecnico: { corte: "2026-03-15", avance_real: 30, avance_programado: 40, desviacion_pp: 10, color: "amarillo" },
  cronograma: null,
  entregables: null,
  indicadores: null,
  beneficiarios: null,
  financiero: null,
}

function renderFicha(projectId = "p1") {
  return render(<ProjectFicha projectId={projectId} backHref="/proyectos" />, {
    wrapper: createWrapper(),
  })
}

/** Los paneles de la ficha se montan solo con su pestaña activa. */
async function openTab(name: string) {
  const user = userEvent.setup()
  await user.click(await screen.findByRole("tab", { name }))
}

/** Historial groups modifications, versions and audit as segments; the audit log lives in "Auditoría". */
async function openAuditoria() {
  await openTab("Historial")
  await openTab("Auditoría")
}

const TAB_NAMES = ["Resumen", "Actividades", "Finanzas", "Documentos", "Historial"]

describe("ProjectFicha (page)", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("renders the loaded ficha fields, the principal line and the municipios", async () => {
    mockFichaAndAudit({ historial: [] })

    renderFicha()

    expect(await screen.findByText(PROYECTO.nombre)).toBeInTheDocument()
    expect(screen.getByText("PRY-2026-001")).toBeInTheDocument()
    expect(screen.getByText("En ejecución")).toBeInTheDocument()
    expect(screen.getByText("Desde una oportunidad ganada")).toBeInTheDocument()
    expect(screen.getByText("Alcaldía de Barranquilla")).toBeInTheDocument()
    expect(screen.getByText("Ana Pérez")).toBeInTheDocument()
    expect(screen.getByText("05 de ene de 2026")).toBeInTheDocument()
    expect(screen.getByText("30 de mar de 2026")).toBeInTheDocument()
    expect(screen.getByText("12 semanas")).toBeInTheDocument()
    expect(screen.getByText("$ 180.000.000")).toBeInTheDocument()
    // La meta aparece en el estado y en los datos generales.
    expect(screen.getAllByText("1.200")).toHaveLength(2)
    expect(screen.getByText("-$ 5.000.000")).toBeInTheDocument()

    // Las dos líneas, con la principal marcada de forma visible.
    expect(screen.getByText("Educación")).toBeInTheDocument()
    expect(screen.getByText("Salud")).toBeInTheDocument()
    expect(screen.getByText("Principal")).toBeInTheDocument()

    expect(screen.getByText("Barranquilla · Atlántico")).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1", expect.any(Object))
  })

  it("offers the Excel export from the header menu, with the unconfirmed badge, and not inside a tab", async () => {
    mockFichaAndAudit({ historial: [] })
    const user = userEvent.setup()

    renderFicha()
    await screen.findByTestId("ficha-header")
    expect(screen.queryByTestId("kpis")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Más acciones" }))
    await user.click(await screen.findByRole("menuitem", { name: "Exportar a Excel" }))

    const kpis = await screen.findByTestId("kpis")
    expect(kpis).toHaveTextContent("Exportar fichas")
    expect(await within(kpis).findByText("No confirmado")).toBeInTheDocument()
    expect(within(kpis).getByRole("button", { name: /Exportar ficha \(Excel\)/ })).toBeInTheDocument()

    await user.keyboard("{Escape}")
    await openTab("Historial")
    expect(within(screen.getByTestId("ficha-scroll")).queryByTestId("kpis")).not.toBeInTheDocument()
  })

  it("opens the Resumen with the health rows above the attention list and the fact sheet, reading the KPIs once", async () => {
    mockFichaAndAudit({ historial: [] }, 200, PROYECTO, {
      ...KPIS_PANEL,
      financiero: { corte: "2026-03-15", asignado: "100.00", programado: "50.00", ejecutado: "40.00", ea: 40, ep: 80, color: "verde", alerta_retraso: false },
    })

    renderFicha()

    const estado = await screen.findByTestId("resumen-estado")
    expect(await within(estado).findByTestId("salud-tecnico")).toHaveTextContent("Avance real 30 % frente a 40 % programado")
    expect(within(estado).getByTestId("salud-financiero")).toHaveTextContent("Ejecutado 80 % de lo programado")
    // Ya no hay la cuadrícula de seis tarjetas.
    expect(screen.queryByTestId("resumen-kpis")).not.toBeInTheDocument()
    expect(screen.queryByTestId(/^resumen-kpi-/)).not.toBeInTheDocument()
    const atencion = screen.getByTestId("requiere-atencion")
    expect(estado.compareDocumentPosition(atencion) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(atencion.compareDocumentPosition(screen.getByText("Origen")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/kpis"))).toHaveLength(1)
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/attention"))).toHaveLength(1)
    await openTab("Finanzas")
    expect(screen.queryByTestId("ficha-resumen")).not.toBeInTheDocument()
  })

  it("shows the positive empty state in the attention card of the Resumen", async () => {
    mockFichaAndAudit({ historial: [] })

    renderFicha()

    const atencion = await screen.findByTestId("requiere-atencion")
    expect(await within(atencion).findByText("Nada pendiente por ahora.")).toBeInTheDocument()
  })

  it("jumps to the tab that resolves each health row", async () => {
    mockFichaAndAudit({ historial: [] }, 200, PROYECTO, {
      ...KPIS_PANEL,
      financiero: { corte: "2026-03-15", asignado: "100.00", programado: "50.00", ejecutado: "40.00", ea: 40, ep: 80, color: "verde", alerta_retraso: false },
    })
    const user = userEvent.setup()

    renderFicha()
    await user.click(await screen.findByRole("button", { name: "Ver finanzas" }))
    expect(screen.getByRole("tab", { name: "Finanzas" })).toHaveAttribute("aria-selected", "true")

    // Finanzas has its own "Resumen" segment: the ficha tab is the first one in the document.
    await user.click(screen.getAllByRole("tab", { name: "Resumen" })[0])
    await user.click(await screen.findByRole("button", { name: "Ver actividades" }))
    expect(screen.getByRole("tab", { name: "Actividades" })).toHaveAttribute("aria-selected", "true")
  })

  it("shows the setup checklist instead of the health rows in the Resumen of a draft, without reading the KPIs", async () => {
    mockFichaAndAudit({ historial: [] }, 200, { ...PROYECTO, estado: "BORRADOR" })

    renderFicha()

    expect(await screen.findByTestId("proximos-pasos")).toBeInTheDocument()
    expect(screen.queryByTestId("resumen-estado")).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/kpis"))).toBe(false)
  })

  it("opens Historial on the modifications and mounts versions and audit from their segments", async () => {
    mockFichaAndAudit({ historial: [] })

    renderFicha()
    await openTab("Historial")

    expect(await screen.findByTestId("modificaciones")).toHaveTextContent("Modificaciones")
    expect(screen.queryByTestId("versiones")).not.toBeInTheDocument()
    expect(screen.queryByTestId("historial")).not.toBeInTheDocument()

    await openTab("Versiones")
    expect(await screen.findByTestId("versiones")).toHaveTextContent("Versiones")
    await openTab("Auditoría")
    expect(await screen.findByTestId("historial")).toBeInTheDocument()
    expect(screen.queryByTestId("gastos")).not.toBeInTheDocument()
  })

  it("explains the baseline is pending in the versions and modifications sections of a draft, without reading them", async () => {
    mockFichaAndAudit({ historial: [] }, 200, { ...PROYECTO, estado: "BORRADOR" })

    renderFicha()
    await openTab("Historial")

    expect(await screen.findByText(/línea base esté aprobada/i)).toBeInTheDocument()
    await openTab("Versiones")
    expect(await screen.findByText("La línea base aún no está aprobada.")).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/modifications") || String(url).endsWith("/versions"))).toBe(false)
  })

  it("mounts the team in the Resumen and the activities structure only in the Actividades tab", async () => {
    mockFichaAndAudit({ historial: [] }, 200, { ...PROYECTO, estado: "BORRADOR" })

    renderFicha()

    await screen.findByTestId("ficha-resumen")
    expect(await screen.findByTestId("equipo")).toBeInTheDocument()
    expect(screen.queryByTestId("actividades")).not.toBeInTheDocument()
    expect(screen.queryByTestId("estructura")).not.toBeInTheDocument()
    await openTab("Actividades")
    // In a draft the Lista is the editable structure; the Gantt is another view, not stacked below it.
    const estructura = await screen.findByTestId("estructura")
    expect(estructura).toHaveTextContent("Metas e indicadores")
    expect(screen.queryByTestId("equipo")).not.toBeInTheDocument()
    expect(screen.queryByTestId("gantt")).not.toBeInTheDocument()
  })

  it("shows the same activities once in Actividades: the old cronograma, gantt and seguimiento stack is gone", async () => {
    mockFichaAndAudit({ historial: [] })

    renderFicha()
    await screen.findByTestId("ficha-resumen")
    expect(screen.queryByTestId("ejecucion")).not.toBeInTheDocument()

    await openTab("Actividades")

    const ejecucion = await screen.findByTestId("ejecucion")
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/technical-status", expect.any(Object)),
    )
    for (const id of ["cronograma", "gantt", "estructura", "semaforo-tecnico", "seguimiento-lateral"]) {
      expect(screen.queryByTestId(id)).not.toBeInTheDocument()
    }
    expect(within(ejecucion).queryByRole("heading", { name: "Ficha de seguimiento" })).not.toBeInTheDocument()
  })

  it("mounts the week Gantt as a view of Actividades, only on request", async () => {
    mockFichaAndAudit({ historial: [] })
    const user = userEvent.setup()

    renderFicha()
    await screen.findByTestId("ficha-resumen")
    await openTab("Actividades")
    expect(screen.queryByTestId("gantt")).not.toBeInTheDocument()

    await user.click(await screen.findByRole("tab", { name: "Gantt" }))

    expect(await screen.findByTestId("gantt")).toBeInTheDocument()
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/objectives", expect.any(Object)),
    )
  })

  it("offers the Excel template controls in the structure header only for a manager on a draft", async () => {
    mockFichaAndAudit({ historial: [] }, 200, { ...PROYECTO, estado: "BORRADOR" }, KPIS_PANEL, {
      objetivos: [OBJETIVO_BASE],
    })

    renderFicha()
    await openTab("Actividades")

    const controles = await screen.findByTestId("estructura-plantilla")
    expect(controles).toHaveTextContent("Descargar plantilla")
    expect(controles).toHaveTextContent("Importar plantilla")
    expect(screen.getByTestId("estructura")).toContainElement(controles)
  })

  it("offers the baseline approval in the header for a manager on a draft, and not once approved", async () => {
    mockFichaAndAudit({ historial: [] }, 200, { ...PROYECTO, estado: "BORRADOR" })
    const draft = renderFicha()
    expect(await screen.findByRole("button", { name: "Aprobar línea base" })).toBeInTheDocument()
    draft.unmount()

    mockFichaAndAudit({ historial: [] })
    renderFicha()
    await screen.findByText(PROYECTO.nombre)
    expect(screen.queryByRole("button", { name: "Aprobar línea base" })).not.toBeInTheDocument()
  })

  it("does not offer the template controls once the project left BORRADOR", async () => {
    mockFichaAndAudit({ historial: [] })

    renderFicha()
    await openTab("Actividades")

    await screen.findByTestId("ejecucion")
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/auth/me", expect.any(Object)))
    expect(screen.queryByTestId("estructura")).not.toBeInTheDocument()
    expect(screen.queryByTestId("estructura-plantilla")).not.toBeInTheDocument()
  })

  it("opens Finanzas on the financial summary and mounts the budget only from its segment", async () => {
    mockFichaAndAudit({ historial: [] })
    const user = userEvent.setup()

    renderFicha()
    await screen.findByTestId("ficha-resumen")
    expect(fetchMock).not.toHaveBeenCalledWith("/api/v1/projects/p1/budget", expect.any(Object))
    await openTab("Finanzas")

    const financiero = await screen.findByTestId("financiero")
    expect(financiero).toHaveTextContent("Ficha financiera")
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/financial-sheet", expect.any(Object)),
    )
    expect(screen.queryByTestId("presupuesto")).not.toBeInTheDocument()

    await user.click(screen.getByRole("tab", { name: "Presupuesto" }))
    expect(await screen.findByTestId("presupuesto")).toHaveTextContent("Presupuesto")
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/budget", expect.any(Object)),
    )
  })

  it("mounts the Gastos section from the Finanzas segment", async () => {
    mockFichaAndAudit({ historial: [] })
    const user = userEvent.setup()

    renderFicha()
    await openTab("Finanzas")
    await user.click(await screen.findByRole("tab", { name: "Gastos" }))

    const gastos = await screen.findByTestId("gastos")
    expect(gastos).toHaveTextContent("Gastos")
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/expenses", expect.any(Object)),
    )
  })

  it("keeps the Beneficiarios registry at the end of the Resumen, collapsed and unread until opened", async () => {
    mockFichaAndAudit({ historial: [] })
    const user = userEvent.setup()

    renderFicha()

    const disclosure = await screen.findByTestId("registro-beneficiarios")
    expect(disclosure).toHaveTextContent("Registro de beneficiarios")
    expect(disclosure).not.toHaveAttribute("open")
    expect(screen.queryByTestId("ejecucion-beneficiarios-total")).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith("/api/v1/projects/p1/beneficiaries", expect.any(Object))

    await user.click(within(disclosure).getByText("Registro de beneficiarios"))

    expect(await screen.findByTestId("ejecucion-beneficiarios-total")).toHaveTextContent("1.200 beneficiarios")
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/beneficiaries", expect.any(Object))
  })

  it("mounts every project support in the Documentos tab, lazily", async () => {
    mockFichaAndAudit({ historial: [] })

    renderFicha()
    await screen.findByTestId("ficha-resumen")
    expect(screen.queryByTestId("documentos")).not.toBeInTheDocument()

    await openTab("Documentos")

    expect(await screen.findByTestId("documentos")).toBeInTheDocument()
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/supports", expect.any(Object)),
    )
  })

  it("mounts the execution Lista in Actividades, with the S-curve behind 'Opciones avanzadas', lazily", async () => {
    mockFichaAndAudit({ historial: [] })
    const user = userEvent.setup()

    renderFicha()
    await screen.findByTestId("ficha-resumen")
    expect(screen.queryByTestId("ejecucion")).not.toBeInTheDocument()

    await openTab("Actividades")

    await screen.findByTestId("ejecucion")
    expect(screen.queryByTestId("curve-s-chart")).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith("/api/v1/projects/p1/curve", expect.any(Object))

    await user.click(await screen.findByRole("button", { name: "Opciones avanzadas" }))
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/curve", expect.any(Object)),
    )
  })

  /* ── Pestañas y encabezado fijo (S10 WU2) ───────────────────────────── */

  it("renders the five tabs in order with Resumen selected by default", async () => {
    mockFichaAndAudit({ historial: [] })

    renderFicha()

    const tabs = await screen.findAllByRole("tab")
    expect(tabs.map((tab) => tab.textContent)).toEqual(TAB_NAMES)
    expect(screen.getByRole("tab", { name: "Resumen" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("tablist")).toBeInTheDocument()
  })

  it("mounts only the active tab content and fetches per tab (lazy)", async () => {
    mockFichaAndAudit({ historial: [] })

    renderFicha()
    await screen.findByTestId("ficha-resumen")

    for (const id of ["estructura", "cronograma", "gantt", "presupuesto", "ejecucion", "kpis", "financiero", "gastos", "modificaciones", "versiones", "historial", "soportes"]) {
      expect(screen.queryByTestId(id)).not.toBeInTheDocument()
    }
    const lazy = ["/budget", "/expenses", "/audit", "/modifications", "/versions", "/financial-sheet", "/technical-status", "/objectives", "/activities", "/supports", "/curve"]
    for (const suffix of lazy) {
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes(suffix))).toBe(false)
    }

    await openTab("Finanzas")
    await screen.findByTestId("financiero")
    expect(screen.queryByTestId("ficha-resumen")).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/financial-sheet", expect.any(Object))
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/expenses"))).toBe(false)
  })

  it("keeps the header (code, name, estado and both semáforo chips) outside the scrolling panel", async () => {
    mockFichaAndAudit({ historial: [] }, 200, PROYECTO, {
      ...KPIS_PANEL,
      financiero: {
        corte: "2026-03-15", asignado: "100.00", programado: "50.00", ejecutado: "40.00", ea: 40, ep: 80, color: "rojo", alerta_retraso: false,
      },
    })

    renderFicha()

    const header = await screen.findByTestId("ficha-header")
    expect(within(header).getByText("PRY-2026-001")).toBeInTheDocument()
    expect(within(header).getByText(PROYECTO.nombre)).toBeInTheDocument()
    expect(within(header).getByText("En ejecución")).toBeInTheDocument()
    expect(await within(header).findByText("Semáforo técnico: Amarillo")).toBeInTheDocument()
    expect(await within(header).findByText("Semáforo financiero: Rojo")).toBeInTheDocument()
    expect(screen.getByTestId("ficha-scroll")).not.toContainElement(header)
    await openTab("Finanzas")
    expect(screen.getByTestId("ficha-header")).toBeInTheDocument()
  })

  it("does not read the KPIs for the header of a draft", async () => {
    mockFichaAndAudit({ historial: [] }, 200, { ...PROYECTO, estado: "BORRADOR" })

    renderFicha()

    await screen.findByTestId("ficha-header")
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/kpis"))).toBe(false)
    expect(screen.queryByText(/Semáforo técnico/)).not.toBeInTheDocument()
  })

  function mockWithRole(rol: string, id = "u2") {
    const base = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation((input: unknown) =>
      String(input).endsWith("/api/v1/auth/me")
        ? Promise.resolve(jsonResponse({ usuario: { id, nombre: "Otra persona", rol } }))
        : base(input),
    )
  }

  it("switches to Actividades from the técnico chip and to Finanzas from the financiero chip", async () => {
    mockFichaAndAudit({ historial: [] }, 200, PROYECTO, {
      ...KPIS_PANEL,
      financiero: {
        corte: "2026-03-15", asignado: "100.00", programado: "50.00", ejecutado: "40.00", ea: 40, ep: 80, color: "rojo", alerta_retraso: false,
      },
    })
    const user = userEvent.setup()

    renderFicha()

    const header = await screen.findByTestId("ficha-header")
    await user.click(await within(header).findByRole("button", { name: "Semáforo técnico: Amarillo" }))
    expect(screen.getByRole("tab", { name: "Actividades" })).toHaveAttribute("aria-selected", "true")
    await user.click(within(header).getByRole("button", { name: "Semáforo financiero: Rojo" }))
    expect(screen.getByRole("tab", { name: "Finanzas" })).toHaveAttribute("aria-selected", "true")
  })

  it("shows the semáforo only in the header: Resumen carries no semáforo chip of its own", async () => {
    mockFichaAndAudit({ historial: [] })

    renderFicha()

    const header = await screen.findByTestId("ficha-header")
    await within(header).findByText("Semáforo técnico: Amarillo")
    expect(screen.getAllByText("Semáforo técnico: Amarillo")).toHaveLength(1)
  })

  it("offers Registrar avance as the primary action and Registrar gasto as secondary, and switches tabs", async () => {
    mockFichaAndAudit({ historial: [] })
    const user = userEvent.setup()

    renderFicha()

    const header = await screen.findByTestId("ficha-header")
    const avance = await within(header).findByRole("button", { name: "Registrar avance" })
    const gasto = within(header).getByRole("button", { name: "Registrar gasto" })
    expect(avance).toHaveClass("bg-primary")
    expect(gasto).not.toHaveClass("bg-primary")

    await user.click(gasto)
    expect(screen.getByRole("tab", { name: "Finanzas" })).toHaveAttribute("aria-selected", "true")
    await user.click(avance)
    expect(screen.getByRole("tab", { name: "Actividades" })).toHaveAttribute("aria-selected", "true")
  })

  it("hides the execution actions in a draft and for a user who cannot write", async () => {
    mockFichaAndAudit({ historial: [] }, 200, { ...PROYECTO, estado: "BORRADOR" })
    const draft = renderFicha()
    await screen.findByTestId("ficha-header")
    await screen.findByRole("button", { name: "Aprobar línea base" })
    expect(screen.queryByRole("button", { name: "Registrar avance" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Registrar gasto" })).not.toBeInTheDocument()
    draft.unmount()

    mockFichaAndAudit({ historial: [] })
    mockWithRole("COLABORADOR")
    renderFicha()
    await screen.findByTestId("ficha-header")
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/auth/me", expect.any(Object)))
    await screen.findByTestId("ficha-resumen")
    expect(screen.queryByRole("button", { name: "Registrar avance" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Registrar gasto" })).not.toBeInTheDocument()
  })

  it("shows the execution actions to a COORDINADOR member only while the project is running", async () => {
    mockFichaAndAudit({ historial: [] })
    mockWithRole("COORDINADOR", "u9")
    const running = renderFicha()
    expect(await screen.findByRole("button", { name: "Registrar avance" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Registrar gasto" })).toBeInTheDocument()
    running.unmount()

    mockFichaAndAudit({ historial: [] }, 200, { ...PROYECTO, estado: "CERRADO" })
    mockWithRole("COORDINADOR", "u9")
    renderFicha()
    await screen.findByTestId("ficha-header")
    await screen.findByTestId("ficha-resumen")
    expect(screen.queryByRole("button", { name: "Registrar avance" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Registrar gasto" })).not.toBeInTheDocument()
  })

  it("moves between tabs with the keyboard", async () => {
    mockFichaAndAudit({ historial: [] })
    const user = userEvent.setup()

    renderFicha()

    const resumen = await screen.findByRole("tab", { name: "Resumen" })
    resumen.focus()
    await user.keyboard("{ArrowRight}")
    expect(screen.getByRole("tab", { name: "Actividades" })).toHaveFocus()
    await user.keyboard("{Enter}")
    expect(screen.getByRole("tab", { name: "Actividades" })).toHaveAttribute("aria-selected", "true")
    expect(await screen.findByTestId("actividades")).toBeInTheDocument()
  })

  it("omits the difference field when it is null (nothing writes it yet)", async () => {
    mockFichaAndAudit(
      { historial: [] },
      200,
      { ...PROYECTO, diferencia_valor_oportunidad: null },
    )

    renderFicha()

    expect(await screen.findByText(PROYECTO.nombre)).toBeInTheDocument()
    expect(screen.queryByText("Diferencia valor oportunidad")).not.toBeInTheDocument()
    expect(screen.getByText("$ 180.000.000")).toBeInTheDocument()
  })

  it("links back to the project list from the loaded page", async () => {
    mockFichaAndAudit({ historial: [] })

    renderFicha()

    await screen.findByText(PROYECTO.nombre)
    const volver = screen.getByRole("link", { name: /Volver a proyectos/ })
    expect(volver).toHaveAttribute("href", "/proyectos")
    expect(volver).not.toHaveAttribute("target")
  })

  it("renders no dialog: the ficha is a plain page", async () => {
    mockFichaAndAudit({ historial: [] })

    renderFicha()

    await screen.findByText(PROYECTO.nombre)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("shows a not-found state with the back link for a 404", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ error: "El proyecto no existe.", code: "NOT_FOUND" }, 404)),
    )

    renderFicha()

    expect(await screen.findByRole("heading", { name: "Proyecto no encontrado" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Volver a proyectos/ })).toHaveAttribute("href", "/proyectos")
    expect(screen.queryByRole("tab")).not.toBeInTheDocument()
  })

  it("shows a forbidden state with the back link for a 403", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ error: "No tienes permisos sobre este proyecto.", code: "FORBIDDEN" }, 403)),
    )

    renderFicha()

    expect(await screen.findByRole("heading", { name: "No tienes acceso a este proyecto" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Volver a proyectos/ })).toHaveAttribute("href", "/proyectos")
  })

  it("keeps the back link visible while the ficha loads", () => {
    fetchMock.mockImplementation(() => new Promise(() => {}))

    renderFicha()

    expect(screen.getByRole("link", { name: /Volver a proyectos/ })).toHaveAttribute("href", "/proyectos")
  })

  it("shows a loading skeleton before the ficha arrives", () => {
    // Nunca resuelve: la query queda cargando.
    fetchMock.mockImplementation(() => new Promise(() => {}))

    renderFicha()

    expect(document.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(6)
    expect(screen.queryByText(PROYECTO.nombre)).not.toBeInTheDocument()
  })

  it("shows a readable error state instead of a blank page for a 403", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        jsonResponse(
          { error: "No tienes permisos sobre este proyecto.", code: "FORBIDDEN" },
          403,
        ),
      ),
    )

    renderFicha()

    const alerta = await screen.findByRole("alert")
    expect(alerta).toBeInTheDocument()
    expect(screen.getByText("No tienes permisos sobre este proyecto.")).toBeInTheDocument()
    expect(screen.queryByText(PROYECTO.nombre)).not.toBeInTheDocument()
  })

  it("shows the 404 envelope message when the project does not exist", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ error: "El proyecto no existe.", code: "NOT_FOUND" }, 404)),
    )

    renderFicha()

    await waitFor(() =>
      expect(screen.getByText("El proyecto no existe.")).toBeInTheDocument(),
    )
  })

  /* ── Historial (REQ-AUD-04) ─────────────────────────────────────────── */

  // The E-05 conversion writes both rows through one logChanges call: same
  // lote_id, same transaction instant. The ficha must read them as ONE step.
  const AUDITORIA = [
    {
      id: "aud-convertir",
      created_at: "2026-10-06T20:39:51.751Z",
      usuario_id: "u1",
      usuario_nombre: "Ana Pérez",
      accion: "CONVERTIR",
      entidad: "oportunidad",
      entidad_id: "op-1",
      campo: null,
      valor_anterior: { fase: "PROSPECCION", fecha_adjudicacion: null },
      valor_nuevo: { fase: "EJECUCION" },
      lote_id: "lote-1",
    },
    {
      id: "aud-crear",
      created_at: "2026-10-06T20:39:51.751Z",
      usuario_id: "u1",
      usuario_nombre: "Ana Pérez",
      accion: "CREAR",
      entidad: "proyecto",
      entidad_id: "p1",
      campo: null,
      valor_anterior: null,
      valor_nuevo: { codigo: "PRY-2026-001", nombre: PROYECTO.nombre, origen: "OPORTUNIDAD" },
      lote_id: "lote-1",
    },
  ]

  const MIEMBROS = [
    {
      id: "m1",
      usuario: { id: "u9", nombre: "Carla Ruiz", rol: "COORDINADOR" },
      agregado_por_id: "u1",
      created_at: "2026-10-07T13:00:00.000Z",
      removed_at: null,
    },
  ]

  const OBJETIVO_BASE = {
    id: "o1",
    proyecto_id: "p1",
    codigo: "OBJ-1",
    descripcion: "Fortalecer capacidades",
    orden: 1,
    created_at: "2026-10-08T00:00:00.000Z",
    updated_at: "2026-10-08T00:00:00.000Z",
  }

  const TECNICO = {
    base: "vigente",
    corte: "2026-10-25",
    estado: "EN_EJECUCION",
    avance_real: 21.4,
    avance_programado: 57.1,
    desviacion_pp: 35.7,
    color: "rojo",
    actividades: [],
    umbrales: { umbral1: 10, umbral2: 20, confirmado: false },
  }

  // Ficha financiera (S5 U6): sin gastos todavía; su comportamiento vive en project-financiero.test.tsx.
  const FINANCIERA = {
    base: "vigente",
    corte: "2026-01",
    estado: "EN_EJECUCION",
    ejecucion_disponible: false,
    rubros: [],
    total: {
      rubro_id: null, codigo: null, nombre: "Total", asignado: "0.00", programado: "0.00", ejecutado: "0.00",
      diferencia: "0.00", ep_decimas: null, ea_decimas: null, umbral_rojo: "0.00", color: null,
    },
    alerta_retraso: false,
    parametros: { tolerancia: 10, retraso: 70, confirmado: false },
  }

  function mockFichaAndAudit(
    auditBody: unknown,
    auditStatus = 200,
    proyecto: unknown = PROYECTO,
    kpis: unknown = KPIS_PANEL,
    estructuraLista: { objetivos?: unknown[] } = {},
  ) {
    fetchMock.mockImplementation((input: unknown) => {
      if (String(input).endsWith("/audit")) {
        return Promise.resolve(jsonResponse(auditBody, auditStatus))
      }
      if (String(input).endsWith("/members")) {
        return Promise.resolve(jsonResponse({ miembros: MIEMBROS }))
      }
      // Ejecución técnica (S4 U6): semáforo y beneficiarios vacíos.
      if (String(input).endsWith("/technical-status")) {
        return Promise.resolve(jsonResponse(TECNICO))
      }
      // Presupuesto (S5 U5): vacío; su comportamiento vive en project-presupuesto.test.tsx.
      if (String(input).endsWith("/budget")) {
        return Promise.resolve(
          jsonResponse({ estado: "EN_EJECUCION", rubros: [], suma: "0.00", valor_total: null, diferencia: null }),
        )
      }
      // Gastos (S6 U6): vacíos; su comportamiento vive en project-gastos.test.tsx.
      if (String(input).endsWith("/expenses")) {
        return Promise.resolve(jsonResponse({ gastos: [], totales: {} }))
      }
      // Indicadores (S9 U6): su comportamiento vive en project-kpis-panel.test.tsx.
      if (String(input).includes("/kpis")) {
        return Promise.resolve(jsonResponse(kpis))
      }
      // Requiere atención (S14 P5): vacío; su comportamiento vive en requiere-atencion.test.tsx.
      if (String(input).includes("/attention")) {
        return Promise.resolve(jsonResponse({ corte: "2026-03-15", medible: true, items: [] }))
      }
      if (String(input).includes("/financial-sheet")) {
        return Promise.resolve(jsonResponse(FINANCIERA))
      }
      if (String(input).endsWith("/programming")) {
        return Promise.resolve(
          jsonResponse({ estado: "EN_EJECUCION", periodos: [], filas: [], control_por_rubro: [], programacion_pendiente: true }),
        )
      }
      // Modificaciones y versiones (S8 U6): vacías; su comportamiento vive en project-modificaciones/versiones.test.tsx.
      if (String(input).endsWith("/modifications")) {
        return Promise.resolve(jsonResponse({ solicitudes: [] }))
      }
      if (String(input).endsWith("/versions")) {
        return Promise.resolve(jsonResponse({ versiones: [] }))
      }
      if (String(input).includes("/versions/compare")) {
        return Promise.resolve(jsonResponse({ desde: "0", hasta: "vigente", diferencias: [] }))
      }
      if (String(input).endsWith("/beneficiaries")) {
        return Promise.resolve(jsonResponse({ estado: "EN_EJECUCION", registros: [], total: 0 }))
      }
      // Soportes (v7): vacíos; su comportamiento vive en project-soportes.test.tsx.
      if (String(input).endsWith("/supports")) {
        return Promise.resolve(jsonResponse({ soportes: [] }))
      }
      // Curva S (Ficha de seguimiento): vacía; el gráfico se prueba aparte.
      if (String(input).endsWith("/curve")) {
        return Promise.resolve(jsonResponse({ base: "vigente", corte: "2026-03-15", periodos: [] }))
      }
      // Estructura técnica (S3): vacía; su comportamiento vive en project-estructura.test.tsx.
      const estructura = /\/(objectives|activities|deliverables|indicators)$/.exec(String(input))
      if (estructura) {
        const campo = { objectives: "objetivos", activities: "actividades", deliverables: "entregables", indicators: "indicadores" }[estructura[1]]
        const filas = campo === "objetivos" ? (estructuraLista.objetivos ?? []) : []
        return Promise.resolve(jsonResponse({ [campo as string]: filas }))
      }
      if (String(input).endsWith("/api/v1/auth/me")) {
        return Promise.resolve(
          jsonResponse({ usuario: { id: "u1", nombre: "Ana Pérez", rol: "ADMINISTRADOR" } }),
        )
      }
      return Promise.resolve(jsonResponse({ proyecto }))
    })
  }

  it("reads the conversion and the creation as one audited step, without raw JSON", async () => {
    mockFichaAndAudit({ historial: AUDITORIA })

    renderFicha()
    await openAuditoria()

    expect(await screen.findByTestId("historial")).toHaveTextContent("Historial")
    await waitFor(() => expect(screen.getAllByTestId("historial-paso")).toHaveLength(1))

    const paso = screen.getByTestId("historial-paso")
    expect(paso).toHaveTextContent("Conversión")
    expect(paso).toHaveTextContent("Creación")
    // The JSON columns are surfaced readably, never dumped raw.
    expect(paso).toHaveTextContent("Prospección")
    expect(paso).not.toHaveTextContent("PROSPECCION")
    expect(paso).not.toHaveTextContent("fecha_adjudicacion")
  })

  it("keeps the Historial readable: no uuids, no no-op rows, money and months formatted, sentence-case labels", async () => {
    const base = { usuario_id: "u1", usuario_nombre: "Ana Pérez", entidad_id: "x", created_at: "2026-10-06T20:39:51.751Z" }
    mockFichaAndAudit({
      historial: [
        { ...base, id: "h1", accion: "CREAR", entidad: "programacion", campo: "2026-11", valor_anterior: null, valor_nuevo: "14875000.00", lote_id: "l1" },
        { ...base, id: "h2", accion: "EDITAR", entidad: "gasto", campo: "alerta_sobregasto", valor_anterior: true, valor_nuevo: true, lote_id: "l1" },
        { ...base, id: "h3", accion: "EDITAR", entidad: "actividad", campo: "peso", valor_anterior: 1, valor_nuevo: 2, lote_id: "l1" },
        {
          ...base, id: "h4", accion: "CREAR", entidad: "actividad", campo: null, valor_anterior: null,
          valor_nuevo: { objetivo_id: "48e0a1b2-1111-4222-8333-444455556666", rubro_id: "00000000-0000-4000-8000-000000000009", codigo: "1.1" },
          lote_id: "l2",
        },
        { ...base, id: "h5", accion: "EDITAR", entidad: "gasto", campo: "alerta_sobregasto", valor_anterior: false, valor_nuevo: false, lote_id: "l3" },
      ],
    })

    renderFicha()
    await openAuditoria()

    await waitFor(() => expect(screen.getAllByTestId("historial-paso")).toHaveLength(2))
    const historial = screen.getByTestId("historial")
    expect(historial).toHaveTextContent("Noviembre 2026")
    expect(historial).toHaveTextContent("$ 14.875.000")
    expect(historial).toHaveTextContent("Peso:")
    expect(historial).toHaveTextContent("Código: 1.1")
    expect(historial).not.toHaveTextContent("Alerta de sobregasto")
    expect(historial).not.toHaveTextContent(/[0-9a-f]{8}-[0-9a-f]{4}-/)
    expect(historial).not.toHaveTextContent("objetivo_id")
    expect(historial).not.toHaveTextContent("14875000.00")
  })

  it("shows an empty Historial state when the project has no movements", async () => {
    mockFichaAndAudit({ historial: [] })

    renderFicha()
    await openAuditoria()

    expect(await screen.findByText("Sin movimientos registrados.")).toBeInTheDocument()
    expect(screen.queryAllByTestId("historial-paso")).toHaveLength(0)
  })

  it("shows a readable Historial error state without hiding the ficha", async () => {
    mockFichaAndAudit(
      { error: "No pudimos cargar el historial del proyecto. Inténtalo de nuevo.", code: "INTERNAL_ERROR" },
      500,
    )

    renderFicha()
    await openAuditoria()

    expect(await screen.findByText(PROYECTO.nombre)).toBeInTheDocument()
    const alerta = await screen.findByRole("alert")
    expect(alerta).toHaveTextContent(
      "No pudimos cargar el historial del proyecto. Inténtalo de nuevo.",
    )
  })

  it("labels a membership event with its human entity name, not the raw vocabulary", async () => {
    mockFichaAndAudit({
      historial: [
        {
          id: "aud-miembro",
          created_at: "2026-10-07T13:00:00.000Z",
          usuario_id: "u1",
          usuario_nombre: "Ana Pérez",
          accion: "EDITAR",
          entidad: "proyecto_miembro",
          entidad_id: "miembro-1",
          campo: "removed_at",
          valor_anterior: null,
          valor_nuevo: "2026-10-07T13:00:00.000Z",
          lote_id: "lote-miembro",
        },
      ],
    })

    renderFicha()
    await openAuditoria()

    const paso = await screen.findByTestId("historial-paso")
    expect(paso).toHaveTextContent("Edición")
    expect(paso).toHaveTextContent("Integrante del equipo")
    // The raw stored vocabulary must never leak into the UI.
    expect(paso).not.toHaveTextContent("proyecto_miembro")
  })

  it("mounts the Equipo section with the project's active members", async () => {
    mockFichaAndAudit({ historial: [] })

    renderFicha()
    await openTab("Resumen")

    const equipo = await screen.findByTestId("equipo")
    expect(equipo).toHaveTextContent("Equipo")
    expect(await within(equipo).findByText("Carla Ruiz")).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/members", expect.any(Object))
  })
})
