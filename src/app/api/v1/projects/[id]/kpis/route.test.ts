// GET /api/v1/projects/:id/kpis (S9 U4): per-project KPI block, 404 -> 403 -> 409 -> 400, base=original.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Usuario } from "@prisma/client"

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }))
vi.mock("@/lib/settings", async () => {
  const { PARAMETROS_V2_DEFAULT } = await import("@/lib/proyectos/semaforo-v2")
  return { getSemaforoParametrosV2: vi.fn(async () => PARAMETROS_V2_DEFAULT) }
})
vi.mock("@/lib/db", () => ({ db: { proyecto: { findFirst: vi.fn() }, versionProyecto: { findFirst: vi.fn() } } }))
vi.mock("@/lib/api/kpis-portafolio", () => ({ loadKpisPortafolio: vi.fn() }))

import { db } from "@/lib/db"
import { requireApiUser } from "@/lib/supabase/server"
import { loadKpisPortafolio } from "@/lib/api/kpis-portafolio"
import { kpisProyecto } from "@/lib/proyectos/kpis"
import { PARAMETROS_V2_DEFAULT } from "@/lib/proyectos/semaforo-v2"
import { toCents } from "@/lib/proyectos/money"
import { GET } from "./route"

const user = (rol: string, extra: object = {}) => ({ id: `${rol}-1`, rol, puede_ver_tablero_gerencial: false, ...extra }) as unknown as Usuario
const auth = (usuario: Usuario) => vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never })
const ctx = { params: Promise.resolve({ id: "pry-1" }) }
const get = (qs = "?corte=2026-03-15") => new Request(`http://localhost/api/v1/projects/pry-1/kpis${qs}`)

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

const kpis = (indicadores: Parameters<typeof kpisProyecto>[0]["indicadores"] = []) =>
  kpisProyecto({
    corte: "2026-03-15",
    estado: "EN_EJECUCION",
    parametros: PARAMETROS_V2_DEFAULT,
    actividades: [],
    indicadores,
    beneficiarios: { total: 10, meta: 100 },
    financiero: { asignado: toCents("2000.50"), programado: toCents("500"), ejecutado: toCents("100") },
  })

const snapshot = { schema: 1, proyecto: { fecha_inicio: "2026-01-12" }, actividades: [], entregables: [], presupuesto: [], programacion: [] }

beforeEach(() => {
  auth(user("GERENCIA"))
  vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto())
  vi.mocked(loadKpisPortafolio).mockResolvedValue(new Map([["pry-1", kpis()]]))
  vi.mocked(db.versionProyecto.findFirst).mockResolvedValue({ snapshot } as never)
})
afterEach(() => vi.clearAllMocks())

describe("GET projects/:id/kpis", () => {
  it("returns the KPI block with money serialized and the corte echoed", async () => {
    const res = await GET(get(), ctx)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({
      base: "vigente",
      corte: "2026-03-15",
      estado: "EN_EJECUCION",
      medible: true,
      confirmado: false,
      financiero: { asignado: "2000.50", ejecutado: "100.00" },
    })
    const arg = vi.mocked(loadKpisPortafolio).mock.calls[0][0]
    expect(arg.proyectos).toEqual([expect.objectContaining({ id: "pry-1", beneficiarios_meta: 100 })])
    expect(arg.original).toBeUndefined()
  })

  it("exposes indicadores.en_meta (met goals, ignoring indicators without target or measurements)", async () => {
    const med = (valor: number) => ({ fecha: "2026-03-01", valor, anulado: false })
    vi.mocked(loadKpisPortafolio).mockResolvedValue(
      new Map([
        [
          "pry-1",
          kpis([
            { id: "i1", meta: 10, mediciones: [med(10)] },
            { id: "i2", meta: 10, mediciones: [med(4)] },
            { id: "i3", meta: 10, mediciones: [] },
            { id: "i4", meta: 0, mediciones: [med(3)] },
          ]),
        ],
      ]),
    )
    const body = await (await GET(get(), ctx)).json()
    expect(body.indicadores).toMatchObject({ en_meta: 1, medidos: 2, sin_medir: 2 })
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

  it("400 for an unknown base", async () => {
    expect((await GET(get("?corte=2026-03-15&base=otra"), ctx)).status).toBe(400)
  })

  it("base=original feeds the frozen version to the loader; 409 while there is none", async () => {
    const res = await GET(get("?corte=2026-03-15&base=original"), ctx)
    expect(res.status).toBe(200)
    expect((await res.json()).base).toBe("original")
    expect(vi.mocked(loadKpisPortafolio).mock.calls[0][0].original).toEqual({ proyectoId: "pry-1", snapshot })

    vi.mocked(db.versionProyecto.findFirst).mockResolvedValue(null)
    expect((await GET(get("?corte=2026-03-15&base=original"), ctx)).status).toBe(409)
  })

  it("a BORRADOR project answers 200 with medible=false", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto({ estado: "BORRADOR" }))
    vi.mocked(loadKpisPortafolio).mockResolvedValue(new Map([["pry-1", { ...kpis(), medible: false, estado: "BORRADOR", financiero: null, tecnico: null }]]))
    const body = await (await GET(get(), ctx)).json()
    expect(body).toMatchObject({ medible: false, estado: "BORRADOR", financiero: null })
  })
})
