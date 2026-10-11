// GET /api/v1/dashboard/portfolio (S9 U4, E-28): role-aware portfolio KPIs over the batched loader.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Usuario } from "@prisma/client"

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }))
vi.mock("@/lib/settings", async () => {
  const { PARAMETROS_V2_DEFAULT } = await import("@/lib/proyectos/semaforo-v2")
  return { getSemaforoParametrosV2: vi.fn(async () => PARAMETROS_V2_DEFAULT) }
})
vi.mock("@/lib/db", () => ({ db: { proyecto: { findMany: vi.fn() } } }))
vi.mock("@/lib/api/kpis-portafolio", () => ({ loadKpisPortafolio: vi.fn() }))

import { db } from "@/lib/db"
import { requireApiUser } from "@/lib/supabase/server"
import { loadKpisPortafolio } from "@/lib/api/kpis-portafolio"
import { kpisNoMedible, kpisProyecto } from "@/lib/proyectos/kpis"
import { PARAMETROS_V2_DEFAULT } from "@/lib/proyectos/semaforo-v2"
import { toCents } from "@/lib/proyectos/money"
import { GET } from "./route"

const user = (rol: string, extra: object = {}) => ({ id: `${rol}-1`, rol, puede_ver_tablero_gerencial: false, ...extra }) as unknown as Usuario
const auth = (usuario: Usuario) => vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never })
const get = (qs = "?corte=2026-03-15") => new Request(`http://localhost/api/v1/dashboard/portfolio${qs}`)

const fila = (id: string, estado: string) => ({
  id,
  codigo: `PRY-2026-00${id}`,
  nombre: `Proyecto ${id}`,
  estado,
  fecha_inicio: new Date("2026-01-05T00:00:00.000Z"),
  fecha_fin: new Date("2026-06-30T00:00:00.000Z"),
  beneficiarios_meta: 100,
  cliente: { id: "c1", nombre: "Cliente" },
  responsable: { id: "r1", nombre: "Resp" },
  lineas: [
    { principal: false, linea: { id: "l2", codigo: "L2", nombre: "Secundaria" } },
    { principal: true, linea: { id: "l1", codigo: "L1", nombre: "Principal" } },
  ],
})

const medible = (estado = "EN_EJECUCION") =>
  kpisProyecto({
    corte: "2026-03-15",
    estado,
    parametros: PARAMETROS_V2_DEFAULT,
    actividades: [],
    indicadores: [],
    beneficiarios: { total: 10, meta: 100 },
    financiero: { asignado: toCents("1000"), programado: toCents("500"), ejecutado: toCents("100") },
  })

beforeEach(() => {
  auth(user("GERENCIA"))
  vi.mocked(db.proyecto.findMany).mockResolvedValue([fila("1", "EN_EJECUCION"), fila("2", "BORRADOR")] as never)
  vi.mocked(loadKpisPortafolio).mockResolvedValue(
    new Map([
      ["1", medible()],
      ["2", kpisNoMedible("2026-03-15", "BORRADOR", PARAMETROS_V2_DEFAULT)],
    ]),
  )
})
afterEach(() => vi.clearAllMocks())

describe("GET dashboard/portfolio: access", () => {
  it("403 for a COLABORADOR without the gerencial flag, before touching the database", async () => {
    auth(user("COLABORADOR"))
    const res = await GET(get())
    expect(res.status).toBe(403)
    expect(db.proyecto.findMany).not.toHaveBeenCalled()
  })

  it("200 for a COLABORADOR with the flag, over every project", async () => {
    auth(user("COLABORADOR", { puede_ver_tablero_gerencial: true }))
    const res = await GET(get())
    expect(res.status).toBe(200)
    expect(vi.mocked(db.proyecto.findMany).mock.calls[0][0]?.where).not.toHaveProperty("miembros")
  })

  it("a COORDINADOR is narrowed to the projects they are an active member of", async () => {
    auth(user("COORDINADOR"))
    const res = await GET(get())
    expect(res.status).toBe(200)
    expect(vi.mocked(db.proyecto.findMany).mock.calls[0][0]?.where).toMatchObject({
      deleted_at: null,
      miembros: { some: { usuario_id: "COORDINADOR-1", removed_at: null } },
    })
  })

  it.each(["ADMINISTRADOR", "GERENCIA"])("%s sees every project", async (rol) => {
    auth(user(rol))
    expect((await GET(get())).status).toBe(200)
    expect(vi.mocked(db.proyecto.findMany).mock.calls[0][0]?.where).not.toHaveProperty("miembros")
  })
})

describe("GET dashboard/portfolio: atrasadas and beneficiarios", () => {
  it("exposes atrasadas per project and in agregado (D3: a finished-late activity does not count) and the beneficiaries aggregate", async () => {
    const avance = (fecha: string, cantidad: number) => ({ fecha, cantidad, anulado: false, tieneMedio: true, createdAt: `${fecha}T12:00:00.000Z` })
    const act = (id: string, fin: string, avances: ReturnType<typeof avance>[]) => ({
      id,
      codigo: id,
      peso: 1,
      inicio: "2026-01-05",
      fin,
      entregables: [{ id: `${id}-e`, meta: 10, avances }],
    })
    const conAtrasos = kpisProyecto({
      corte: "2026-03-15",
      estado: "EN_EJECUCION",
      parametros: PARAMETROS_V2_DEFAULT,
      actividades: [
        act("A", "2026-02-01", [avance("2026-03-01", 10)]), // finished late: NOT atrasada
        act("B", "2026-03-01", [avance("2026-02-20", 3)]), // due and open: atrasada
        act("C", "2026-06-01", []), // not due yet
      ],
      indicadores: [],
      beneficiarios: { total: 30, meta: 100 },
      financiero: { asignado: toCents("1000"), programado: toCents("500"), ejecutado: toCents("100") },
    })
    vi.mocked(loadKpisPortafolio).mockResolvedValue(
      new Map([
        ["1", conAtrasos],
        ["2", kpisNoMedible("2026-03-15", "BORRADOR", PARAMETROS_V2_DEFAULT)],
      ]),
    )
    const body = await (await GET(get())).json()
    expect(body.proyectos[0].atrasadas).toBe(1)
    expect(body.proyectos[0].kpis.cronograma.atrasadas).toBe(1)
    expect(body.proyectos[1].atrasadas).toBeNull()
    expect(body.agregado.atrasadas).toBe(1)
    expect(body.agregado.beneficiarios).toEqual({ total: 30, meta: 100 })
  })
})

describe("GET dashboard/portfolio: payload", () => {
  it("returns both semáforos and the state per project, the corte echoed and no territory key", async () => {
    const res = await GET(get())
    const body = await res.json()
    expect(body.corte).toBe("2026-03-15")
    expect(Object.keys(body)).not.toContain("por_territorio")
    expect(body.proyectos).toHaveLength(2)
    expect(body.proyectos[0]).toMatchObject({
      id: "1",
      codigo: "PRY-2026-001",
      estado: "EN_EJECUCION",
      cliente: { id: "c1" },
      linea_principal: { codigo: "L1" },
      semaforo_financiero: "verde",
      alerta_retraso: expect.any(Boolean),
    })
    expect(body.proyectos[0].semaforo_tecnico).toBe(medible().tecnico?.color)
    expect(body.proyectos[1]).toMatchObject({ estado: "BORRADOR", semaforo_tecnico: null, semaforo_financiero: null, alerta_retraso: null })
    expect(body.proyectos[1].kpis.medible).toBe(false)
  })

  it("serializes money as decimal strings and aggregates weighted (SumE / SumA)", async () => {
    const body = await (await GET(get())).json()
    expect(body.proyectos[0].kpis.financiero).toMatchObject({ asignado: "1000.00", programado: "500.00", ejecutado: "100.00", ea: 10 })
    expect(body.agregado.financiero).toMatchObject({ proyectos: 1, asignado: "1000.00", ejecutado: "100.00", ea: 10 })
    expect(body.por_estado).toEqual({ EN_EJECUCION: 1, BORRADOR: 1 })
    expect(body.confirmado).toBe(false)
  })

  it("feeds the loader with the visible rows, the corte and the semáforo parameters (vigente only)", async () => {
    await GET(get("?corte=2026-03-15"))
    const arg = vi.mocked(loadKpisPortafolio).mock.calls[0][0]
    expect(arg.corte).toBe("2026-03-15")
    expect(arg.proyectos.map((p) => p.id)).toEqual(["1", "2"])
    expect(arg.parametros).toBe(PARAMETROS_V2_DEFAULT)
    expect(arg).not.toHaveProperty("original")
  })

  it("defaults the corte to today in Bogota", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-10-26T03:00:00.000Z")) // still the 25th in Bogota
    try {
      expect((await (await GET(get(""))).json()).corte).toBe("2026-10-25")
    } finally {
      vi.useRealTimers()
    }
  })

  it("400 for a bad corte, an unknown estado", async () => {
    expect((await GET(get("?corte=2026-13-40"))).status).toBe(400)
    expect((await GET(get("?corte=15/03/2026"))).status).toBe(400)
    expect((await GET(get("?estado=NOPE"))).status).toBe(400)
  })

  it("passes the filters to the project query", async () => {
    await GET(get("?corte=2026-03-15&linea_id=l1&cliente_id=c1&responsable_id=r1&estado=EN_EJECUCION&municipio_id=m1"))
    expect(vi.mocked(db.proyecto.findMany).mock.calls[0][0]?.where).toMatchObject({
      estado: "EN_EJECUCION",
      cliente_id: "c1",
      responsable_id: "r1",
      lineas: { some: { linea_id: "l1" } },
      municipios: { some: { municipio_id: "m1" } },
    })
  })

  it("empty portfolio: no loader call and null aggregates", async () => {
    vi.mocked(db.proyecto.findMany).mockResolvedValue([] as never)
    vi.mocked(loadKpisPortafolio).mockResolvedValue(new Map())
    const body = await (await GET(get())).json()
    expect(body.proyectos).toEqual([])
    expect(body.agregado.financiero.ea).toBeNull()
  })
})
