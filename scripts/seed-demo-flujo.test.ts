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
})

function allIds(d: DemoFlujoData): ExistingIds {
  return {
    clientes: new Set(d.clientes.map((c) => c.id)),
    contactos: new Set(d.contactos.map((c) => c.id)),
    oportunidades: new Set(d.oportunidades.map((o) => o.id)),
    interacciones: new Set(d.interacciones.map((i) => i.id)),
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
  })

  it("changes nothing when every demo id already exists", () => {
    const plan = planDemoFlujo(data, allIds(data))
    expect(plan.decision).toBe("already-seeded")
    expect(plan.clientes).toHaveLength(0)
    expect(plan.oportunidades).toHaveLength(0)
    expect(plan.contactos).toHaveLength(0)
    expect(plan.interacciones).toHaveLength(0)
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

function fakeClient(existing: ExistingIds): { client: DemoFlujoClient; count: { findMany: number } } {
  const count = { findMany: 0 }
  const finder = (set: Set<string>) => ({
    findMany: vi.fn(async (args: { where: { id: { in: string[] } } }) => {
      count.findMany += 1
      return args.where.id.in.filter((id) => set.has(id)).map((id) => ({ id }))
    }),
  })
  const client = {
    cliente: finder(existing.clientes),
    contacto: finder(existing.contactos),
    oportunidad: finder(existing.oportunidades),
    bitacoraEntrada: finder(existing.interacciones),
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
