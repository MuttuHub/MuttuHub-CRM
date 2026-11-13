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
    reporteActividad: { findMany: vi.fn() },
    soporteProyecto: { groupBy: vi.fn() },
    indicador: { findMany: vi.fn() },
    lineaPresupuestal: { findMany: vi.fn() },
    gasto: { findMany: vi.fn() },
    solicitudModificacion: { findMany: vi.fn() },
    usuario: { findMany: vi.fn() },
  },
}))
vi.mock("@/lib/api/kpis-portafolio", () => ({ loadKpisPortafolio: vi.fn() }))
vi.mock("@/lib/api/financiera", () => ({ loadGastosEjecutados: vi.fn() }))

import { db } from "@/lib/db"
import { loadKpisPortafolio } from "@/lib/api/kpis-portafolio"
import { loadGastosEjecutados } from "@/lib/api/financiera"
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
  vi.mocked(db.reporteActividad.findMany).mockResolvedValue([] as never)
  vi.mocked(db.soporteProyecto.groupBy).mockResolvedValue([] as never)
  vi.mocked(db.indicador.findMany).mockResolvedValue([] as never)
  vi.mocked(db.lineaPresupuestal.findMany).mockResolvedValue([] as never)
  vi.mocked(db.gasto.findMany).mockResolvedValue([] as never)
  vi.mocked(db.solicitudModificacion.findMany).mockResolvedValue([] as never)
  vi.mocked(db.usuario.findMany).mockResolvedValue([] as never)
  vi.mocked(loadKpisPortafolio).mockResolvedValue(new Map([["pry-1", kpisBase()]]))
  vi.mocked(loadGastosEjecutados).mockResolvedValue({ disponible: true, gastos: [] })
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
    vi.mocked(loadGastosEjecutados).mockResolvedValue({
      disponible: true,
      gastos: [{ rubroId: "r1", lineaId: "l1", periodo: "2026-03", valor: toCents("150.00"), estado: "VALIDADO" }],
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

  describe("activity reports (AJ-07)", () => {
    // Ended on 2026-02-01, half of its deliverable delivered: overdue at the 2026-03-15 corte.
    const vencida = {
      id: "a1",
      codigo: "A-01",
      nombre: "Actividad 1",
      semana_inicio: 1,
      semana_fin: 4,
      entregables: [{ id: "e1", codigo: "E-01", cantidad_meta: num("10") }],
    }
    const avance = { id: "av1", entregable_id: "e1", fecha: new Date("2026-02-01T00:00:00.000Z"), cantidad: num("5"), created_at: new Date("2026-02-01T12:00:00.000Z") }
    const reporte = (porcentaje: string) => ({ actividad_id: "a1", fecha: new Date("2026-02-20T00:00:00.000Z"), porcentaje: num(porcentaje) })
    const atrasadas = async () => {
      const result = await cargar()
      return result.ok ? result.value.items.filter((item) => item.tipo === "actividad_atrasada") : []
    }

    beforeEach(() => {
      vi.mocked(db.actividad.findMany).mockResolvedValue([vencida] as never)
      vi.mocked(db.avanceEntregable.findMany).mockResolvedValue([avance] as never)
      vi.mocked(db.soporteProyecto.groupBy).mockResolvedValue([{ avance_id: "av1", _count: { _all: 1 } }] as never)
    })

    it("shows the reported progress of an overdue activity, not only its deliverables", async () => {
      expect((await atrasadas()).map((item) => item.detalle)).toEqual([expect.stringContaining("con avance 50 %")])
      vi.mocked(db.reporteActividad.findMany).mockResolvedValue([reporte("70")] as never)
      expect((await atrasadas()).map((item) => item.detalle)).toEqual([expect.stringContaining("con avance 70 %")])
    })

    it("stops flagging an overdue activity whose report reached the tope", async () => {
      vi.mocked(db.reporteActividad.findMany).mockResolvedValue([reporte("90")] as never)
      expect(await atrasadas()).toEqual([])
    })

    it("reads only non-voided reports up to the corte, in chronological order", async () => {
      await cargar()
      expect(db.reporteActividad.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { proyecto_id: "pry-1", anulado_at: null, fecha: { lte: new Date("2026-03-15T00:00:00.000Z") } },
          orderBy: [{ fecha: "asc" }, { created_at: "asc" }],
        }),
      )
    })
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

  describe("pending modification requests (AJ-09)", () => {
    // Asked late on 10 Nov in Bogotá, which is already 11 Nov in UTC.
    const pendiente = {
      id: "s1",
      tipo: "TRASLADO",
      motivo: "Mover saldo a materiales",
      detalle: [],
      version_base_numero: 0,
      estado: "PENDIENTE",
      solicitado_por_id: "u7",
      solicitado_at: new Date("2026-11-11T02:30:00.000Z"),
      decidido_por_id: null,
      decidido_at: null,
      comentario_decision: null,
      version: null,
    }

    it("lists only the pending requests of the project, naming who asked and the Bogotá day, when asked to", async () => {
      vi.mocked(db.solicitudModificacion.findMany).mockResolvedValue([pendiente] as never)
      vi.mocked(db.usuario.findMany).mockResolvedValue([{ id: "u7", nombre: "Ana Pérez" }] as never)

      const result = await cargarAtencion({ proyecto: PROYECTO, corteParam: "2026-03-15", incluirSolicitudes: true })

      expect(db.solicitudModificacion.findMany).toHaveBeenCalledTimes(1)
      expect(db.solicitudModificacion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { proyecto_id: "pry-1", estado: "PENDIENTE" } }),
      )
      expect(db.usuario.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["u7"] } } }))
      const items = result.ok ? result.value.items : []
      expect(items).toHaveLength(1)
      expect(items[0]).toMatchObject({
        tipo: "modificacion_pendiente",
        titulo: "Solicitud de modificación pendiente",
        solicitud_id: "s1",
      })
      expect(items[0].detalle).toMatch(/^Traslado entre rubros: solicitada por Ana Pérez el 10 (de )?nov(\.)?( de)? 2026\.$/)
    })

    it("leaves the requests out, without reading them, for a caller that does not ask (the weekly report)", async () => {
      vi.mocked(db.solicitudModificacion.findMany).mockResolvedValue([pendiente] as never)

      const result = await cargar()

      expect(result).toEqual({ ok: true, value: { corte: "2026-03-15", medible: true, items: [] } })
      expect(db.solicitudModificacion.findMany).not.toHaveBeenCalled()
      expect(db.usuario.findMany).not.toHaveBeenCalled()
    })
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
