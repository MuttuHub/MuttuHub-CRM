// GET /api/v1/reports/tag (T2, S2–S5): the tag report composed from the portfolio loader (projects with the
// tag), the tagged clients with their opportunities and bitácora, and the tagged tasks.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Usuario } from "@prisma/client"

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }))
vi.mock("@/lib/settings", async (importOriginal) => {
  const { PARAMETROS_V2_DEFAULT } = await import("@/lib/proyectos/semaforo-v2")
  return { ...(await importOriginal<typeof import("@/lib/settings")>()), getSemaforoParametrosV2: vi.fn(async () => PARAMETROS_V2_DEFAULT) }
})
vi.mock("@/lib/db", () => ({
  db: {
    proyecto: { findMany: vi.fn() },
    cliente: { findMany: vi.fn() },
    oportunidad: { findMany: vi.fn() },
    bitacoraEntrada: { findMany: vi.fn(), groupBy: vi.fn() },
    tarea: { findMany: vi.fn() },
  },
}))
vi.mock("@/lib/api/kpis-portafolio", () => ({ loadKpisPortafolio: vi.fn() }))

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireApiUser } from "@/lib/supabase/server"
import { loadKpisPortafolio } from "@/lib/api/kpis-portafolio"
import { kpisProyecto } from "@/lib/proyectos/kpis"
import { toCents } from "@/lib/proyectos/money"
import { PARAMETROS_V2_DEFAULT } from "@/lib/proyectos/semaforo-v2"
import { buildOpenApiDocument } from "@/lib/openapi/document"
import { GET } from "./route"

const user = (rol: string, gestiona_oportunidades = false) =>
  ({ id: `${rol}-1`, rol, gestiona_oportunidades, puede_ver_tablero_gerencial: false }) as unknown as Usuario
const auth = (usuario: Usuario) => vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never })
const get = (qs: string) => new Request(`http://localhost/api/v1/reports/tag${qs}`)
const ETIQUETA = "?etiqueta=F%C3%A1brica%20Milagro"

const fila = (id: string) => ({
  id,
  codigo: `PRY-${id}`,
  nombre: `Proyecto ${id}`,
  estado: "EN_EJECUCION",
  fecha_inicio: new Date("2026-01-05T00:00:00.000Z"),
  fecha_fin: new Date("2026-12-30T00:00:00.000Z"),
  beneficiarios_meta: 10,
  cliente: { id: "c1", nombre: "Acme" },
  responsable: { id: "r1", nombre: "Ana" },
  lineas: [],
})
const kpis = (asignado: string, programado: string, ejecutado: string) =>
  kpisProyecto({
    corte: "2026-10-29",
    estado: "EN_EJECUCION",
    parametros: PARAMETROS_V2_DEFAULT,
    actividades: [],
    indicadores: [],
    beneficiarios: { total: 0, meta: 10 },
    financiero: { asignado: toCents(asignado), programado: toCents(programado), ejecutado: toCents(ejecutado) },
  })

const tarea = (id: string, estado: string, fecha_entrega: string | null) => ({
  id,
  titulo: `Tarea ${id}`,
  estado,
  fecha_entrega: fecha_entrega ? new Date(fecha_entrega) : null,
  completed_at: null,
  responsable: { id: "r1", nombre: "Ana" },
  cliente: { id: "c1", nombre: "Acme" },
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-10-29T15:00:00.000Z"))
  auth(user("GERENCIA"))
  vi.mocked(db.proyecto.findMany).mockImplementation((async (args: { select: Record<string, unknown> }) => {
    if ("lineas" in args.select) return [fila("p1"), fila("p2")]
    return [
      { id: "p1", valor_total: "1500000.00" },
      { id: "p2", valor_total: null },
    ]
  }) as never)
  vi.mocked(loadKpisPortafolio).mockResolvedValue(
    new Map([
      ["p1", kpis("1000", "500", "100")],
      ["p2", kpis("3000", "1000", "900")],
    ]),
  )
  vi.mocked(db.cliente.findMany).mockResolvedValue([
    { id: "c1", nombre: "Acme", _count: { proyectos: 2, oportunidades: 1 } },
    { id: "c2", nombre: "Beta", _count: { proyectos: 0, oportunidades: 1 } },
    { id: "c3", nombre: "Gamma", _count: { proyectos: 0, oportunidades: 0 } },
  ] as never)
  vi.mocked(db.bitacoraEntrada.groupBy).mockResolvedValue([
    { cliente_id: "c1", _max: { created_at: new Date("2026-10-20T15:00:00.000Z") } },
    { cliente_id: "c2", _max: { created_at: new Date("2026-10-10T15:00:00.000Z") } },
  ] as never)
  vi.mocked(db.oportunidad.findMany).mockResolvedValue([
    { id: "o1", nombre: "Dotación", estado: "PRESENTADA", valor_estimado_cop: "2000000.50", cliente: { id: "c1", nombre: "Acme" } },
    { id: "o2", nombre: "Capacitación", estado: "STANDBY", valor_estimado_cop: null, cliente: { id: "c2", nombre: "Beta" } },
  ] as never)
  vi.mocked(db.bitacoraEntrada.findMany).mockResolvedValue([
    {
      id: "b1",
      created_at: new Date("2026-10-20T15:00:00.000Z"),
      tipo: "REUNION",
      texto: "Revisión de avance",
      proximo_paso: "Enviar propuesta",
      cliente: { id: "c1", nombre: "Acme" },
      autor: { id: "r1", nombre: "Ana" },
    },
  ] as never)
  vi.mocked(db.tarea.findMany).mockResolvedValue([
    tarea("t1", "COMPLETADA", "2026-10-01T00:00:00.000Z"),
    tarea("t2", "POR_HACER", "2026-11-10T00:00:00.000Z"),
    tarea("t3", "EN_CURSO", "2026-10-15T00:00:00.000Z"),
    tarea("t4", "POR_HACER", null),
  ] as never)
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe("GET /api/v1/reports/tag", () => {
  it("passes the 401 through", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: { message: "No autenticado." } }, { status: 401 }),
    })
    expect((await GET(get(ETIQUETA))).status).toBe(401)
  })

  it("asks for a tag (400) and validates the period (400)", async () => {
    const sinEtiqueta = await GET(get("?etiqueta=%20"))
    expect(sinEtiqueta.status).toBe(400)
    expect((await sinEtiqueta.json()).error).toBe("Elige una etiqueta.")
    expect((await GET(get(`${ETIQUETA}&desde=2026-13`))).status).toBe(400)
    expect((await GET(get(`${ETIQUETA}&desde=2026-10-20&hasta=2026-10-01`))).status).toBe(400)
    expect(db.cliente.findMany).not.toHaveBeenCalled()
  })

  it("composes every section from the tagged projects, clients and tasks (S2, S4)", async () => {
    auth(user("COLABORADOR", true))
    const res = await GET(get(`${ETIQUETA}&desde=2026-10-01&hasta=2026-10-31`))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.etiqueta).toBe("Fábrica Milagro")
    expect(body.periodo).toEqual({ desde: "2026-10-01", hasta: "2026-10-31" })
    // The cut-off never goes past today.
    expect(body.corte).toBe("2026-10-29")

    // Projects: the portfolio loader filtered by the project's own tag (never deduced from the client's).
    const proyectoWhere = vi.mocked(db.proyecto.findMany).mock.calls[0][0]?.where
    expect(proyectoWhere).toMatchObject({ etiquetas: { has: "Fábrica Milagro" }, deleted_at: null })
    expect(body.proyectos.map((p: { codigo: string }) => p.codigo)).toEqual(["PRY-p1", "PRY-p2"])
    expect(body.proyectos[0]).toMatchObject({ valor_total: "1500000.00", estado: "EN_EJECUCION" })
    expect(body.proyectos[0].kpis.financiero).toMatchObject({ programado: "500.00", ejecutado: "100.00" })
    expect(body.proyectos[1].valor_total).toBeNull()

    // Clients: the tagged ones, with the 15-day highlight (never contacted counts as highlighted).
    expect(vi.mocked(db.cliente.findMany).mock.calls[0][0]?.where).toMatchObject({
      deleted_at: null,
      etiquetas: { has: "Fábrica Milagro" },
    })
    expect(body.clientes).toEqual([
      { id: "c1", nombre: "Acme", proyectos: 2, oportunidades_abiertas: 1, ultima_interaccion: "2026-10-20", dias_sin_interaccion: 9, sin_interaccion_reciente: false },
      { id: "c2", nombre: "Beta", proyectos: 0, oportunidades_abiertas: 1, ultima_interaccion: "2026-10-10", dias_sin_interaccion: 19, sin_interaccion_reciente: true },
      { id: "c3", nombre: "Gamma", proyectos: 0, oportunidades_abiertas: 0, ultima_interaccion: null, dias_sin_interaccion: null, sin_interaccion_reciente: true },
    ])

    // Opportunities: the open ones of the tagged clients.
    const opWhere = vi.mocked(db.oportunidad.findMany).mock.calls[0][0]?.where
    expect(opWhere).toMatchObject({ deleted_at: null, cliente_id: { in: ["c1", "c2", "c3"] } })
    expect(opWhere?.estado).toEqual({ in: ["DISENANDO_PROPUESTA", "PRESENTADA", "EN_REVISION", "EN_NEGOCIACION", "STANDBY"] })
    // Snapshot at the cut-off: nothing created after the end of `corte`.
    expect(opWhere?.created_at).toEqual({ lte: new Date("2026-10-29T23:59:59.999Z") })
    expect(body.oportunidades).toEqual([
      { id: "o1", nombre: "Dotación", estado: "PRESENTADA", valor_estimado_cop: "2000000.50", cliente: { id: "c1", nombre: "Acme" } },
      { id: "o2", nombre: "Capacitación", estado: "STANDBY", valor_estimado_cop: null, cliente: { id: "c2", nombre: "Beta" } },
    ])

    // Bitácora: the tagged clients' entries in the period.
    const bitWhere = vi.mocked(db.bitacoraEntrada.findMany).mock.calls[0][0]?.where
    expect(bitWhere).toMatchObject({ cliente_id: { in: ["c1", "c2", "c3"] } })
    expect(bitWhere?.created_at).toMatchObject({ gte: new Date("2026-10-01") })
    expect(body.bitacora[0]).toMatchObject({ fecha: "2026-10-20", proximo_paso: "Enviar propuesta", cliente: { nombre: "Acme" } })

    // Tasks: the tagged ones due in the period (or open without a due date), overdue first.
    const tareaWhere = vi.mocked(db.tarea.findMany).mock.calls[0][0]?.where
    expect(tareaWhere).toMatchObject({ deleted_at: null, etiquetas: { has: "Fábrica Milagro" } })
    expect(body.tareas.map((t: { id: string; vencida: boolean }) => [t.id, t.vencida])).toEqual([
      ["t3", true],
      ["t1", false],
      ["t2", false],
      ["t4", false],
    ])

    expect(body.resumen).toEqual({
      clientes: 3,
      proyectos: 2,
      valor_total: "1500000.00",
      financiero: { programado: "1500.00", ejecutado: "1000.00" },
      pipeline: { oportunidades: 2, valor: "2000000.50" },
      tareas: { total: 4, completadas: 1, vencidas: 1 },
    })
  })

  it("hides the commercial sections without commercial access (S5)", async () => {
    auth(user("COLABORADOR"))
    const body = await (await GET(get(ETIQUETA))).json()
    expect(db.oportunidad.findMany).not.toHaveBeenCalled()
    expect(body.oportunidades).toBeNull()
    expect(body.resumen.pipeline).toBeNull()
    expect(body.clientes[0]).not.toHaveProperty("oportunidades_abiertas")
    // The client project count keeps the member scope, and no opportunity count is selected.
    const sel = vi.mocked(db.cliente.findMany).mock.calls[0][0]?.select as unknown as {
      _count: { select: Record<string, { where: unknown }> }
    }
    expect(sel._count.select.proyectos.where).toMatchObject({
      deleted_at: null,
      miembros: { some: { usuario_id: "COLABORADOR-1", removed_at: null } },
    })
    expect(sel._count.select).not.toHaveProperty("oportunidades")
    // Without a period: no date filter on bitácora, and the cut-off is today.
    expect(body.periodo).toEqual({ desde: null, hasta: null })
    expect(body.corte).toBe("2026-10-29")
    expect(vi.mocked(db.bitacoraEntrada.findMany).mock.calls[0][0]?.where).not.toHaveProperty("created_at")
  })

  it("is documented in OpenAPI", () => {
    const op = buildOpenApiDocument().paths?.["/api/v1/reports/tag"]?.get
    expect(op).toBeDefined()
    expect(op?.parameters?.map((p) => ("name" in p ? p.name : null))).toEqual(["etiqueta", "desde", "hasta"])
  })
})
