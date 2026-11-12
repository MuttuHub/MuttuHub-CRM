// «Qué falta» del Resumen (antes «Requiere atención», S14 P5; rediseño S2): pinta la lista que deriva el
// servidor, agrupa los indicadores bajo la meta en una sola fila y le da a cada fila la acción exacta que la
// resuelve según el permiso de quien mira. Las queries son reales; solo se burla `fetch`.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { RequiereAtencion, type AccionAtencion } from "./requiere-atencion"

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

const RETRASO = { tipo: "alerta_retraso", titulo: "Posible retraso", detalle: "El gasto va por debajo de lo programado." }
const RUBRO = { tipo: "rubro_sobreejecucion", titulo: "Rubro sobreejecutado", detalle: "R1 supera lo asignado.", rubro_id: "r1" }
const GASTO = {
  tipo: "gasto_observado",
  titulo: "Gasto pendiente por revisión",
  detalle: "Compra: supera lo asignado al rubro.",
  gasto_id: "g1",
}
const VENCIDA = {
  tipo: "actividad_atrasada",
  titulo: "Actividad atrasada",
  detalle: "1.3 Acompañamiento: vencida el 25 oct 2026 con avance 25 %.",
  actividad_id: "a13",
}
const SIN_SOPORTE = {
  tipo: "avance_sin_soporte",
  titulo: "Avance sin soporte",
  detalle: "Avance del 02 nov 2026 sin soporte adjunto.",
  avance_id: "v1",
}
const SOLICITUD = {
  tipo: "modificacion_pendiente",
  titulo: "Solicitud de modificación pendiente",
  detalle: "Traslado entre rubros: solicitada por Ana Pérez el 10 nov 2026.",
  solicitud_id: "s1",
}
const INDICADORES = [
  { tipo: "indicador_bajo_meta", titulo: "Indicador bajo la meta", detalle: "Unidades fortalecidas: 9 de meta 30.", indicador_id: "i1" },
  { tipo: "indicador_bajo_meta", titulo: "Indicador bajo la meta", detalle: "Personas formadas: 12 de meta 60.", indicador_id: "i2" },
]

const ACTIVIDAD = {
  id: "a13",
  proyecto_id: "p1",
  objetivo_id: "o1",
  codigo: "1.3",
  nombre: "Acompañamiento técnico a las unidades",
  semana_inicio: 1,
  semana_fin: 3,
  fecha_inicio: "2026-10-05",
  fecha_fin: "2026-10-25",
  peso: 1,
  responsable_id: "u7",
  fuera_de_duracion: false,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
}

const GASTO_DTO = {
  id: "g1",
  proyecto_id: "p1",
  rubro: { id: "r11", codigo: "R11", nombre: "Varios" },
  fecha_documento: "2026-11-01",
  periodo: "2026-11",
  tipo_soporte: "FACTURA_PROVEEDOR",
  tercero_nombre: "Papelería del Sinú",
  tercero_tipo_id: "NIT",
  numero_documento: "F-1",
  descripcion: "Compra",
  valor: "450000.00",
  subtotal: "450000.00",
  iva: "0.00",
  estado: "REGISTRADO",
  alerta_sobregasto: true,
  periodo_modificado: false,
  datos_incompletos: false,
  registrado_por_id: "u7",
  created_at: "2026-11-01T00:00:00Z",
  validado_por_id: null,
  validado_at: null,
  rechazado_por_id: null,
  rechazado_at: null,
  motivo_rechazo: null,
  anulado_por_id: null,
}

const fetchMock = vi.fn()

function mockApi({
  items = [] as unknown[],
  status = 200,
  rol = null as string | null,
  userId = "u9",
  miembros = [] as unknown[],
} = {}) {
  fetchMock.mockImplementation((input: unknown) => {
    const url = String(input)
    if (url.endsWith("/auth/me")) {
      return Promise.resolve(jsonResponse({ usuario: rol ? { id: userId, nombre: "Persona", rol } : null }))
    }
    if (url.endsWith("/attention")) {
      return Promise.resolve(
        status === 200
          ? jsonResponse({ corte: "2026-11-05", medible: true, items })
          : jsonResponse({ error: "boom", code: "INTERNAL_ERROR" }, status),
      )
    }
    if (url.endsWith("/members")) return Promise.resolve(jsonResponse({ miembros }))
    if (url.endsWith("/activities")) return Promise.resolve(jsonResponse({ actividades: [ACTIVIDAD] }))
    if (url.endsWith("/expenses")) {
      return Promise.resolve(jsonResponse({ gastos: [GASTO_DTO], totales: {}, resumen: {} }))
    }
    return Promise.resolve(jsonResponse({}))
  })
}

const MIEMBRO_COORDINADOR = {
  id: "m1",
  usuario: { id: "u7", nombre: "Andrés Torres", rol: "COORDINADOR" },
  agregado_por_id: "u1",
  created_at: "2026-10-01T00:00:00Z",
  removed_at: null,
}

function renderCard({
  estado = "EN_EJECUCION",
  onIrA,
  onAccion,
}: {
  estado?: string
  onIrA?: (destino: "actividades" | "finanzas" | "historial") => void
  onAccion?: (accion: AccionAtencion) => void
} = {}) {
  return render(
    <RequiereAtencion proyecto={{ id: "p1", estado: estado as never }} onIrA={onIrA} onAccion={onAccion} />,
    { wrapper: createWrapper() },
  )
}

describe("RequiereAtencion («Qué falta»)", () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => vi.unstubAllGlobals())

  it("titles the section «Qué falta · N» with a help, counting the rows after grouping the indicators", async () => {
    mockApi({ items: [RETRASO, ...INDICADORES] })

    renderCard()

    const seccion = screen.getByRole("region", { name: "Qué falta" })
    expect(await within(seccion).findByRole("heading", { name: "Qué falta · 2" })).toBeInTheDocument()
    const ayuda = within(seccion).getByRole("button", { name: "Ayuda: Qué falta" })
    await userEvent.setup().click(ayuda)
    expect(
      await screen.findByText("Lo que necesita una acción ahora. Cada fila te lleva al lugar exacto donde se resuelve."),
    ).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/attention", expect.any(Object))
  })

  it("keeps the server text for the rows the design does not redraw (delay and overspent rubro)", async () => {
    mockApi({ items: [RETRASO, RUBRO] })

    renderCard()

    expect(await screen.findByTestId("atencion-alerta_retraso")).toHaveTextContent("Posible retraso")
    expect(screen.getByTestId("atencion-alerta_retraso")).toHaveTextContent("El gasto va por debajo de lo programado.")
    expect(screen.getByTestId("atencion-rubro_sobreejecucion")).toHaveTextContent("R1 supera lo asignado.")
  })

  it("shows the empty state when there is nothing to flag", async () => {
    mockApi({ items: [] })

    renderCard()

    expect(await screen.findByText("Nada pendiente por ahora.")).toBeInTheDocument()
    expect(screen.queryByTestId("requiere-atencion-lista")).not.toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Qué falta" })).toBeInTheDocument()
  })

  it("shows a readable error state", async () => {
    mockApi({ status: 500 })

    renderCard()

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("No pudimos cargar lo que requiere atención. Inténtalo de nuevo.")
  })

  it("does not read the server for a draft and shows the empty state", async () => {
    renderCard({ estado: "BORRADOR" })

    expect(screen.getByText("Nada pendiente por ahora.")).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("offers no action unless the caller passes onIrA", async () => {
    mockApi({ items: [RETRASO, GASTO, VENCIDA] })

    renderCard()

    await screen.findByTestId("atencion-alerta_retraso")
    expect(screen.queryByRole("button", { name: /Ver |Registrar|Revisar/ })).not.toBeInTheDocument()
  })

  it("names an overdue activity with its code, due date and responsible, and offers to register its progress", async () => {
    mockApi({ items: [VENCIDA], rol: "COORDINADOR", userId: "u7", miembros: [MIEMBRO_COORDINADOR] })
    const onAccion = vi.fn()
    const user = userEvent.setup()

    renderCard({ onIrA: vi.fn(), onAccion })

    const fila = await screen.findByTestId("atencion-actividad_atrasada")
    expect(fila).toHaveTextContent("Actividad vencida")
    expect(await within(fila).findByText("1.3 Acompañamiento técnico a las unidades")).toBeInTheDocument()
    // Same calendar format as the rest of the ficha (`formatFechaCalendario`).
    expect(fila).toHaveTextContent("Venció el 25 oct 2026 sin llegar a su meta.")
    expect(await within(fila).findByText(/Le toca a Andrés Torres/)).toBeInTheDocument()

    await user.click(await within(fila).findByRole("button", { name: "Registrar avance de 1.3" }))
    expect(onAccion).toHaveBeenCalledWith({ tipo: "registrar-avance", actividadId: "a13" })
  })

  it("sends an overdue activity to Actividades for someone who cannot register progress", async () => {
    mockApi({ items: [VENCIDA], rol: "COLABORADOR", userId: "u3" })
    const onIrA = vi.fn()
    const user = userEvent.setup()

    renderCard({ onIrA, onAccion: vi.fn() })

    const fila = await screen.findByTestId("atencion-actividad_atrasada")
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/auth/me", expect.any(Object)))
    await user.click(await within(fila).findByRole("button", { name: "Ver actividades" }))
    expect(within(fila).queryByRole("button", { name: /Registrar avance/ })).not.toBeInTheDocument()
    expect(onIrA).toHaveBeenCalledWith("actividades")
  })

  it("falls back to the tab when the caller only passes onIrA", async () => {
    mockApi({ items: [VENCIDA], rol: "GERENCIA" })
    const onIrA = vi.fn()
    const user = userEvent.setup()

    renderCard({ onIrA })

    const fila = await screen.findByTestId("atencion-actividad_atrasada")
    await user.click(await within(fila).findByRole("button", { name: "Registrar avance de 1.3" }))
    expect(onIrA).toHaveBeenCalledWith("actividades")
  })

  it("shows the expense under review with its amount, supplier and rubro, and lets a manager review it", async () => {
    mockApi({ items: [GASTO], rol: "GERENCIA", userId: "u9" })
    const onAccion = vi.fn()
    const user = userEvent.setup()

    renderCard({ onIrA: vi.fn(), onAccion })

    const fila = await screen.findByTestId("atencion-gasto_observado")
    expect(fila).toHaveTextContent("Gasto por revisar")
    expect(await within(fila).findByText("$ 450.000 · Papelería del Sinú")).toBeInTheDocument()
    expect(fila).toHaveTextContent("Supera lo asignado al rubro R11 · Varios. Le toca a Gerencia validarlo o rechazarlo.")
    await user.click(await within(fila).findByRole("button", { name: "Revisar gasto" }))
    expect(onAccion).toHaveBeenCalledWith({ tipo: "revisar-gasto", gastoId: "g1" })
  })

  it("does not offer to review an expense to the manager who registered it, nor to a non-manager", async () => {
    mockApi({ items: [GASTO], rol: "GERENCIA", userId: "u7" })
    const onIrA = vi.fn()
    const user = userEvent.setup()

    const propio = renderCard({ onIrA, onAccion: vi.fn() })
    const fila = await screen.findByTestId("atencion-gasto_observado")
    await within(fila).findByText("$ 450.000 · Papelería del Sinú")
    await user.click(await within(fila).findByRole("button", { name: "Ver finanzas" }))
    expect(within(fila).queryByRole("button", { name: "Revisar gasto" })).not.toBeInTheDocument()
    expect(onIrA).toHaveBeenCalledWith("finanzas")
    propio.unmount()

    mockApi({ items: [GASTO], rol: "COORDINADOR", userId: "u3" })
    renderCard({ onIrA, onAccion: vi.fn() })
    const otra = await screen.findByTestId("atencion-gasto_observado")
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/auth/me", expect.any(Object)))
    expect(await within(otra).findByRole("button", { name: "Ver finanzas" })).toBeInTheDocument()
    expect(within(otra).queryByRole("button", { name: "Revisar gasto" })).not.toBeInTheDocument()
  })

  it("asks to attach the support of a progress record registered without one", async () => {
    mockApi({ items: [SIN_SOPORTE], rol: "ADMINISTRADOR" })
    const onAccion = vi.fn()
    const user = userEvent.setup()

    renderCard({ onIrA: vi.fn(), onAccion })

    const fila = await screen.findByTestId("atencion-avance_sin_soporte")
    expect(fila).toHaveTextContent("Avance sin soporte")
    expect(fila).toHaveTextContent("Avance del 02 nov 2026 sin soporte adjunto.")
    expect(fila).toHaveTextContent("Adjunta el archivo o el enlace que lo respalda.")
    await user.click(await within(fila).findByRole("button", { name: "Adjuntar soporte" }))
    expect(onAccion).toHaveBeenCalledWith({ tipo: "adjuntar-soporte", avanceId: "v1" })
  })

  it("shows a pending modification request to any reader and opens the requests of the Historial (AJ-09)", async () => {
    mockApi({ items: [SOLICITUD], rol: "COLABORADOR", userId: "u3" })
    const onAccion = vi.fn()
    const onIrA = vi.fn()
    const user = userEvent.setup()

    const conAccion = renderCard({ onIrA, onAccion })

    const fila = await screen.findByTestId("atencion-modificacion_pendiente")
    expect(fila).toHaveTextContent("Solicitud de modificación pendiente")
    expect(fila).toHaveTextContent("Traslado entre rubros: solicitada por Ana Pérez el 10 nov 2026.")
    expect(within(fila).getByText("Traslado entre rubros:").tagName).toBe("B")
    expect(fila).toHaveTextContent("Le toca a Gerencia aprobarla o rechazarla.")
    await user.click(within(fila).getByRole("button", { name: "Ver solicitudes" }))
    expect(onAccion).toHaveBeenCalledWith({ tipo: "ver-solicitudes" })
    expect(onIrA).not.toHaveBeenCalled()
    conAccion.unmount()

    // Without `onAccion` the row falls back to the tab where the requests live.
    renderCard({ onIrA })
    const otra = await screen.findByTestId("atencion-modificacion_pendiente")
    await user.click(within(otra).getByRole("button", { name: "Ver solicitudes" }))
    expect(onIrA).toHaveBeenCalledWith("historial")
  })

  it("groups the indicators below their goal in one row that opens the indicators", async () => {
    mockApi({ items: INDICADORES })
    const onAccion = vi.fn()
    const user = userEvent.setup()

    renderCard({ onIrA: vi.fn(), onAccion })

    const filas = await screen.findAllByTestId("atencion-indicador_bajo_meta")
    expect(filas).toHaveLength(1)
    expect(filas[0]).toHaveTextContent("2 indicadores bajo la meta")
    expect(filas[0]).toHaveTextContent("Unidades fortalecidas: 9 de meta 30.")
    expect(filas[0]).toHaveTextContent("Personas formadas: 12 de meta 60.")
    // T10 R6: the indicator's name in bold, as in the prototype.
    expect(within(filas[0]!).getByText("Unidades fortalecidas:").tagName).toBe("B")
    await user.click(within(filas[0]!).getByRole("button", { name: "Ver indicadores" }))
    expect(onAccion).toHaveBeenCalledWith({ tipo: "ver-indicadores" })
  })

  it("names a single indicator below its goal in the singular", async () => {
    mockApi({ items: [INDICADORES[0]] })

    renderCard()

    expect(await screen.findByTestId("atencion-indicador_bajo_meta")).toHaveTextContent("1 indicador bajo la meta")
  })

  it("sends the delay and overspent-rubro rows to Finanzas", async () => {
    mockApi({ items: [RETRASO, RUBRO] })
    const onIrA = vi.fn()
    const user = userEvent.setup()

    renderCard({ onIrA })

    await user.click(within(await screen.findByTestId("atencion-alerta_retraso")).getByRole("button", { name: "Ver finanzas" }))
    await user.click(within(screen.getByTestId("atencion-rubro_sobreejecucion")).getByRole("button", { name: "Ver finanzas" }))
    expect(onIrA.mock.calls.map(([destino]) => destino)).toEqual(["finanzas", "finanzas"])
  })

  it("makes every row action a full-width 44 px touch target on phones", async () => {
    mockApi({ items: [RETRASO, ...INDICADORES] })

    renderCard({ onIrA: vi.fn() })

    await screen.findByTestId("atencion-indicador_bajo_meta")
    for (const boton of screen.getAllByRole("button", { name: /^Ver / })) {
      expect(boton.className).toMatch(/(^|\s)h-11(\s|$)/)
      expect(boton.className).toMatch(/(^|\s)w-full(\s|$)/)
    }
  })
})
