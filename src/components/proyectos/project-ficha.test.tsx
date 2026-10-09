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

const TAB_NAMES = ["Resumen", "Estructura", "Avance", "Presupuesto", "Gastos", "Cambios"]

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
    expect(screen.getByText("1.200")).toBeInTheDocument()
    expect(screen.getByText("-$ 5.000.000")).toBeInTheDocument()

    // Las dos líneas, con la principal marcada de forma visible.
    expect(screen.getByText("Educación")).toBeInTheDocument()
    expect(screen.getByText("Salud")).toBeInTheDocument()
    expect(screen.getByText("Principal")).toBeInTheDocument()

    expect(screen.getByText("Barranquilla · Atlántico")).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1", expect.any(Object))
  })

  it("mounts the KPI panel after the technical execution in the Avance tab, with the unconfirmed badge", async () => {
    mockFichaAndAudit({ historial: [] })

    renderFicha()
    await openTab("Avance")

    const kpis = await screen.findByTestId("kpis")
    expect(kpis).toHaveTextContent("Indicadores")
    expect(await within(kpis).findByTestId("kpi-tecnico")).toHaveAttribute("data-color", "amarillo")
    expect(within(kpis).getByText("No confirmado")).toBeInTheDocument()
    expect(screen.getByTestId("ejecucion").compareDocumentPosition(kpis) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByTestId("financiero")).not.toBeInTheDocument()
  })

  it("mounts the modifications queue, the versions and the historial in the Cambios tab", async () => {
    mockFichaAndAudit({ historial: [] })

    renderFicha()
    await openTab("Cambios")

    const modificaciones = await screen.findByTestId("modificaciones")
    const versiones = screen.getByTestId("versiones")
    expect(modificaciones).toHaveTextContent("Modificaciones")
    expect(versiones).toHaveTextContent("Versiones")
    expect(modificaciones.compareDocumentPosition(versiones) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(versiones.compareDocumentPosition(screen.getByTestId("historial")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByTestId("gastos")).not.toBeInTheDocument()
  })

  it("explains the baseline is pending in the versions and modifications sections of a draft, without reading them", async () => {
    mockFichaAndAudit({ historial: [] }, 200, { ...PROYECTO, estado: "BORRADOR" })

    renderFicha()
    await openTab("Cambios")

    expect(await screen.findByText("La línea base aún no está aprobada.")).toBeInTheDocument()
    expect(screen.getByText(/línea base esté aprobada/i)).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/modifications") || String(url).endsWith("/versions"))).toBe(false)
  })

  it("mounts the team in Resumen and the technical structure only in the Estructura tab", async () => {
    mockFichaAndAudit({ historial: [] })

    renderFicha()

    expect(await screen.findByTestId("equipo")).toBeInTheDocument()
    expect(screen.queryByTestId("estructura")).not.toBeInTheDocument()
    await openTab("Estructura")
    const estructura = await screen.findByTestId("estructura")
    expect(estructura).toHaveTextContent("Estructura técnica")
    expect(screen.queryByTestId("equipo")).not.toBeInTheDocument()
  })

  it("offers the Excel template controls in the structure header only for a manager on a draft", async () => {
    mockFichaAndAudit({ historial: [] }, 200, { ...PROYECTO, estado: "BORRADOR" })

    renderFicha()
    await openTab("Estructura")

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
    await openTab("Estructura")

    await screen.findByTestId("estructura")
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/auth/me", expect.any(Object)))
    expect(screen.queryByTestId("estructura-plantilla")).not.toBeInTheDocument()
  })

  it("mounts the Presupuesto section and the Ficha financiera in the Presupuesto tab, and reads them only then", async () => {
    mockFichaAndAudit({ historial: [] })

    renderFicha()
    await screen.findByTestId("equipo")
    expect(fetchMock).not.toHaveBeenCalledWith("/api/v1/projects/p1/budget", expect.any(Object))
    await openTab("Presupuesto")

    const presupuesto = await screen.findByTestId("presupuesto")
    expect(presupuesto).toHaveTextContent("Presupuesto")
    const financiero = await screen.findByTestId("financiero")
    expect(financiero).toHaveTextContent("Ficha financiera")
    expect(presupuesto.compareDocumentPosition(financiero) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/budget", expect.any(Object)),
    )
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/financial-sheet", expect.any(Object)),
    )
  })

  it("mounts the Gastos section in the Gastos tab", async () => {
    mockFichaAndAudit({ historial: [] })

    renderFicha()
    await openTab("Gastos")

    const gastos = await screen.findByTestId("gastos")
    expect(gastos).toHaveTextContent("Gastos")
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/expenses", expect.any(Object)),
    )
  })

  it("mounts the technical execution section in the Avance tab", async () => {
    mockFichaAndAudit({ historial: [] })

    renderFicha()
    await openTab("Avance")

    const ejecucion = await screen.findByTestId("ejecucion")
    expect(ejecucion).toHaveTextContent("Ejecución técnica")
    expect(await within(ejecucion).findByTestId("semaforo-tecnico")).toBeInTheDocument()
  })

  /* ── Pestañas y encabezado fijo (S10 WU2) ───────────────────────────── */

  it("renders the six tabs in order with Resumen selected by default", async () => {
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
    await screen.findByTestId("equipo")
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/members", expect.any(Object)))

    for (const id of ["estructura", "presupuesto", "ejecucion", "kpis", "financiero", "gastos", "modificaciones", "versiones", "historial"]) {
      expect(screen.queryByTestId(id)).not.toBeInTheDocument()
    }
    const lazy = ["/budget", "/expenses", "/audit", "/modifications", "/versions", "/financial-sheet", "/technical-status", "/objectives"]
    for (const suffix of lazy) {
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes(suffix))).toBe(false)
    }

    await openTab("Gastos")
    await screen.findByTestId("gastos")
    expect(screen.queryByTestId("equipo")).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/expenses", expect.any(Object))
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
    await openTab("Gastos")
    expect(screen.getByTestId("ficha-header")).toBeInTheDocument()
  })

  it("does not read the KPIs for the header of a draft", async () => {
    mockFichaAndAudit({ historial: [] }, 200, { ...PROYECTO, estado: "BORRADOR" })

    renderFicha()

    await screen.findByTestId("ficha-header")
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/kpis"))).toBe(false)
    expect(screen.queryByText(/Semáforo técnico/)).not.toBeInTheDocument()
  })

  it("moves between tabs with the keyboard", async () => {
    mockFichaAndAudit({ historial: [] })
    const user = userEvent.setup()

    renderFicha()

    const resumen = await screen.findByRole("tab", { name: "Resumen" })
    resumen.focus()
    await user.keyboard("{ArrowRight}")
    expect(screen.getByRole("tab", { name: "Estructura" })).toHaveFocus()
    await user.keyboard("{Enter}")
    expect(screen.getByRole("tab", { name: "Estructura" })).toHaveAttribute("aria-selected", "true")
    expect(await screen.findByTestId("estructura")).toBeInTheDocument()
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

  function mockFichaAndAudit(auditBody: unknown, auditStatus = 200, proyecto: unknown = PROYECTO, kpis: unknown = KPIS_PANEL) {
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
      // Estructura técnica (S3): vacía; su comportamiento vive en project-estructura.test.tsx.
      const estructura = /\/(objectives|activities|deliverables|indicators)$/.exec(String(input))
      if (estructura) {
        const campo = { objectives: "objetivos", activities: "actividades", deliverables: "entregables", indicators: "indicadores" }[estructura[1]]
        return Promise.resolve(jsonResponse({ [campo as string]: [] }))
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
    await openTab("Cambios")

    expect(await screen.findByText("Historial")).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByTestId("historial-paso")).toHaveLength(1))

    const paso = screen.getByTestId("historial-paso")
    expect(paso).toHaveTextContent("Conversión")
    expect(paso).toHaveTextContent("Creación")
    // The JSON columns are surfaced readably, never dumped raw.
    expect(paso).toHaveTextContent("Prospección")
    expect(paso).not.toHaveTextContent("PROSPECCION")
    expect(paso).not.toHaveTextContent("fecha_adjudicacion")
  })

  it("shows an empty Historial state when the project has no movements", async () => {
    mockFichaAndAudit({ historial: [] })

    renderFicha()
    await openTab("Cambios")

    expect(await screen.findByText("Sin movimientos registrados.")).toBeInTheDocument()
    expect(screen.queryAllByTestId("historial-paso")).toHaveLength(0)
  })

  it("shows a readable Historial error state without hiding the ficha", async () => {
    mockFichaAndAudit(
      { error: "No pudimos cargar el historial del proyecto. Inténtalo de nuevo.", code: "INTERNAL_ERROR" },
      500,
    )

    renderFicha()
    await openTab("Cambios")

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
    await openTab("Cambios")

    const paso = await screen.findByTestId("historial-paso")
    expect(paso).toHaveTextContent("Edición")
    expect(paso).toHaveTextContent("Integrante del equipo")
    // The raw stored vocabulary must never leak into the UI.
    expect(paso).not.toHaveTextContent("proyecto_miembro")
  })

  it("mounts the Equipo section with the project's active members", async () => {
    mockFichaAndAudit({ historial: [] })

    renderFicha()

    const equipo = await screen.findByTestId("equipo")
    expect(equipo).toHaveTextContent("Equipo")
    expect(await within(equipo).findByText("Carla Ruiz")).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/members", expect.any(Object))
  })
})
