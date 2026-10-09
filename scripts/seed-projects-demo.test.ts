// @vitest-environment node
/**
 * WHY: the projects demo seed writes approved data that `db:demo:reset:local` cannot
 * delete (append-only triggers), so everything decidable BEFORE a write is pinned here
 * without a database: the CLI modes, the loopback guard, the idempotency decision, the
 * extra-GANADA rule and the consistency of the demo data against the CedeTextil
 * workbook (totals, rubros, periods, dates, https links, exactly one overspend case).
 * The `require-local-db` guard and the Prisma client are mocked: the DB-writing path
 * is verified by the real local run, never here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../prisma/require-local-db", () => ({}))
vi.mock("../src/lib/db", () => ({ db: {} }))

import { toCents } from "../src/lib/proyectos/money"
import {
  F_X1_INICIO,
  F_X1_PERIODOS,
  F_X1_PRESUPUESTO,
  fixtureF_X1,
} from "../src/lib/proyectos/__fixtures__/plantilla-cedetextil"
import {
  MIN_GANADAS_LIBRES,
  assertLocalTarget,
  buildSeedData,
  checkSeedData,
  decideSeed,
  extraGanadaNeeded,
  parseSeedArgs,
  runSeedProjectsDemo,
  type SeedClient,
  type SeedData,
} from "./seed-projects-demo"

const HOY = "2026-10-09"

describe("parseSeedArgs", () => {
  it("is a dry run by default and only --apply writes", () => {
    expect(parseSeedArgs([])).toBe("dry-run")
    expect(parseSeedArgs(["--apply"])).toBe("apply")
    expect(parseSeedArgs(["--help"])).toBe("help")
  })

  it("rejects an unknown argument instead of silently ignoring it", () => {
    expect(() => parseSeedArgs(["--aply"])).toThrow(/Unknown argument/)
  })
})

describe("assertLocalTarget", () => {
  it("accepts loopback and refuses a remote or missing database", () => {
    expect(() => assertLocalTarget("postgresql://u:p@127.0.0.1:54322/postgres")).not.toThrow()
    expect(() => assertLocalTarget("postgresql://u:p@db.abcdef.supabase.co:5432/postgres")).toThrow()
    expect(() => assertLocalTarget(undefined)).toThrow()
  })
})

describe("decideSeed / extraGanadaNeeded", () => {
  it("skips when the marker project already exists", () => {
    expect(decideSeed(0)).toBe("seed")
    expect(decideSeed(1)).toBe("already-seeded")
  })

  it("adds one extra GANADA only while fewer than three free ones remain", () => {
    expect(MIN_GANADAS_LIBRES).toBe(3)
    expect(extraGanadaNeeded(2)).toBe(true)
    expect(extraGanadaNeeded(0)).toBe(true)
    expect(extraGanadaNeeded(3)).toBe(false)
    expect(extraGanadaNeeded(5)).toBe(false)
  })
})

describe("buildSeedData consistency", () => {
  it("is consistent with the F-X1 workbook for a date inside the project", () => {
    expect(checkSeedData(buildSeedData(HOY))).toEqual([])
  })

  it.each(["2026-10-05", "2026-10-06", "2026-12-15", "2027-03-01"])("never dates a record after today (%s)", (hoy) => {
    const data = buildSeedData(hoy)
    for (const avance of data.avances) expect(avance.fecha <= hoy).toBe(true)
    for (const medicion of data.mediciones) expect(medicion.fecha <= hoy).toBe(true)
    for (const gasto of data.gastos) expect(gasto.fechaDocumento <= hoy).toBe(true)
  })

  it("uses only entregables and indicators of the workbook and never exceeds a goal", () => {
    const { estructura } = fixtureF_X1("valido")
    const metas = new Map(estructura.entregables.map((e) => [e.codigo, Number(e.cantidad)]))
    const acumulado = new Map<string, number>()
    for (const avance of buildSeedData(HOY).avances) {
      expect(metas.has(avance.entregable)).toBe(true)
      acumulado.set(avance.entregable, (acumulado.get(avance.entregable) ?? 0) + Number(avance.cantidad))
    }
    for (const [codigo, total] of acumulado) expect(total).toBeLessThanOrEqual(metas.get(codigo) ?? 0)
    const indicadores = new Set(estructura.indicadores.map((i) => i.codigo))
    for (const medicion of buildSeedData(HOY).mediciones) expect(indicadores.has(medicion.indicador)).toBe(true)
  })

  it("keeps validated spend within each rubro and has exactly one overspend case", () => {
    const data = buildSeedData(HOY)
    const validado = new Map<string, bigint>()
    for (const gasto of data.gastos.filter((g) => g.accion === "VALIDAR")) {
      validado.set(gasto.rubro, (validado.get(gasto.rubro) ?? BigInt(0)) + toCents(gasto.valor))
    }
    for (const [rubro, total] of validado) expect(total <= toCents(F_X1_PRESUPUESTO[rubro])).toBe(true)

    const sobre = data.gastos.filter((g) => g.accion === "INTENTAR_VALIDAR")
    expect(sobre).toHaveLength(1)
    expect(toCents(sobre[0].valor) > toCents(F_X1_PRESUPUESTO[sobre[0].rubro])).toBe(true)
  })

  it("covers REGISTRADO and VALIDADO expenses, each with an https support", () => {
    const data = buildSeedData(HOY)
    const acciones = new Set(data.gastos.map((g) => g.accion))
    expect(acciones.has("VALIDAR")).toBe(true)
    expect(acciones.has("REGISTRAR")).toBe(true)
    for (const gasto of data.gastos) {
      expect(gasto.soportes.length).toBeGreaterThanOrEqual(1)
      expect(F_X1_PERIODOS as readonly string[]).toContain(gasto.periodo)
      for (const soporte of gasto.soportes) expect(soporte.url.startsWith("https://")).toBe(true)
    }
    const conMedio = data.avances.filter((a) => a.medios.length > 0)
    expect(conMedio.length).toBeGreaterThanOrEqual(2)
    expect(data.avances.some((a) => a.medios.length === 0)).toBe(true)
  })

  it("flags a broken dataset", () => {
    const base = buildSeedData(HOY)
    const rotoFecha: SeedData = { ...base, avances: [{ ...base.avances[0], fecha: "2099-01-01" }, ...base.avances.slice(1)] }
    expect(checkSeedData(rotoFecha, HOY).join(" ")).toMatch(/after today/)
    const rotoUrl: SeedData = {
      ...base,
      gastos: [{ ...base.gastos[0], soportes: [{ nombre: "x", url: "http://x.test" }] }, ...base.gastos.slice(1)],
    }
    expect(checkSeedData(rotoUrl, HOY).join(" ")).toMatch(/https/)
    const sinSobre: SeedData = { ...base, gastos: base.gastos.filter((g) => g.accion !== "INTENTAR_VALIDAR") }
    expect(checkSeedData(sinSobre, HOY).join(" ")).toMatch(/overspend/)
  })

  it("starts from the workbook start date", () => {
    expect(F_X1_INICIO).toBe("2026-10-05")
  })
})

type Calls = string[]

function fakeClient(over: { marker?: number; libres?: number } = {}): { client: SeedClient; calls: Calls } {
  const calls: Calls = []
  const client = {
    proyecto: {
      count: vi.fn(async () => {
        calls.push("proyecto.count")
        return over.marker ?? 0
      }),
    },
    oportunidad: {
      count: vi.fn(async () => {
        calls.push("oportunidad.count")
        return over.libres ?? 2
      }),
    },
  } as unknown as SeedClient
  return { client, calls }
}

describe("runSeedProjectsDemo", () => {
  const original = process.env.DATABASE_URL
  beforeEach(() => {
    process.env.DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
  })
  afterEach(() => {
    process.env.DATABASE_URL = original
  })

  it("dry run prints the host and the plan and never calls the writer", async () => {
    const { client } = fakeClient()
    const writer = vi.fn()
    const out: string[] = []
    const result = await runSeedProjectsDemo(client, [], (l) => out.push(l), writer, HOY)
    expect(result.mode).toBe("dry-run")
    expect(writer).not.toHaveBeenCalled()
    const text = out.join("\n")
    expect(text).toContain("db host: 127.0.0.1:54322")
    expect(text).toMatch(/dry run/i)
    expect(text).toMatch(/extra GANADA/i)
  })

  it("apply calls the writer exactly once when the marker is absent", async () => {
    const { client } = fakeClient()
    const writer = vi.fn(async () => ({ lines: ["wrote A", "wrote B"] }))
    const out: string[] = []
    await runSeedProjectsDemo(client, ["--apply"], (l) => out.push(l), writer, HOY)
    expect(writer).toHaveBeenCalledTimes(1)
    expect(out.join("\n")).toContain("wrote B")
  })

  it("a second run is a no-op that says nothing was changed", async () => {
    const { client } = fakeClient({ marker: 1 })
    const writer = vi.fn()
    const out: string[] = []
    const result = await runSeedProjectsDemo(client, ["--apply"], (l) => out.push(l), writer, HOY)
    expect(result.mode).toBe("already-seeded")
    expect(writer).not.toHaveBeenCalled()
    expect(out.join("\n")).toMatch(/already seeded.*nothing was changed/i)
  })

  it("refuses a non-local database before any query", async () => {
    process.env.DATABASE_URL = "postgresql://u:p@db.abcdef.supabase.co:5432/postgres"
    const { client, calls } = fakeClient()
    await expect(runSeedProjectsDemo(client, ["--apply"], () => {}, vi.fn(), HOY)).rejects.toThrow()
    expect(calls).toEqual([])
  })
})
