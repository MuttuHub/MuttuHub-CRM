// GET /api/v1/reports/project (T9a, S15–S17): regression probes from the independent verifier
// (odd/tasks/reportes-etiqueta-y-posicion-propia.md, L28). The report's access equals the ficha's for every
// role × gerencial × member × commercial combination; edge cases for non-posición propia projects, only
// DESCARTADO allies, and the task scope of a COLABORADOR member.
import { beforeEach, describe, expect, it, vi } from "vitest"
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

import { db } from "@/lib/db"
import { requireApiUser } from "@/lib/supabase/server"
import { loadKpisPortafolio } from "@/lib/api/kpis-portafolio"
import { canReadProject } from "@/lib/api/projects"
import { GET as FICHA } from "@/app/api/v1/projects/[id]/route"
import { kpisProyecto } from "@/lib/proyectos/kpis"
import { toCents } from "@/lib/proyectos/money"
import { PARAMETROS_V2_DEFAULT } from "@/lib/proyectos/semaforo-v2"
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

describe("GET /api/v1/reports/project — access and edge cases", () => {
  beforeEach(() => { vi.mocked(db.tarea.findMany).mockClear(); vi.mocked(db.bitacoraEntrada.findMany).mockClear(); vi.mocked(db.bitacoraEntrada.groupBy).mockClear(); vi.mocked(db.oportunidad.findMany).mockClear(); vi.mocked(db.proyectoCliente.findMany).mockClear() })
  const cases: [string, boolean, boolean, boolean][] = []
  for (const rol of ["GERENCIA", "COORDINADOR", "COLABORADOR", "VISUALIZADOR"])
    for (const gerencial of [false, true]) for (const miembro of [false, true]) for (const com of [false, true]) cases.push([rol, gerencial, miembro, com])
  it.each(cases)("%s gerencial=%s miembro=%s comercial=%s matches ficha", async (rol, gerencial, miembro, com) => {
    const u = { id: `${rol}-1`, rol, gestiona_oportunidades: com, puede_ver_tablero_gerencial: gerencial } as unknown as Usuario
    auth(u)
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto({ miembros: miembro ? [{ id: "m" }] : [], oportunidad_id: "o1" }) as never)
    const res = await GET(get(QS))
    const ficha = await FICHA(new Request("http://localhost/api/v1/projects/p1"), { params: Promise.resolve({ id: "p1" }) })
    const can = canReadProject(u, miembro)
    expect(res.status).toBe(can ? 200 : 403)
    if (!can) expect(ficha.status).toBe(403)
    if (can) {
      const body = await res.json()
      const comercial = ["GERENCIA", "COORDINADOR"].includes(rol) || com
      if (!comercial) { expect(body.oportunidades).toBeNull() }
    } else {
      expect(db.tarea.findMany).not.toHaveBeenCalled()
      expect(db.bitacoraEntrada.findMany).not.toHaveBeenCalled()
    }
  })
  it("INDEPENDIENTE with client: label, no allies, no groupBy, no ally opps", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto({ origen: "INDEPENDIENTE", cliente: { id: "c9", nombre: "Directo" } }) as never)
    const body = await (await GET(get(QS))).json()
    expect(body.resumen.cliente).toBe("Directo")
    expect(body.aliados).toEqual([])
    expect(body.resumen.financiacion).toBeNull()
    expect(db.bitacoraEntrada.groupBy).not.toHaveBeenCalled()
    expect(db.oportunidad.findMany).not.toHaveBeenCalled()
    expect(body.oportunidades).toEqual([])
  })
  it("posición propia with only DESCARTADO allies: plain label, no ally opps", async () => {
    vi.mocked(db.proyectoCliente.findMany).mockResolvedValue([aliado("c1", "Beta", "DESCARTADO", "5.00")] as never)
    const body = await (await GET(get(QS))).json()
    expect(body.resumen.cliente).toBe("Posición propia")
    expect(body.resumen.financiacion).toEqual({ meta: "1000000.00", comprometido: "0.00", en_gestion: "0.00", sin_cubrir: "1000000.00" })
    expect(db.oportunidad.findMany).not.toHaveBeenCalled()
  })
  it("tasks: tareaScopeWhere all has no responsable filter for COLABORADOR member", async () => {
    auth(user("COLABORADOR"))
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto({ miembros: [{ id: "m" }] }) as never)
    await GET(get(QS))
    expect(vi.mocked(db.tarea.findMany).mock.calls[0][0]?.where).toEqual({ deleted_at: null, proyecto_id: "p1" })
  })
})
