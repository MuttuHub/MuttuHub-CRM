// GET /api/v1/reports/weekly (S5): the weekly report composed from the portfolio loader, the per-project
// "Requiere atención" list, the task ledger and the expense validation queue.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Usuario } from "@prisma/client"

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }))
vi.mock("@/lib/settings", async (importOriginal) => {
  const { PARAMETROS_V2_DEFAULT } = await import("@/lib/proyectos/semaforo-v2")
  return { ...(await importOriginal<typeof import("@/lib/settings")>()), getSemaforoParametrosV2: vi.fn(async () => PARAMETROS_V2_DEFAULT) }
})
vi.mock("@/lib/db", () => ({
  db: { proyecto: { findMany: vi.fn() }, tarea: { findMany: vi.fn() }, gasto: { findMany: vi.fn() } },
}))
vi.mock("@/lib/api/kpis-portafolio", () => ({ loadKpisPortafolio: vi.fn() }))
vi.mock("@/lib/api/atencion", () => ({ cargarAtencion: vi.fn() }))

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireApiUser } from "@/lib/supabase/server"
import { loadKpisPortafolio } from "@/lib/api/kpis-portafolio"
import { cargarAtencion } from "@/lib/api/atencion"
import { kpisProyecto } from "@/lib/proyectos/kpis"
import { toCents } from "@/lib/proyectos/money"
import { PARAMETROS_V2_DEFAULT } from "@/lib/proyectos/semaforo-v2"
import { buildOpenApiDocument } from "@/lib/openapi/document"
import { GET } from "./route"

const user = (rol: string) => ({ id: `${rol}-1`, rol, puede_ver_tablero_gerencial: false }) as unknown as Usuario
const auth = (usuario: Usuario) => vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never })
const get = (qs = "?semana=2026-10-21") => new Request(`http://localhost/api/v1/reports/weekly${qs}`)

const fila = (id: string, cliente: { id: string; nombre: string }) => ({
  id,
  codigo: `PRY-${id}`,
  nombre: `Proyecto ${id}`,
  estado: "EN_EJECUCION",
  fecha_inicio: new Date("2026-01-05T00:00:00.000Z"),
  fecha_fin: new Date("2026-12-30T00:00:00.000Z"),
  beneficiarios_meta: 10,
  cliente,
  responsable: { id: "r1", nombre: "Ana" },
  lineas: [],
})
const ACME = { id: "c1", nombre: "Acme" }
const BETA = { id: "c2", nombre: "Beta" }
const kpis = (asignado: string, programado: string, ejecutado: string) =>
  kpisProyecto({
    corte: "2026-10-25",
    estado: "EN_EJECUCION",
    parametros: PARAMETROS_V2_DEFAULT,
    actividades: [],
    indicadores: [],
    beneficiarios: { total: 0, meta: 10 },
    financiero: { asignado: toCents(asignado), programado: toCents(programado), ejecutado: toCents(ejecutado) },
  })

const tarea = (estado: string, fecha_entrega: string | null, completed_at: string | null) => ({
  estado,
  fecha_entrega: fecha_entrega ? new Date(fecha_entrega) : null,
  completed_at: completed_at ? new Date(completed_at) : null,
  updated_at: new Date("2026-10-01T12:00:00.000Z"),
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-10-29T15:00:00.000Z"))
  auth(user("GERENCIA"))
  vi.mocked(db.proyecto.findMany).mockImplementation((async (args: { select: Record<string, unknown> }) => {
    if ("lineas" in args.select) return [fila("p1", ACME), fila("p2", ACME), fila("p3", BETA)]
    return ["p1", "p2", "p3"].map((id) => ({ id, estado: "EN_EJECUCION", fecha_inicio: new Date(), fecha_fin: new Date(), beneficiarios_meta: 10 }))
  }) as never)
  vi.mocked(loadKpisPortafolio).mockResolvedValue(
    new Map([
      ["p1", kpis("1000", "500", "100")],
      ["p2", kpis("3000", "1000", "900")],
      ["p3", kpis("200", "100", "50")],
    ]),
  )
  vi.mocked(cargarAtencion).mockImplementation(async ({ proyecto }) => ({
    ok: true,
    value: {
      corte: "2026-10-25",
      medible: true,
      items:
        proyecto.id === "p1"
          ? [
              { tipo: "actividad_atrasada", titulo: "Actividad atrasada", detalle: "A1 Diagnóstico: vencida el 20 oct 2026 con avance 40 %.", actividad_id: "a1" },
              { tipo: "gasto_observado", titulo: "Gasto pendiente por revisión", detalle: "Compra de refrigerios a Juan Pérez", gasto_id: "g1" },
              { tipo: "gasto_observado", titulo: "Gasto pendiente por revisión", detalle: "Transporte", gasto_id: "g2" },
              { tipo: "rubro_sobreejecucion", titulo: "Rubro sobreejecutado", detalle: "R01 Personal: ejecutado supera lo asignado.", rubro_id: "r1" },
            ]
          : [],
    },
  }))
  vi.mocked(db.tarea.findMany).mockResolvedValue([
    // Semana 19–25 oct: dos cerradas (una a tiempo, otra tarde) y dos vencidas (una abierta, otra cerrada tarde).
    tarea("COMPLETADA", "2026-10-22T00:00:00.000Z", "2026-10-21T20:00:00.000Z"),
    tarea("COMPLETADA", "2026-10-20T00:00:00.000Z", "2026-10-23T15:00:00.000Z"),
    tarea("EN_CURSO", "2026-10-24T00:00:00.000Z", null),
    // Semana anterior 12–18 oct: una cerrada a tiempo; ninguna vencida.
    tarea("COMPLETADA", "2026-10-16T00:00:00.000Z", "2026-10-15T14:00:00.000Z"),
    // Cancelada: ni cerrada ni vencida.
    tarea("CANCELADA", "2026-10-21T00:00:00.000Z", null),
  ] as never)
  vi.mocked(db.gasto.findMany).mockResolvedValue([
    { proyecto_id: "p1", monto_cop: "100.50", created_at: new Date("2026-10-20T15:00:00.000Z"), proyecto: { codigo: "PRY-p1", nombre: "Proyecto p1" } },
    { proyecto_id: "p1", monto_cop: "200", created_at: new Date("2026-10-10T15:00:00.000Z"), proyecto: { codigo: "PRY-p1", nombre: "Proyecto p1" } },
    { proyecto_id: "p3", monto_cop: "50", created_at: new Date("2026-10-22T15:00:00.000Z"), proyecto: { codigo: "PRY-p3", nombre: "Proyecto p3" } },
  ] as never)
})
afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe("GET /api/v1/reports/weekly", () => {
  it("401 without a session", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "No autenticado", code: "UNAUTHORIZED" }, { status: 401 }),
    })
    expect((await GET(get())).status).toBe(401)
  })

  it("403 for a role outside the project dashboard", async () => {
    auth(user("INVITADO"))
    const res = await GET(get())
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe("No tienes permisos para ver el tablero de proyectos.")
  })

  it("400 for a malformed or future week", async () => {
    const malo = await GET(get("?semana=ayer"))
    expect(malo.status).toBe(400)
    expect((await malo.json()).error).toBe("La semana no es válida. Usa una fecha AAAA-MM-DD.")
    const futura = await GET(get("?semana=2026-11-10"))
    expect(futura.status).toBe(400)
    expect((await futura.json()).error).toBe("La semana todavía no empieza.")
  })

  it("reports Monday–Sunday in Bogotá, the previous week and a corte at the week's end", async () => {
    const body = await (await GET(get())).json()
    expect(body.semana).toEqual({ desde: "2026-10-19", hasta: "2026-10-25" })
    expect(body.semana_anterior).toEqual({ desde: "2026-10-12", hasta: "2026-10-18" })
    expect(body.corte).toBe("2026-10-25")
    expect(vi.mocked(loadKpisPortafolio).mock.calls[0][0].corte).toBe("2026-10-25")
  })

  it("defaults to the current week with today as the corte", async () => {
    const body = await (await GET(get(""))).json()
    expect(body.semana).toEqual({ desde: "2026-10-26", hasta: "2026-11-01" })
    expect(body.corte).toBe("2026-10-29")
  })

  it("lists the portfolio by project and aggregates A/P/E by client with the portfolio aggregate", async () => {
    const body = await (await GET(get())).json()
    expect(body.portafolio.proyectos).toHaveLength(3)
    expect(body.portafolio.proyectos[0]).toMatchObject({
      codigo: "PRY-p1",
      cliente: ACME,
      asignado: "1000.00",
      programado: "500.00",
      ejecutado: "100.00",
    })
    expect(body.portafolio.proyectos[0].semaforo_financiero).toMatch(/verde|amarillo|rojo/)
    expect(body.portafolio.total.financiero).toMatchObject({ asignado: "4200.00", programado: "1600.00", ejecutado: "1050.00" })
    expect(body.portafolio.por_cliente).toEqual([
      expect.objectContaining({ cliente: ACME, proyectos: 2, financiero: expect.objectContaining({ asignado: "4000.00", programado: "1500.00", ejecutado: "1000.00" }) }),
      expect.objectContaining({ cliente: BETA, proyectos: 1, financiero: expect.objectContaining({ asignado: "200.00", ejecutado: "50.00" }) }),
    ])
  })

  it("splits overdue activities from «Requiere atención» and never exposes an expense's detail", async () => {
    const body = await (await GET(get())).json()
    expect(body.actividades_atrasadas).toEqual([
      { proyecto: { id: "p1", codigo: "PRY-p1", nombre: "Proyecto p1" }, actividad_id: "a1", detalle: "A1 Diagnóstico: vencida el 20 oct 2026 con avance 40 %." },
    ])
    expect(body.atencion).toEqual([
      {
        proyecto: { id: "p1", codigo: "PRY-p1", nombre: "Proyecto p1" },
        items: [
          { tipo: "gasto_observado", titulo: "Gasto pendiente por revisión", detalle: "2 gastos registrados con observaciones." },
          { tipo: "rubro_sobreejecucion", titulo: "Rubro sobreejecutado", detalle: "R01 Personal: ejecutado supera lo asignado." },
        ],
      },
    ])
    expect(JSON.stringify(body)).not.toContain("Juan Pérez")
    expect(vi.mocked(cargarAtencion).mock.calls[0][0].corteParam).toBe("2026-10-25")
  })

  it("compares closed and overdue tasks of the week with the previous week", async () => {
    const body = await (await GET(get())).json()
    expect(body.tareas).toEqual({
      semana: { cerradas: 2, vencidas: 2 },
      semana_anterior: { cerradas: 1, vencidas: 0 },
    })
  })

  it("also fetches completed tasks without completed_at by their updated_at in the two-week window", async () => {
    await GET(get())
    const where = JSON.stringify(vi.mocked(db.tarea.findMany).mock.calls[0][0]?.where)
    expect(where).toContain('{"estado":"COMPLETADA","completed_at":null,"updated_at":{"gte":"2026-10-12T05:00:00.000Z","lt":"2026-10-26T05:00:00.000Z"}}')
  })

  it("aggregates the expenses pending validation per project for a manager", async () => {
    const body = await (await GET(get())).json()
    expect(body.gastos_por_validar).toEqual({
      cantidad: 3,
      monto: "350.50",
      por_proyecto: [
        { proyecto: { id: "p1", codigo: "PRY-p1", nombre: "Proyecto p1" }, cantidad: 2, monto: "300.50", mas_antiguo: "2026-10-10" },
        { proyecto: { id: "p3", codigo: "PRY-p3", nombre: "Proyecto p3" }, cantidad: 1, monto: "50.00", mas_antiguo: "2026-10-22" },
      ],
    })
    const where = vi.mocked(db.gasto.findMany).mock.calls[0][0]?.where
    expect(where).toMatchObject({ estado: "REGISTRADO" })
  })

  it("leaves the validation queue out for a role that cannot validate expenses", async () => {
    auth(user("COORDINADOR"))
    const body = await (await GET(get())).json()
    expect(body.gastos_por_validar).toBeNull()
    expect(db.gasto.findMany).not.toHaveBeenCalled()
  })

  it("is registered in the OpenAPI document", () => {
    const paths = buildOpenApiDocument().paths ?? {}
    expect(paths["/api/v1/reports/weekly"]).toEqual(expect.objectContaining({ get: expect.anything() }))
    expect(paths["/api/v1/reports/weekly/export"]).toEqual(expect.objectContaining({ get: expect.anything() }))
  })
})
