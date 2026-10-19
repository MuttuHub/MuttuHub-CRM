// GET /api/v1/projects/:id/attention (S14 P5): server-derived attention list, 404 -> 403 -> 409 -> 400.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Usuario } from "@prisma/client"

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }))
vi.mock("@/lib/settings", async () => {
  const { PARAMETROS_V2_DEFAULT } = await import("@/lib/proyectos/semaforo-v2")
  return { getSemaforoParametrosV2: vi.fn(async () => PARAMETROS_V2_DEFAULT) }
})
vi.mock("@/lib/db", () => ({
  db: {
    proyecto: { findFirst: vi.fn() },
    actividad: { findMany: vi.fn(async () => []) },
    avanceEntregable: { findMany: vi.fn(async () => []) },
    soporteProyecto: { groupBy: vi.fn(async () => []) },
    indicador: { findMany: vi.fn(async () => []) },
    lineaPresupuestal: { findMany: vi.fn(async () => []) },
    gasto: { findMany: vi.fn(async () => []) },
  },
}))
vi.mock("@/lib/api/kpis-portafolio", () => ({ loadKpisPortafolio: vi.fn() }))
vi.mock("@/lib/api/financiera", () => ({ loadGastosValidados: vi.fn(async () => ({ disponible: true, gastos: [] })) }))

import { db } from "@/lib/db"
import { requireApiUser } from "@/lib/supabase/server"
import { loadKpisPortafolio } from "@/lib/api/kpis-portafolio"
import { kpisProyecto, type KpisProyecto } from "@/lib/proyectos/kpis"
import { PARAMETROS_V2_DEFAULT } from "@/lib/proyectos/semaforo-v2"
import { toCents } from "@/lib/proyectos/money"
import { GET } from "./route"

const user = (rol: string, extra: object = {}) =>
  ({ id: `${rol}-1`, rol, puede_ver_tablero_gerencial: false, ...extra }) as unknown as Usuario
const auth = (usuario: Usuario) =>
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never })
const ctx = { params: Promise.resolve({ id: "pry-1" }) }
const get = (qs = "?corte=2026-03-15") => new Request(`http://localhost/api/v1/projects/pry-1/attention${qs}`)

const proyecto = (over: object = {}, miembro = false) =>
  ({
    id: "pry-1",
    estado: "EN_EJECUCION",
    fecha_inicio: new Date("2026-01-05T00:00:00.000Z"),
    fecha_fin: new Date("2026-06-30T00:00:00.000Z"),
    beneficiarios_meta: 100,
    miembros: miembro ? [{ id: "m-1" }] : [],
    ...over,
  }) as never

function kpis(over: Partial<KpisProyecto> = {}): KpisProyecto {
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

beforeEach(() => {
  auth(user("GERENCIA"))
  vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto())
  vi.mocked(loadKpisPortafolio).mockResolvedValue(new Map([["pry-1", kpis()]]))
})
afterEach(() => vi.clearAllMocks())

describe("GET projects/:id/attention", () => {
  it("returns the list with the corte and medible flags", async () => {
    const res = await GET(get(), ctx)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ corte: "2026-03-15", medible: true, items: [] })
  })

  it("carries an item when the financial delay alert fired", async () => {
    vi.mocked(loadKpisPortafolio).mockResolvedValue(
      new Map([["pry-1", kpis({ financiero: { ...kpis().financiero!, alerta_retraso: true } })]]),
    )
    const body = await (await GET(get(), ctx)).json()
    expect(body.items.map((item: { tipo: string }) => item.tipo)).toEqual(["alerta_retraso"])
    expect(body.items[0].titulo).toBe("Posible retraso")
  })

  it("404 for an unknown project, before any permission decision", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null)
    auth(user("COLABORADOR"))
    expect((await GET(get(), ctx)).status).toBe(404)
  })

  it("403 for a COLABORADOR and for a COORDINADOR who is not a member", async () => {
    auth(user("COLABORADOR"))
    expect((await GET(get(), ctx)).status).toBe(403)
    auth(user("COORDINADOR"))
    expect((await GET(get(), ctx)).status).toBe(403)
  })

  it("200 for a member COORDINADOR", async () => {
    auth(user("COORDINADOR"))
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto({}, true))
    expect((await GET(get(), ctx)).status).toBe(200)
  })

  it("409 without dates (before the corte is parsed), then 400 for a bad corte", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto({ fecha_inicio: null }))
    expect((await GET(get("?corte=basura"), ctx)).status).toBe(409)
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto())
    expect((await GET(get("?corte=basura"), ctx)).status).toBe(400)
  })

  it("a BORRADOR project answers 200 with medible=false and no items", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto({ estado: "BORRADOR" }))
    vi.mocked(loadKpisPortafolio).mockResolvedValue(
      new Map([["pry-1", kpis({ medible: false, estado: "BORRADOR", tecnico: null, financiero: null })]]),
    )
    const body = await (await GET(get(), ctx)).json()
    expect(body).toEqual({ corte: "2026-03-15", medible: false, items: [] })
  })
})
