// Historial › Registro de cambios (rediseño «Historial-propuesta» / «Interacciones-Historial»): las entradas se
// agrupan por día (hora de Bogotá), cada movimiento conocido se lee como una frase, con filtros por tipo y por
// persona y un pliegue de los días largos. Las queries son reales; solo se burla `fetch`.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectAuditEntry, ProjectListRow } from "@/hooks/projects"
import { ProjectHistorial } from "./project-historial"

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
  origen: "INDEPENDIENTE",
  cliente: { id: "c1", nombre: "Alcaldía" },
  responsable: null,
  fecha_inicio: "2026-10-05",
  fecha_fin: "2027-01-29",
  duracion_semanas: 17,
  valor_total: "83500000.00",
  diferencia_valor_oportunidad: null,
  alertas: [],
  beneficiarios_meta: null,
  lineas: [],
  municipios: [],
}

let secuencia = 0
function fila(over: Partial<ProjectAuditEntry>): ProjectAuditEntry {
  secuencia += 1
  return {
    id: `h${secuencia}`,
    created_at: "2026-11-06T02:50:00.000Z", // Thursday 05 nov 2026, 9:50 p. m. in Bogotá
    usuario_id: "u-laura",
    usuario_nombre: "Laura Jiménez",
    accion: "CREAR",
    entidad: "proyecto",
    entidad_id: "x",
    campo: null,
    valor_anterior: null,
    valor_nuevo: null,
    lote_id: null,
    ...over,
  }
}

const AVANCE = fila({
  entidad: "reporte_actividad",
  entidad_id: "rep-1",
  valor_nuevo: { actividad_id: "act-13", fecha: "2026-11-05", porcentaje: "50.00", observacion: "Se realizaron las visitas técnicas a las unidades." },
})
const ANULACION = fila({
  created_at: "2026-11-06T02:31:00.000Z",
  accion: "ANULAR",
  entidad: "reporte_actividad",
  entidad_id: "rep-0",
  valor_anterior: { porcentaje: "30.00", fecha: "2026-11-02T00:00:00.000Z" },
  valor_nuevo: { anulado_at: "2026-11-06T02:31:00.000Z", motivo_anulacion: "Reporte de prueba anterior." },
})
const GASTO = fila({
  created_at: "2026-11-02T15:10:00.000Z", // Monday 02 nov 2026, 10:10 a. m.
  usuario_id: "u-mateo",
  usuario_nombre: "Mateo Salazar",
  entidad: "gasto",
  entidad_id: "g-1",
  valor_nuevo: {
    rubro_id: "r-11",
    periodo: "2026-10",
    tercero_nombre: "Papelería del Sinú",
    tercero_tipo_id: "NIT",
    tercero_numero_id: "****4321",
    numero_documento: "FV-4007",
    descripcion: "Material de oficina para las jornadas",
    subtotal: "450000.00",
    iva: "0.00",
    valor: "450000.00",
    estado: "REGISTRADO",
    soportes: 1,
  },
})
const EDICION = fila({
  created_at: "2026-11-02T14:00:00.000Z",
  accion: "EDITAR",
  entidad: "proyecto",
  entidad_id: "p1",
  campo: "nombre",
  valor_anterior: "Fortalecimiento",
  valor_nuevo: "Fortalecimiento textil",
})

describe("ProjectHistorial (Registro de cambios)", () => {
  const fetchMock = vi.fn()

  function setup(
    historial: ProjectAuditEntry[] | null,
    { status = 200, onIrA }: { status?: number; onIrA?: (destino: "actividades" | "finanzas") => void } = {},
  ) {
    fetchMock.mockImplementation((input: unknown) => {
      const url = String(input)
      if (url.endsWith("/audit")) {
        if (historial === null) return new Promise(() => {})
        return Promise.resolve(
          status === 200 ? jsonResponse({ historial }) : jsonResponse({ error: "Falló el servidor." }, status),
        )
      }
      if (url.endsWith("/activities")) return Promise.resolve(jsonResponse({ actividades: [{ id: "act-13", codigo: "1.3", nombre: "Acompañamiento" }] }))
      if (url.endsWith("/deliverables")) return Promise.resolve(jsonResponse({ entregables: [] }))
      if (url.endsWith("/indicators")) return Promise.resolve(jsonResponse({ indicadores: [] }))
      if (url.endsWith("/budget")) {
        return Promise.resolve(jsonResponse({ rubros: [{ rubro_id: "r-11", codigo: "R11", nombre: "Varios" }] }))
      }
      return Promise.resolve(jsonResponse({}))
    })
    return render(<ProjectHistorial proyecto={PROYECTO} onIrA={onIrA} />, { wrapper: createWrapper() })
  }

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it("groups the movements by day, newest first, each with its time", async () => {
    setup([AVANCE, ANULACION, GASTO])

    await waitFor(() => expect(screen.getAllByTestId("historial-dia")).toHaveLength(2))
    const dias = screen.getAllByTestId("historial-dia")
    expect(within(dias[0]).getByRole("heading", { level: 4 })).toHaveTextContent("Jueves 05 nov 2026")
    expect(within(dias[1]).getByRole("heading", { level: 4 })).toHaveTextContent("Lunes 02 nov 2026")
    expect(within(dias[0]).getAllByTestId("historial-paso")).toHaveLength(2)
    expect(dias[0].querySelector("time")).toHaveTextContent(/9:50\sp\.\sm\./)
  })

  it("reads an avance as a sentence, with the activity code, the date and the observation", async () => {
    setup([AVANCE])

    const paso = await screen.findByTestId("historial-paso")
    await waitFor(() =>
      expect(paso).toHaveTextContent("Laura Jiménez registró 50 % en la actividad 1.3, con fecha 05 nov."),
    )
    expect(within(paso).getByText("Avance")).toBeInTheDocument()
    expect(paso).toHaveTextContent("«Se realizaron las visitas técnicas a las unidades.»")
  })

  it("reads a void with its motive, without struck text nor raw field names", async () => {
    const user = userEvent.setup()
    setup([ANULACION])

    const paso = await screen.findByTestId("historial-paso")
    expect(paso).toHaveTextContent("Laura Jiménez anuló el reporte de 30 % del 02 nov.")
    expect(paso).toHaveTextContent("Motivo: «Reporte de prueba anterior.» Ya no cuenta para el avance.")
    expect(paso).not.toHaveTextContent(/Anulado at|motivo_anulacion/i)
    expect(paso.querySelector(".line-through")).toBeNull()

    await user.click(within(paso).getByRole("button", { name: "Ayuda: Reporte anulado" }))
    expect(
      await screen.findByText("Un reporte anulado deja de contar para el avance, pero queda en el registro con su motivo."),
    ).toBeInTheDocument()
  })

  it("reads a gasto with its amount, its rubro and a summary without the third party's id", async () => {
    setup([GASTO])

    const paso = await screen.findByTestId("historial-paso")
    await waitFor(() =>
      expect(paso).toHaveTextContent("Mateo Salazar registró el gasto FV-4007 por $ 450.000 en el rubro Varios (R11)."),
    )
    expect(paso).toHaveTextContent(
      "Papelería del Sinú · Material de oficina para las jornadas · Octubre 2026 · Sin IVA · 1 soporte.",
    )
    expect(paso).not.toHaveTextContent("4321")
  })

  it("keeps the generic reading for other movements, with no struck text", async () => {
    setup([EDICION])

    const paso = await screen.findByTestId("historial-paso")
    expect(paso).toHaveTextContent("Laura Jiménez")
    expect(paso).toHaveTextContent("Nombre: Fortalecimiento → Fortalecimiento textil")
    expect(paso.querySelector(".line-through")).toBeNull()
  })

  it("filters by type, one at a time, keeping the day grouping", async () => {
    const user = userEvent.setup()
    setup([AVANCE, ANULACION, GASTO, EDICION])

    await waitFor(() => expect(screen.getAllByTestId("historial-paso")).toHaveLength(4))
    const mostrar = screen.getByRole("group", { name: "Mostrar" })
    // T10 H3: «MOSTRAR:» as a small caps label, as in the prototype (the colon is decoration, not the name).
    expect(document.getElementById(mostrar.getAttribute("aria-labelledby")!)!.className).toMatch(/(^|\s)uppercase(\s|$)/)
    expect(within(mostrar).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Todo",
      "Avances",
      "Gastos",
      "Anulaciones",
      "Cambios del plan",
    ])
    expect(within(mostrar).getByRole("button", { name: "Todo" })).toHaveAttribute("aria-pressed", "true")
    // T10 C10: as in the prototype, the active chip is dark (ink), not the primary pink.
    expect(within(mostrar).getByRole("button", { name: "Todo" }).className).toMatch(/(^|\s)bg-ink-900(\s|$)/)

    await user.click(within(mostrar).getByRole("button", { name: "Gastos" }))
    expect(within(mostrar).getByRole("button", { name: "Gastos" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getAllByTestId("historial-paso")).toHaveLength(1)
    expect(screen.getAllByTestId("historial-dia")).toHaveLength(1)
    expect(screen.getByTestId("historial-paso")).toHaveTextContent("FV-4007")

    await user.click(within(mostrar).getByRole("button", { name: "Anulaciones" }))
    expect(screen.getAllByTestId("historial-paso")).toHaveLength(1)
    expect(screen.getByTestId("historial-paso")).toHaveTextContent("anuló el reporte")

    await user.click(within(mostrar).getByRole("button", { name: "Avances" }))
    expect(screen.getAllByTestId("historial-paso")).toHaveLength(1)
    expect(screen.getByTestId("historial-paso")).toHaveTextContent("registró 50 %")
  })

  it("filters by person together with the type, and offers to clear both when nothing is left", async () => {
    const user = userEvent.setup()
    setup([AVANCE, ANULACION, GASTO])

    await waitFor(() => expect(screen.getAllByTestId("historial-paso")).toHaveLength(3))
    const persona = screen.getByRole("combobox", { name: "Persona" })
    expect(within(persona).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "todas",
      "Laura Jiménez",
      "Mateo Salazar",
    ])

    await user.selectOptions(persona, "Mateo Salazar")
    expect(screen.getAllByTestId("historial-paso")).toHaveLength(1)

    await user.click(screen.getByRole("button", { name: "Avances" }))
    expect(screen.queryByTestId("historial-paso")).not.toBeInTheDocument()
    expect(screen.getByText("No hay movimientos con estos filtros.")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Quitar filtros" }))
    expect(screen.getAllByTestId("historial-paso")).toHaveLength(3)
    expect(persona).toHaveValue("")
  })

  it("folds a long day behind «Ver N cambios más de este día» and moves the focus to the first one shown", async () => {
    const user = userEvent.setup()
    const dia = Array.from({ length: 7 }, (_, i) =>
      fila({
        created_at: `2026-11-05T1${i}:00:00.000Z`,
        entidad: "reporte_actividad",
        entidad_id: `rep-l${i}`,
        valor_nuevo: { actividad_id: "act-13", fecha: "2026-11-05", porcentaje: `${i + 1}.00`, observacion: "" },
      }),
    ).reverse()
    setup(dia)

    await waitFor(() => expect(screen.getAllByTestId("historial-paso")).toHaveLength(5))
    const mas = screen.getByRole("button", { name: "Ver 2 cambios más de este día" })
    expect(mas).toHaveAttribute("aria-expanded", "false")

    await user.click(mas)
    const pasos = screen.getAllByTestId("historial-paso")
    expect(pasos).toHaveLength(7)
    expect(pasos[5]).toHaveFocus()
    expect(screen.getByRole("button", { name: "Ver menos" })).toHaveAttribute("aria-expanded", "true")
  })

  it("links an avance to its activity and a gasto to Finanzas when the ficha can switch tabs", async () => {
    const user = userEvent.setup()
    const onIrA = vi.fn()
    setup([AVANCE, GASTO], { onIrA })

    await user.click(await screen.findByRole("button", { name: "Ver actividad 1.3" }))
    expect(onIrA).toHaveBeenCalledWith("actividades")
    // T10 H6: the link reads «Ver gasto», as in the prototype; its name keeps the invoice number.
    expect(screen.getByRole("button", { name: "Ver gasto FV-4007" })).toHaveTextContent(/^Ver gasto$/)
    await user.click(screen.getByRole("button", { name: "Ver gasto FV-4007" }))
    expect(onIrA).toHaveBeenCalledWith("finanzas")
  })

  it("shows no link without a way to switch tabs, nor for an activity it cannot name", async () => {
    const { unmount } = setup([AVANCE, GASTO])
    await screen.findAllByTestId("historial-paso")
    expect(screen.queryByRole("button", { name: /^Ver (actividad|gasto)/ })).not.toBeInTheDocument()
    unmount()

    const huerfano = fila({
      entidad: "reporte_actividad",
      entidad_id: "rep-9",
      valor_nuevo: { actividad_id: "act-borrada", fecha: "2026-11-05", porcentaje: "10.00", observacion: "" },
    })
    setup([huerfano], { onIrA: vi.fn() })
    expect(await screen.findByTestId("historial-paso")).toHaveTextContent("registró 10 %, con fecha 05 nov.")
    expect(screen.queryByRole("button", { name: /^Ver actividad/ })).not.toBeInTheDocument()
  })

  it("shows three skeleton blocks while loading, the error inline and the empty state", async () => {
    const { unmount } = setup(null)
    expect(screen.getAllByTestId("historial-cargando")).toHaveLength(3)
    unmount()

    const fallo = setup([], { status: 500 })
    expect(await screen.findByRole("alert")).toHaveTextContent("Falló el servidor.")
    fallo.unmount()

    setup([])
    expect(await screen.findByText("Sin movimientos registrados.")).toBeInTheDocument()
  })
})
