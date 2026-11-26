// GET /api/v1/reports/project (T9a, S15–S17): the per-project report composed from the project's ficha scope,
// its allies, the opportunities of the project and its allies, its bitácora and its tasks.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Usuario } from "@prisma/client"

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }))
vi.mock("@/lib/settings", async (importOriginal) => {
  const { PARAMETROS_V2_DEFAULT } = await import("@/lib/proyectos/semaforo-v2")
  return { ...(await importOriginal<typeof import("@/lib/settings")>()), getSemaforoParametrosV2: vi.fn(async () => PARAMETROS_V2_DEFAULT) }
})
vi.mock("@/lib/db", () => ({
  db: {
    proyecto: { findFirst: vi.fn() },
    proyectoCliente: { findMany: vi.fn() },
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
const get = (qs: string) => new Request(`http://localhost/api/v1/reports/project${qs}`)
const QS = "?proyecto_id=p1"

const proyecto = (overrides: Record<string, unknown> = {}) => ({
  id: "p1",
  codigo: "PRY-2026-001",
  nombre: "Fondo Reconstrucción",
  estado: "EN_EJECUCION",
  origen: "POSICION_PROPIA",
  fecha_inicio: new Date("2026-01-05T00:00:00.000Z"),
  fecha_fin: new Date("2026-12-30T00:00:00.000Z"),
  beneficiarios_meta: 10,
  valor_total: "1000000.00",
  oportunidad_id: null,
  cliente: null,
  responsable: { id: "r1", nombre: "Ana" },
  miembros: [],
  ...overrides,
})

const aliado = (id: string, nombre: string, estado: string, aporte_cop: string | null) => ({
  id: `a-${id}`,
  rol: "FINANCIADOR",
  estado,
  aporte_cop,
  created_at: new Date("2026-11-01T00:00:00.000Z"),
  updated_at: new Date("2026-11-01T00:00:00.000Z"),
  cliente: { id, nombre },
})

const tarea = (id: string, estado: string, fecha_entrega: string | null) => ({
  id,
  titulo: `Tarea ${id}`,
  estado,
  fecha_entrega: fecha_entrega ? new Date(fecha_entrega) : null,
  responsable: { id: "r1", nombre: "Ana" },
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-10-29T15:00:00.000Z"))
  auth(user("GERENCIA"))
  vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto() as never)
  vi.mocked(loadKpisPortafolio).mockImplementation(async ({ proyectos }) =>
    new Map(
      proyectos.map((p) => [
        p.id,
        kpisProyecto({
          corte: "2026-10-29",
          estado: "EN_EJECUCION",
          parametros: PARAMETROS_V2_DEFAULT,
          actividades: [],
          indicadores: [],
          beneficiarios: { total: 0, meta: 10 },
          financiero: { asignado: toCents("1000"), programado: toCents("500"), ejecutado: toCents("120.50") },
        }),
      ]),
    ),
  )
  vi.mocked(db.proyectoCliente.findMany).mockResolvedValue([
    aliado("c3", "Zeta", "EN_GESTION", "200000.25"),
    aliado("c1", "Beta", "DESCARTADO", "900000.00"),
    aliado("c2", "Acme", "COMPROMETIDO", "300000.50"),
    aliado("c4", "Delta", "COMPROMETIDO", null),
    aliado("c5", "Alfa", "EN_GESTION", "100000.00"),
  ] as never)
  vi.mocked(db.bitacoraEntrada.groupBy).mockResolvedValue([
    { cliente_id: "c2", _max: { created_at: new Date("2026-10-20T15:00:00.000Z") } },
  ] as never)
  vi.mocked(db.oportunidad.findMany).mockResolvedValue([
    { id: "o2", nombre: "Aporte Acme", estado: "PRESENTADA", fase: "PROSPECCION", valor_estimado_cop: "50000.00", cliente: { id: "c2", nombre: "Acme" } },
  ] as never)
  vi.mocked(db.bitacoraEntrada.findMany).mockResolvedValue([
    {
      id: "b1",
      created_at: new Date("2026-10-20T15:00:00.000Z"),
      tipo: "REUNION",
      texto: "Revisión del aporte",
      proximo_paso: "Firmar carta",
      cliente: { id: "c2", nombre: "Acme" },
      autor: { id: "r1", nombre: "Ana" },
    },
  ] as never)
  // In the query's order: due date ascending, without a due date last.
  vi.mocked(db.tarea.findMany).mockResolvedValue([
    tarea("t1", "COMPLETADA", "2026-10-01T00:00:00.000Z"),
    tarea("t2", "CANCELADA", "2026-10-02T00:00:00.000Z"),
    tarea("t7", "POR_HACER", "2026-10-10T00:00:00.000Z"),
    tarea("t4", "EN_CURSO", "2026-10-15T00:00:00.000Z"),
    tarea("t6", "BLOQUEADA", "2026-10-29T00:00:00.000Z"),
    tarea("t3", "POR_HACER", "2026-11-10T00:00:00.000Z"),
    tarea("t5", "POR_HACER", null),
  ] as never)
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe("GET /api/v1/reports/project", () => {
  it("passes the 401 through", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: { message: "No autenticado." } }, { status: 401 }),
    })
    expect((await GET(get(QS))).status).toBe(401)
  })

  it("asks for a project (400) before reading anything", async () => {
    for (const qs of ["", "?proyecto_id=%20"]) {
      const res = await GET(get(qs))
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe("Elige un proyecto.")
    }
    expect(db.proyecto.findFirst).not.toHaveBeenCalled()
  })

  it("answers 404 for a missing project and 403 for one the user cannot read, like the ficha (S17)", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null as never)
    const missing = await GET(get(QS))
    expect(missing.status).toBe(404)
    expect((await missing.json()).error).toBe("El proyecto no existe.")
    // The scoped read: the id, not soft-deleted, with the caller's active membership probe.
    expect(vi.mocked(db.proyecto.findFirst).mock.calls[0][0]).toMatchObject({
      where: { id: "p1", deleted_at: null },
      select: { miembros: { where: { usuario_id: "GERENCIA-1", removed_at: null } } },
    })

    auth(user("COLABORADOR"))
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto({ miembros: [] }) as never)
    const forbidden = await GET(get(QS))
    expect(forbidden.status).toBe(403)
    expect((await forbidden.json()).error).toBe("No tienes permisos sobre este proyecto.")

    for (const read of [db.proyectoCliente.findMany, db.oportunidad.findMany, db.bitacoraEntrada.findMany, db.bitacoraEntrada.groupBy, db.tarea.findMany]) {
      expect(read).not.toHaveBeenCalled()
    }
    expect(loadKpisPortafolio).not.toHaveBeenCalled()
  })

  it("lets a member read it", async () => {
    auth(user("COLABORADOR"))
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto({ miembros: [{ id: "m1" }] }) as never)
    expect((await GET(get(QS))).status).toBe(200)
  })

  it("sums meta, comprometido, en gestión and sin cubrir from the active allies (S15)", async () => {
    const body = await (await GET(get(QS))).json()
    // Soft-deleted clients never reach the report.
    expect(vi.mocked(db.proyectoCliente.findMany).mock.calls[0][0]?.where).toEqual({ proyecto_id: "p1", cliente: { deleted_at: null } })
    expect(body.resumen).toMatchObject({
      proyecto: { id: "p1", codigo: "PRY-2026-001", nombre: "Fondo Reconstrucción", estado: "EN_EJECUCION", origen: "POSICION_PROPIA" },
      cliente: "Posición propia · 4 aliados",
      valor_total: "1000000.00",
      financiero: { programado: "500.00", ejecutado: "120.50" },
      // DESCARTADO (900000) counts nowhere; a COMPROMETIDO ally without a contribution adds 0.
      financiacion: { meta: "1000000.00", comprometido: "300000.50", en_gestion: "300000.25", sin_cubrir: "399999.25" },
    })
    // The KPI block comes from the portfolio loader, for this one project.
    expect(vi.mocked(loadKpisPortafolio).mock.calls[0][0]).toMatchObject({ corte: "2026-10-29", proyectos: [{ id: "p1" }] })
    expect(body.corte).toBe("2026-10-29")
  })

  it("never reports a negative sin cubrir, and has none without a meta", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto({ valor_total: "400000.00" }) as never)
    expect((await (await GET(get(QS))).json()).resumen.financiacion).toEqual({
      meta: "400000.00",
      comprometido: "300000.50",
      en_gestion: "300000.25",
      sin_cubrir: "0.00",
    })

    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto({ valor_total: null }) as never)
    expect((await (await GET(get(QS))).json()).resumen.financiacion).toEqual({
      meta: null,
      comprometido: "300000.50",
      en_gestion: "300000.25",
      sin_cubrir: null,
    })
  })

  it("lists every ally, DESCARTADO included, by state and name, with its last interaction about this project (S15, S16)", async () => {
    const body = await (await GET(get(QS))).json()
    expect(body.aliados.map((a: { cliente: { nombre: string }; estado: string }) => [a.cliente.nombre, a.estado])).toEqual([
      ["Acme", "COMPROMETIDO"],
      ["Delta", "COMPROMETIDO"],
      ["Alfa", "EN_GESTION"],
      ["Zeta", "EN_GESTION"],
      ["Beta", "DESCARTADO"],
    ])
    expect(body.aliados[0]).toEqual({
      id: "a-c2",
      cliente: { id: "c2", nombre: "Acme" },
      rol: "FINANCIADOR",
      estado: "COMPROMETIDO",
      aporte_cop: 300000.5,
      ultima_interaccion: "2026-10-20",
    })
    expect(body.aliados[1].ultima_interaccion).toBeNull()
    expect(vi.mocked(db.bitacoraEntrada.groupBy).mock.calls[0][0]).toMatchObject({
      by: ["cliente_id"],
      where: { proyecto_id: "p1", cliente_id: { in: ["c3", "c1", "c2", "c4", "c5"] } },
      _max: { created_at: true },
    })
  })

  it("reports the project's own client and no allies for a project that is not posición propia", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(
      proyecto({ origen: "OPORTUNIDAD", cliente: { id: "c9", nombre: "Cliente Directo" }, oportunidad_id: "o9" }) as never,
    )
    const body = await (await GET(get(QS))).json()
    expect(body.aliados).toEqual([])
    expect(db.proyectoCliente.findMany).not.toHaveBeenCalled()
    expect(body.resumen.cliente).toBe("Cliente Directo")
    expect(body.resumen.financiacion).toBeNull()
    // Only the project's own opportunity is linked.
    expect(vi.mocked(db.oportunidad.findMany).mock.calls[0][0]?.where).toMatchObject({ deleted_at: null, OR: [{ id: "o9" }] })
  })

  it("links the project's own opportunity and the open ones of its non-DESCARTADO allies (L26)", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto({ oportunidad_id: "o1" }) as never)
    vi.mocked(db.oportunidad.findMany).mockResolvedValue([
      { id: "o2", nombre: "Aporte Acme", estado: "PRESENTADA", fase: "PROSPECCION", valor_estimado_cop: "50000.00", cliente: { id: "c2", nombre: "Acme" } },
      { id: "o1", nombre: "Origen", estado: "GANADA", fase: "EJECUCION", valor_estimado_cop: null, cliente: { id: "c2", nombre: "Acme" } },
    ] as never)
    const body = await (await GET(get(QS))).json()
    const where = vi.mocked(db.oportunidad.findMany).mock.calls[0][0]?.where
    expect(where).toMatchObject({
      deleted_at: null,
      OR: [
        { id: "o1" },
        {
          cliente_id: { in: ["c3", "c2", "c4", "c5"] },
          estado: { in: ["DISENANDO_PROPUESTA", "PRESENTADA", "EN_REVISION", "EN_NEGOCIACION", "STANDBY"] },
        },
      ],
    })
    expect(body.oportunidades).toEqual([
      { id: "o1", nombre: "Origen", estado: "GANADA", fase: "EJECUCION", valor_estimado_cop: null, cliente: { id: "c2", nombre: "Acme" }, vinculo: "PROYECTO" },
      { id: "o2", nombre: "Aporte Acme", estado: "PRESENTADA", fase: "PROSPECCION", valor_estimado_cop: "50000.00", cliente: { id: "c2", nombre: "Acme" }, vinculo: "ALIADO" },
    ])
  })

  it("hides the opportunities without commercial access (S5)", async () => {
    auth(user("COLABORADOR"))
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto({ miembros: [{ id: "m1" }], oportunidad_id: "o1" }) as never)
    const body = await (await GET(get(QS))).json()
    expect(body.oportunidades).toBeNull()
    expect(db.oportunidad.findMany).not.toHaveBeenCalled()

    auth(user("COLABORADOR", true))
    expect((await (await GET(get(QS))).json()).oportunidades).toHaveLength(1)
  })

  it("lists the latest 50 interactions about this project, newest first (S16)", async () => {
    const body = await (await GET(get(QS))).json()
    const args = vi.mocked(db.bitacoraEntrada.findMany).mock.calls[0][0]
    expect(args).toMatchObject({ where: { proyecto_id: "p1" }, orderBy: { created_at: "desc" }, take: 50 })
    expect(body.bitacora).toEqual([
      {
        id: "b1",
        fecha: "2026-10-20",
        tipo: "REUNION",
        texto: "Revisión del aporte",
        proximo_paso: "Firmar carta",
        cliente: { id: "c2", nombre: "Acme" },
        autor: { id: "r1", nombre: "Ana" },
      },
    ])
  })

  it("computes the task progress and splits the open tasks into overdue and upcoming (S15)", async () => {
    const body = await (await GET(get(QS))).json()
    const args = vi.mocked(db.tarea.findMany).mock.calls[0][0]
    expect(args?.where).toMatchObject({ deleted_at: null, proyecto_id: "p1" })
    expect(args?.orderBy).toEqual([{ fecha_entrega: { sort: "asc", nulls: "last" } }, { titulo: "asc" }])
    // 1 completed of 6 not cancelled.
    expect(body.tareas.resumen).toEqual({ total: 7, completadas: 1, canceladas: 1, avance_pct: 16.7 })
    // Overdue: open and due before today, oldest first.
    expect(body.tareas.vencidas.map((t: { id: string }) => t.id)).toEqual(["t7", "t4"])
    // Upcoming: open and due today or later, soonest first; without a due date last.
    expect(body.tareas.proximas.map((t: { id: string }) => t.id)).toEqual(["t6", "t3", "t5"])
    expect(body.tareas.vencidas[0]).toEqual({
      id: "t7",
      titulo: "Tarea t7",
      estado: "POR_HACER",
      fecha_entrega: "2026-10-10",
      responsable: { id: "r1", nombre: "Ana" },
    })
  })

  it("has no task progress when every task is cancelled or there are none", async () => {
    vi.mocked(db.tarea.findMany).mockResolvedValue([tarea("t2", "CANCELADA", null)] as never)
    expect((await (await GET(get(QS))).json()).tareas.resumen.avance_pct).toBeNull()
    vi.mocked(db.tarea.findMany).mockResolvedValue([] as never)
    expect((await (await GET(get(QS))).json()).tareas.resumen).toEqual({ total: 0, completadas: 0, canceladas: 0, avance_pct: null })
  })

  it("is documented in OpenAPI", () => {
    const op = buildOpenApiDocument().paths?.["/api/v1/reports/project"]?.get
    expect(op).toBeDefined()
    expect(op?.parameters?.map((p) => ("name" in p ? p.name : null))).toEqual(["proyecto_id"])
  })
})
