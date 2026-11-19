// @vitest-environment node
/**
 * WHY: the demo-flow seed enriches the local database right before a live demo of the
 * project creation stepper. Everything decidable BEFORE a write is pinned here without a
 * database: the shape of the fictitious data (counts, every opportunity state, exactly four
 * free GANADA), the idempotency marker, the top-up plan and the CLI behaviour. The
 * `require-local-db` guard and the Prisma client are mocked; the DB-writing path is
 * verified by the real local run, never here.
 */
import { describe, expect, it, vi } from "vitest"

vi.mock("../prisma/require-local-db", () => ({}))
vi.mock("../src/lib/db", () => ({ db: {} }))

import { cardAction } from "@/components/kanban/board-logic"
import type { CardTask } from "@/components/kanban/task-card"

import {
  FREE_GANADA_COUNT,
  MARKER_ID_PREFIX,
  assertLocalTarget,
  buildDemoFlujoData,
  checkDemoFlujoData,
  parseSeedArgs,
  planDemoFlujo,
  runSeedDemoFlujo,
  type DemoFlujoClient,
  type DemoFlujoData,
  type ExistingIds,
} from "./seed-demo-flujo"

const ESTADOS = ["EN_REVISION", "DISENANDO_PROPUESTA", "PRESENTADA", "EN_NEGOCIACION", "GANADA", "PERDIDA", "STANDBY"]
const data = buildDemoFlujoData()

const none = (): ExistingIds => ({
  clientes: new Set(),
  contactos: new Set(),
  oportunidades: new Set(),
  interacciones: new Set(),
  tareas: new Set(),
  clientesSinDepartamento: new Set(),
})

function allIds(d: DemoFlujoData): ExistingIds {
  return {
    clientes: new Set(d.clientes.map((c) => c.id)),
    contactos: new Set(d.contactos.map((c) => c.id)),
    oportunidades: new Set(d.oportunidades.map((o) => o.id)),
    interacciones: new Set(d.interacciones.map((i) => i.id)),
    tareas: new Set(d.tareas.map((t) => t.id)),
    clientesSinDepartamento: new Set(),
  }
}

describe("parseSeedArgs / assertLocalTarget", () => {
  it("is a dry run by default and only --apply writes", () => {
    expect(parseSeedArgs([])).toBe("dry-run")
    expect(parseSeedArgs(["--apply"])).toBe("apply")
    expect(parseSeedArgs(["--help"])).toBe("help")
    expect(() => parseSeedArgs(["--aply"])).toThrow(/Unknown argument/)
  })

  it("accepts loopback and refuses a remote or missing database", () => {
    expect(() => assertLocalTarget("postgresql://u:p@127.0.0.1:54322/postgres")).not.toThrow()
    expect(() => assertLocalTarget("postgresql://u:p@db.abcdef.supabase.co:5432/postgres")).toThrow()
    expect(() => assertLocalTarget(undefined)).toThrow()
  })
})

describe("buildDemoFlujoData", () => {
  it("builds about six clients with one or two contacts each", () => {
    expect(data.clientes).toHaveLength(6)
    for (const cliente of data.clientes) {
      const n = data.contactos.filter((c) => c.clienteId === cliente.id).length
      expect(n).toBeGreaterThanOrEqual(1)
      expect(n).toBeLessThanOrEqual(2)
    }
  })

  it("builds twelve opportunities covering every EstadoOportunidad", () => {
    expect(data.oportunidades).toHaveLength(12)
    expect(new Set(data.oportunidades.map((o) => o.estado))).toEqual(new Set(ESTADOS))
  })

  it("has exactly four GANADA opportunities, valued 40M-250M COP, for different clients", () => {
    const ganadas = data.oportunidades.filter((o) => o.estado === "GANADA")
    expect(FREE_GANADA_COUNT).toBe(4)
    expect(ganadas).toHaveLength(FREE_GANADA_COUNT)
    for (const o of ganadas) {
      expect(o.valor).toBeGreaterThanOrEqual(40_000_000)
      expect(o.valor).toBeLessThanOrEqual(250_000_000)
      expect(o.fase).toBe("PROSPECCION")
      expect(o.diasAdjudicacion).toBeNull()
    }
    expect(new Set(ganadas.map((o) => o.clienteId)).size).toBe(4)
  })

  it("never repeats a name or an id and keeps every id inside the marker namespace", () => {
    const nombres = [...data.clientes, ...data.oportunidades].map((x) => x.nombre)
    expect(new Set(nombres).size).toBe(nombres.length)
    const ids = [...data.clientes, ...data.contactos, ...data.oportunidades, ...data.interacciones].map((x) => x.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) {
      expect(id.startsWith(MARKER_ID_PREFIX)).toBe(true)
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    }
  })

  it("keeps the namespace away from the ids prisma/seed.ts uses (a001-a00f)", () => {
    expect(MARKER_ID_PREFIX).not.toMatch(/a00/)
  })

  it("gives every client at least one opportunity and three or more interactions", () => {
    for (const cliente of data.clientes) {
      expect(data.oportunidades.some((o) => o.clienteId === cliente.id)).toBe(true)
      expect(data.interacciones.filter((i) => i.clienteId === cliente.id).length).toBeGreaterThanOrEqual(3)
    }
  })

  it("uses fictitious contact data only", () => {
    for (const contacto of data.contactos) {
      expect(contacto.correo).toMatch(/@demo\.muttuhub\.local$/)
      expect(contacto.telefono).toMatch(/^\+57 300 555 /)
    }
  })

  it("fills the stakeholder matrix with values inside the schema ranges", () => {
    for (const c of data.contactos) {
      expect(c.poder).toBeGreaterThanOrEqual(1)
      expect(c.poder).toBeLessThanOrEqual(5)
      expect(c.interes).toBeGreaterThanOrEqual(1)
      expect(c.interes).toBeLessThanOrEqual(5)
      expect(c.fuerzaRelacion).toBeGreaterThanOrEqual(1)
      expect(c.fuerzaRelacion).toBeLessThanOrEqual(3)
    }
  })

  // D4: the board offers «Pasar a nuevo proyecto →» on a completed commercial task of a GANADA opportunity with no
  // project; without one the demo cannot show that action (docs/plan-trabajo-restante.md:229).
  it("leaves a completed commercial task on a free GANADA opportunity, so the board offers «Pasar a nuevo proyecto →»", () => {
    const libres = new Set(data.oportunidades.filter((o) => o.estado === "GANADA").map((o) => o.id))
    const acciones = data.tareas.map((t) => {
      const oportunidad = data.oportunidades.find((o) => o.id === t.oportunidadId)!
      const card = {
        estado: t.estado,
        oportunidad_id: t.oportunidadId,
        oportunidad_fase: oportunidad.fase,
        puede_editar: true,
        proyecto: null,
      } as unknown as CardTask
      return cardAction(card, libres)
    })
    expect(acciones).toContainEqual({
      kind: "convert",
      oportunidadId: expect.any(String),
      label: "Pasar a nuevo proyecto →",
    })
    const comercial = data.tareas.find((t) => t.estado === "COMPLETADA")!
    expect(comercial.origen).toBe("CRM")
    expect(comercial.clienteId).toBe(data.oportunidades.find((o) => o.id === comercial.oportunidadId)!.clienteId)
  })

  it("keeps every task id inside the marker namespace and away from the other kinds", () => {
    for (const t of data.tareas) expect(t.id.startsWith(MARKER_ID_PREFIX)).toBe(true)
    const otros = new Set([...data.clientes, ...data.contactos, ...data.oportunidades, ...data.interacciones].map((x) => x.id))
    for (const t of data.tareas) expect(otros.has(t.id)).toBe(false)
  })

  it("is internally consistent", () => {
    expect(checkDemoFlujoData(data)).toEqual([])
  })

  it("flags a broken dataset", () => {
    const sinPerdida: DemoFlujoData = { ...data, oportunidades: data.oportunidades.filter((o) => o.estado !== "PERDIDA") }
    expect(checkDemoFlujoData(sinPerdida).join(" ")).toMatch(/PERDIDA/)
    const [primera, ...resto] = data.oportunidades
    const duplicada: DemoFlujoData = { ...data, oportunidades: [primera, { ...primera, id: resto[0].id }, ...resto.slice(1)] }
    expect(checkDemoFlujoData(duplicada).join(" ")).toMatch(/duplicate/i)
    const huerfano: DemoFlujoData = { ...data, contactos: [{ ...data.contactos[0], clienteId: "nope" }, ...data.contactos.slice(1)] }
    expect(checkDemoFlujoData(huerfano).join(" ")).toMatch(/unknown client/)
    const ajena = data.oportunidades.find((o) => o.clienteId !== data.tareas[0].clienteId)!
    const cruzada: DemoFlujoData = { ...data, tareas: [{ ...data.tareas[0], oportunidadId: ajena.id }] }
    expect(checkDemoFlujoData(cruzada).join(" ")).toMatch(/opportunity of another client/)
    expect(checkDemoFlujoData({ ...data, tareas: [] }).join(" ")).toMatch(/Pasar a nuevo proyecto/)
  })
})

describe("planDemoFlujo (idempotency)", () => {
  it("seeds everything on an empty database", () => {
    const plan = planDemoFlujo(data, none())
    expect(plan.decision).toBe("seed")
    expect(plan.clientes).toHaveLength(6)
    expect(plan.oportunidades).toHaveLength(12)
    expect(plan.contactos).toHaveLength(data.contactos.length)
    expect(plan.interacciones).toHaveLength(data.interacciones.length)
    expect(plan.tareas).toHaveLength(data.tareas.length)
  })

  it("changes nothing when every demo id already exists", () => {
    const plan = planDemoFlujo(data, allIds(data))
    expect(plan.decision).toBe("already-seeded")
    expect(plan.clientes).toHaveLength(0)
    expect(plan.oportunidades).toHaveLength(0)
    expect(plan.contactos).toHaveLength(0)
    expect(plan.interacciones).toHaveLength(0)
    expect(plan.tareas).toHaveLength(0)
  })

  it("adds only the commercial task to a database seeded before it existed", () => {
    const existing = allIds(data)
    existing.tareas.clear()
    const plan = planDemoFlujo(data, existing)
    expect(plan.decision).toBe("top-up")
    expect(plan.tareas.map((t) => t.id)).toEqual(data.tareas.map((t) => t.id))
    expect(plan.oportunidades).toHaveLength(0)
  })

  it("tops up only what is missing after an interrupted run", () => {
    const existing = allIds(data)
    existing.oportunidades.delete(data.oportunidades[0].id)
    const plan = planDemoFlujo(data, existing)
    expect(plan.decision).toBe("top-up")
    expect(plan.oportunidades.map((o) => o.id)).toEqual([data.oportunidades[0].id])
    expect(plan.clientes).toHaveLength(0)
  })
})

// V5 (S3, decision L8): the demo clients carry a departamento matching their ubicación city, so the
// Mapa is not empty. The seed stays insert-only for rows; the one exception is filling a NULL
// departamento on a demo client seeded before V5, which a second run no longer finds.
describe("departamento (V5)", () => {
  it("gives every demo client the departamento of its ubicación city, from the demo municipios catalog", () => {
    expect(data.clientes.map((c) => [c.ubicacion, c.departamento])).toEqual([
      ["Barranquilla, Atlántico", "Atlántico"],
      ["Cali, Valle del Cauca", "Valle del Cauca"],
      ["Manizales, Caldas", "Caldas"],
      ["Bucaramanga, Santander", "Santander"],
      ["Bogotá D.C.", "Bogotá D.C."],
      ["Medellín, Antioquia", "Antioquia"],
    ])
  })

  it("flags a demo client without departamento", () => {
    const broken = { ...data, clientes: data.clientes.map((c, i) => (i === 0 ? { ...c, departamento: "" } : c)) }
    expect(checkDemoFlujoData(broken).join("\n")).toMatch(/has no departamento/)
  })

  it("fills the departamento only on existing demo clients that lack it, and nothing else", () => {
    const existing = allIds(data)
    existing.clientesSinDepartamento = new Set([data.clientes[0].id, data.clientes[2].id])
    const plan = planDemoFlujo(data, existing)
    expect(plan.decision).toBe("top-up")
    expect(plan.departamentos).toEqual([
      { id: data.clientes[0].id, departamento: "Atlántico" },
      { id: data.clientes[2].id, departamento: "Caldas" },
    ])
    expect(plan.clientes).toHaveLength(0)
  })

  it("does not plan a departamento fill for clients it is about to create", () => {
    expect(planDemoFlujo(data, none()).departamentos).toEqual([])
  })

  it("reports already seeded once every demo client has its departamento", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@127.0.0.1:54322/postgres")
    const existing = allIds(data)
    existing.clientesSinDepartamento = new Set([data.clientes[1].id])
    const first = fakeClient(existing)
    const writer = vi.fn(async () => ({ lines: [] }))
    await runSeedDemoFlujo(first.client, ["--apply"], () => {}, writer)
    expect(writer).toHaveBeenCalledTimes(1)

    const second = fakeClient(allIds(data))
    const result = await runSeedDemoFlujo(second.client, ["--apply"], () => {}, writer)
    expect(result.mode).toBe("already-seeded")
    expect(writer).toHaveBeenCalledTimes(1)
    vi.unstubAllEnvs()
  })
})

function fakeClient(existing: ExistingIds): { client: DemoFlujoClient; count: { findMany: number } } {
  const count = { findMany: 0 }
  const finder = (set: Set<string>, sinDepartamento?: Set<string>) => ({
    findMany: vi.fn(async (args: { where: { id: { in: string[] }; departamento?: null } }) => {
      count.findMany += 1
      // V5: the departamento backfill reads the existing clients whose departamento is NULL.
      const source = args.where.departamento === null && sinDepartamento ? sinDepartamento : set
      return args.where.id.in.filter((id) => source.has(id)).map((id) => ({ id }))
    }),
  })
  const client = {
    cliente: finder(existing.clientes, existing.clientesSinDepartamento),
    contacto: finder(existing.contactos),
    oportunidad: finder(existing.oportunidades),
    bitacoraEntrada: finder(existing.interacciones),
    tarea: finder(existing.tareas),
  } as unknown as DemoFlujoClient
  return { client, count }
}

describe("runSeedDemoFlujo", () => {
  it("prints the usage for --help without touching the database", async () => {
    const { client, count } = fakeClient(none())
    const out: string[] = []
    const result = await runSeedDemoFlujo(client, ["--help"], (l) => out.push(l), vi.fn())
    expect(result.mode).toBe("help")
    expect(out.join("\n")).toMatch(/Usage/)
    expect(count.findMany).toBe(0)
  })

  it("is a dry run by default: reads, reports the four free GANADA and never calls the writer", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@127.0.0.1:54322/postgres")
    const { client } = fakeClient(none())
    const writer = vi.fn()
    const out: string[] = []
    const result = await runSeedDemoFlujo(client, [], (l) => out.push(l), writer)
    expect(result.mode).toBe("dry-run")
    expect(writer).not.toHaveBeenCalled()
    const text = out.join("\n")
    expect(text).toMatch(/127\.0\.0\.1:54322/)
    expect(text).toMatch(/dry run/i)
    for (const o of data.oportunidades.filter((x) => x.estado === "GANADA")) expect(text).toContain(o.nombre)
    vi.unstubAllEnvs()
  })

  it("calls the writer only with --apply and only with the missing rows", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@127.0.0.1:54322/postgres")
    const { client } = fakeClient(none())
    const writer = vi.fn(async () => ({ lines: ["wrote"] }))
    const out: string[] = []
    await runSeedDemoFlujo(client, ["--apply"], (l) => out.push(l), writer)
    expect(writer).toHaveBeenCalledTimes(1)
    expect(out).toContain("wrote")
    vi.unstubAllEnvs()
  })

  it("does not call the writer when everything is already seeded, even with --apply", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@127.0.0.1:54322/postgres")
    const { client } = fakeClient(allIds(data))
    const writer = vi.fn()
    const out: string[] = []
    const result = await runSeedDemoFlujo(client, ["--apply"], (l) => out.push(l), writer)
    expect(result.mode).toBe("already-seeded")
    expect(writer).not.toHaveBeenCalled()
    expect(out.join("\n")).toMatch(/already seeded/i)
    vi.unstubAllEnvs()
  })

  it("refuses a non-local database before reading anything", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@db.abcdef.supabase.co:5432/postgres")
    const { client, count } = fakeClient(none())
    await expect(runSeedDemoFlujo(client, ["--apply"], () => {}, vi.fn())).rejects.toThrow()
    expect(count.findMany).toBe(0)
    vi.unstubAllEnvs()
  })
})
