// Loader of the "Requiere atención" list (S14 P5). The KPI block (medible, corte, alerta de retraso)
// is the reused source; the per-item rows are read in one batch. A missing source contributes nothing.

import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/settings", async () => {
  const { PARAMETROS_V2_DEFAULT } = await import("@/lib/proyectos/semaforo-v2")
  return { getSemaforoParametrosV2: vi.fn(async () => PARAMETROS_V2_DEFAULT) }
})
vi.mock("@/lib/db", () => ({
  db: {
    actividad: { findMany: vi.fn() },
    avanceEntregable: { findMany: vi.fn() },
    soporteProyecto: { groupBy: vi.fn() },
    indicador: { findMany: vi.fn() },
    lineaPresupuestal: { findMany: vi.fn() },
    gasto: { findMany: vi.fn() },
  },
}))
vi.mock("@/lib/api/kpis-portafolio", () => ({ loadKpisPortafolio: vi.fn() }))
vi.mock("@/lib/api/financiera", () => ({ loadGastosValidados: vi.fn() }))

import { db } from "@/lib/db"
import { loadKpisPortafolio } from "@/lib/api/kpis-portafolio"
import { loadGastosValidados } from "@/lib/api/financiera"
import { kpisProyecto, type KpisProyecto } from "@/lib/proyectos/kpis"
import { PARAMETROS_V2_DEFAULT } from "@/lib/proyectos/semaforo-v2"
import { toCents } from "@/lib/proyectos/money"
import { cargarAtencion } from "./atencion"

const PROYECTO = {
  id: "pry-1",
  estado: "EN_EJECUCION",
  fecha_inicio: new Date("2026-01-05T00:00:00.000Z"),
  fecha_fin: new Date("2026-06-30T00:00:00.000Z"),
  beneficiarios_meta: 100,
}

function kpisBase(over: Partial<KpisProyecto> = {}): KpisProyecto {
  return {
    ...kpisProyecto({
      corte: "2026-03-15",
      estado: "EN_EJECUCION",
      parametros: PARAMETROS_V2_DEFAULT,
      actividades: [],
      indicadores: [],
      beneficiarios: { total: 0, meta: null },
      financiero: { asignado: toCents("100"), programado: toCents("50"), ejecutado: toCents("40") },
    }),
    ...over,
  }
}

const num = (value: string) => ({ toString: () => value })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(db.actividad.findMany).mockResolvedValue([] as never)
  vi.mocked(db.avanceEntregable.findMany).mockResolvedValue([] as never)
  vi.mocked(db.soporteProyecto.groupBy).mockResolvedValue([] as never)
  vi.mocked(db.indicador.findMany).mockResolvedValue([] as never)
  vi.mocked(db.lineaPresupuestal.findMany).mockResolvedValue([] as never)
  vi.mocked(db.gasto.findMany).mockResolvedValue([] as never)
  vi.mocked(loadKpisPortafolio).mockResolvedValue(new Map([["pry-1", kpisBase()]]))
  vi.mocked(loadGastosValidados).mockResolvedValue({ disponible: true, gastos: [] })
})

const cargar = (corte: string | null = "2026-03-15") => cargarAtencion({ proyecto: PROYECTO, corteParam: corte })

describe("cargarAtencion", () => {
  it("returns an empty list with medible and the corte echoed when there is nothing to flag", async () => {
    const result = await cargar()
    expect(result).toEqual({ ok: true, value: { corte: "2026-03-15", medible: true, items: [] } })
  })

  it("flags a budget line whose executed amount exceeds its assigned amount", async () => {
    vi.mocked(db.lineaPresupuestal.findMany).mockResolvedValue([
      { rubro_id: "r1", monto_proyectado_cop: num("100.00"), rubro: { codigo: "R-01", nombre: "Materiales" } },
    ] as never)
    vi.mocked(loadGastosValidados).mockResolvedValue({
      disponible: true,
      gastos: [{ rubroId: "r1", periodo: "2026-03", valor: toCents("150.00"), estado: "VALIDADO" }],
    })

    const result = await cargar()
    expect(result.ok && result.value.items.map((item) => item.tipo)).toEqual(["rubro_sobreejecucion"])
    expect(result.ok && result.value.items[0]).toMatchObject({ rubro_id: "r1" })
  })

  it("reads an activity-shaped finish and flags a late activity plus an unsupported avance", async () => {
    vi.mocked(db.actividad.findMany).mockResolvedValue([
      {
        id: "a1",
        codigo: "A-01",
        nombre: "Actividad 1",
        semana_inicio: 1,
        semana_fin: 4,
        peso: num("1"),
        peso_manual: false,
        entregables: [{ id: "e1", codigo: "E-01", cantidad_meta: num("10") }],
      },
    ] as never)
    vi.mocked(db.avanceEntregable.findMany).mockResolvedValue([
      { id: "av1", entregable_id: "e1", fecha: new Date("2026-02-01T00:00:00.000Z"), cantidad: num("5"), created_at: new Date("2026-02-01T12:00:00.000Z") },
    ] as never)

    const result = await cargar()
    const tipos = result.ok ? result.value.items.map((item) => item.tipo) : []
    expect(tipos).toContain("actividad_atrasada")
    expect(tipos).toContain("avance_sin_soporte")
  })

  it("flags an indicator below its goal and an observed expense", async () => {
    vi.mocked(db.indicador.findMany).mockResolvedValue([
      {
        id: "i1",
        nombre: "Cobertura",
        meta: num("100"),
        mediciones: [{ fecha: new Date("2026-03-01T00:00:00.000Z"), valor: num("40"), created_at: new Date("2026-03-01T00:00:00.000Z") }],
      },
    ] as never)
    vi.mocked(db.gasto.findMany).mockResolvedValue([
      { id: "g1", descripcion: "Compra", estado: "REGISTRADO", alerta_sobregasto: true, tercero_tipo_id: "NIT", tercero_numero_id: "900123" },
    ] as never)

    const result = await cargar()
    const tipos = result.ok ? result.value.items.map((item) => item.tipo) : []
    expect(tipos).toContain("indicador_bajo_meta")
    expect(tipos).toContain("gasto_observado")
  })

  it("echoes the server's delay alert without recomputing it", async () => {
    vi.mocked(loadKpisPortafolio).mockResolvedValue(
      new Map([["pry-1", kpisBase({ financiero: { ...kpisBase().financiero!, alerta_retraso: true } })]]),
    )
    const result = await cargar()
    expect(result.ok && result.value.items.map((item) => item.tipo)).toEqual(["alerta_retraso"])
  })

  it("a non-measurable project yields an empty list without touching the per-item sources", async () => {
    vi.mocked(loadKpisPortafolio).mockResolvedValue(new Map([["pry-1", kpisBase({ medible: false })]]))
    const result = await cargar()
    expect(result).toEqual({ ok: true, value: { corte: "2026-03-15", medible: false, items: [] } })
    expect(db.actividad.findMany).not.toHaveBeenCalled()
  })

  it("409 without project dates and 400 for a bad corte", async () => {
    const sinFechas = await cargarAtencion({ proyecto: { ...PROYECTO, fecha_inicio: null }, corteParam: null })
    expect(sinFechas.ok).toBe(false)
    expect(sinFechas.ok === false && sinFechas.response.status).toBe(409)

    const malCorte = await cargar("basura")
    expect(malCorte.ok).toBe(false)
    expect(malCorte.ok === false && malCorte.response.status).toBe(400)
  })
})
