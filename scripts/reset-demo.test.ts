/**
 * WHY: `planDemoReset` decides what the demo reset removes, and `applyDemoReset`
 * decides in which order. Both are the whole safety story of a script that
 * hard-deletes rows, so they are pinned here with plain fixtures — no database,
 * no network, no transaction. The `require-local-db` guard and the `db` client
 * of the script are mocked away: this file covers the pure planner, the write
 * order and the CLI mode parsing, never the live database.
 *
 * The load-bearing invariants: only `BORRADOR` projects are deleted, an
 * opportunity is returned to `PROSPECCION` only when that would change a value,
 * a year's sequence row survives while any project of that year survives, and a
 * dry run issues zero mutating calls.
 */
import { describe, expect, it, vi } from "vitest"

vi.mock("../prisma/require-local-db", () => ({}))
vi.mock("../src/lib/db", () => ({ db: {} }))

import {
  applyDemoReset,
  parseResetArgs,
  planDemoReset,
  runDemoReset,
  type DemoProjectRow,
  type DemoResetClient,
  type DemoResetCounts,
  type DemoResetPlan,
  type DemoSnapshot,
} from "./reset-demo"

type Call = { op: string; args: unknown }

function proyecto(
  overrides: Partial<DemoProjectRow> & Pick<DemoProjectRow, "id" | "codigo">,
): DemoProjectRow {
  return {
    nombre: `Proyecto ${overrides.codigo}`,
    cliente_id: "cli-1",
    oportunidad_id: null,
    estado: "BORRADOR",
    origen: "OPORTUNIDAD",
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  }
}

function snapshot(overrides: Partial<DemoSnapshot>): DemoSnapshot {
  return { proyectos: [], oportunidades: [], secuencias: [], ...overrides }
}

describe("planDemoReset — deletion scope", () => {
  it("deletes BORRADOR projects and keeps every other project with its reason", () => {
    const draft = proyecto({ id: "p1", codigo: "PRY-2026-001", oportunidad_id: "o1" })
    const advanced = proyecto({
      id: "p2",
      codigo: "PRY-2026-002",
      estado: "PLANIFICACION",
      oportunidad_id: "o2",
    })

    const plan = planDemoReset(
      snapshot({
        proyectos: [draft, advanced],
        oportunidades: [
          { id: "o1", nombre: "Oportunidad uno", fase: "EJECUCION", fecha_adjudicacion: new Date("2026-02-01T00:00:00.000Z") },
          { id: "o2", nombre: "Oportunidad dos", fase: "EJECUCION", fecha_adjudicacion: new Date("2026-03-01T00:00:00.000Z") },
        ],
        secuencias: [{ anio: 2026, ultimo: 2 }],
      }),
    )

    expect(plan.deleteProjects).toEqual([draft])
    expect(plan.keepProjects).toEqual([{ row: advanced, reason: "not in its initial state" }])
    // p2 survives, so its opportunity is part of the demo state and is NOT restored.
    expect(plan.restoreOportunidades.map((row) => row.id)).toEqual(["o1"])
    // A surviving PRY-2026 project still needs the counter row.
    expect(plan.deleteSecuencias).toEqual([])
    expect(plan.keepSecuencias).toEqual([{ anio: 2026, reason: "projects of that year remain" }])
  })

  it("treats current values as an independent axis from the project row", () => {
    const draft = proyecto({ id: "p9", codigo: "PRY-2026-009" })
    const plan = planDemoReset(
      snapshot({
        proyectos: [draft],
        oportunidades: [
          { id: "o9", nombre: "Sin fase", fase: "EJECUCION", fecha_adjudicacion: new Date("2026-01-02T00:00:00.000Z") },
        ],
        secuencias: [],
      }),
    )

    expect(plan.keepProjects).toEqual([])
    expect(plan.deleteProjects).toEqual([draft])
  })
})

describe("planDemoReset — opportunity restore", () => {
  it("omits an opportunity already at its initial state and restores the ones that changed", () => {
    const plan = planDemoReset(
      snapshot({
        proyectos: [
          proyecto({ id: "p1", codigo: "PRY-2026-001", oportunidad_id: "o-unchanged" }),
          proyecto({ id: "p2", codigo: "PRY-2026-002", oportunidad_id: "o-ejecucion" }),
          proyecto({ id: "p3", codigo: "PRY-2026-003", oportunidad_id: "o-fecha" }),
          proyecto({ id: "p4", codigo: "PRY-2026-004", oportunidad_id: null, origen: "INDEPENDIENTE" }),
        ],
        oportunidades: [
          { id: "o-unchanged", nombre: "Ya en prospección", fase: "PROSPECCION", fecha_adjudicacion: null },
          { id: "o-ejecucion", nombre: "Convertida", fase: "EJECUCION", fecha_adjudicacion: null },
          { id: "o-fecha", nombre: "Con fecha", fase: "PROSPECCION", fecha_adjudicacion: new Date("2026-05-05T00:00:00.000Z") },
        ],
        secuencias: [{ anio: 2026, ultimo: 4 }],
      }),
    )

    expect(plan.restoreOportunidades).toEqual([
      { id: "o-ejecucion", nombre: "Convertida", fase: "EJECUCION", fecha_adjudicacion: null },
      {
        id: "o-fecha",
        nombre: "Con fecha",
        fase: "PROSPECCION",
        fecha_adjudicacion: new Date("2026-05-05T00:00:00.000Z"),
      },
    ])
  })
})

describe("planDemoReset — sequence rows", () => {
  it("deletes a year row only when no surviving project of that year remains", () => {
    const plan = planDemoReset(
      snapshot({
        proyectos: [
          proyecto({ id: "p-2025", codigo: "PRY-2025-001", estado: "BORRADOR" }),
          proyecto({ id: "p-2026", codigo: "PRY-2026-002", estado: "CERRADO" }),
          proyecto({ id: "p-2026-draft", codigo: "PRY-2026-003", estado: "BORRADOR" }),
        ],
        oportunidades: [],
        secuencias: [
          { anio: 2026, ultimo: 3 },
          { anio: 2025, ultimo: 1 },
          { anio: 2024, ultimo: 7 },
        ],
      }),
    )

    expect(plan.deleteSecuencias).toEqual([2025, 2024])
    expect(plan.keepSecuencias).toEqual([{ anio: 2026, reason: "projects of that year remain" }])
  })

  it("deletes a year row with no projects at all", () => {
    const plan = planDemoReset(
      snapshot({ proyectos: [], oportunidades: [], secuencias: [{ anio: 2026, ultimo: 0 }] }),
    )

    expect(plan.deleteSecuencias).toEqual([2026])
    expect(plan.keepSecuencias).toEqual([])
  })

  it("ignores a non-canonical code when collecting surviving years", () => {
    const plan = planDemoReset(
      snapshot({
        proyectos: [
          proyecto({ id: "p-bad", codigo: "PRY-2026-0002", estado: "PLANIFICACION" }),
          proyecto({ id: "p-good", codigo: "PRY-2026-002", estado: "PLANIFICACION" }),
        ],
        oportunidades: [],
        secuencias: [{ anio: 2026, ultimo: 2 }],
      }),
    )

    expect(plan.keepSecuencias).toEqual([{ anio: 2026, reason: "projects of that year remain" }])
    expect(plan.deleteSecuencias).toEqual([])
  })
})

describe("applyDemoReset", () => {
  it("deletes municipios, then lineas, then proyectos, restores oportunidades, then secuencias", async () => {
    const calls: Call[] = []
    const tx: DemoResetClient = {
      proyectoMunicipio: {
        deleteMany: async (args) => {
          calls.push({ op: "municipios", args })
          return { count: 3 }
        },
      },
      proyectoLinea: {
        deleteMany: async (args) => {
          calls.push({ op: "lineas", args })
          return { count: 4 }
        },
      },
      proyecto: {
        deleteMany: async (args) => {
          calls.push({ op: "proyectos", args })
          return { count: 2 }
        },
      },
      oportunidad: {
        update: async (args) => {
          calls.push({ op: "oportunidad.update", args })
          return {}
        },
      },
      proyectoSecuencia: {
        deleteMany: async (args) => {
          calls.push({ op: "secuencias", args })
          return { count: 1 }
        },
      },
    }

    const plan: DemoResetPlan = {
      deleteProjects: [
        proyecto({ id: "p1", codigo: "PRY-2025-001" }),
        proyecto({ id: "p2", codigo: "PRY-2025-002" }),
      ],
      keepProjects: [],
      restoreOportunidades: [
        { id: "o1", nombre: "Convertida", fase: "EJECUCION", fecha_adjudicacion: null },
      ],
      deleteSecuencias: [2025],
      keepSecuencias: [],
    }

    const counts = await applyDemoReset(tx, plan)

    expect(calls.map((call) => call.op)).toEqual([
      "municipios",
      "lineas",
      "proyectos",
      "oportunidad.update",
      "secuencias",
    ])
    expect(calls[0].args).toEqual({ where: { proyecto_id: { in: ["p1", "p2"] } } })
    expect(calls[1].args).toEqual({ where: { proyecto_id: { in: ["p1", "p2"] } } })
    expect(calls[2].args).toEqual({ where: { id: { in: ["p1", "p2"] } } })
    expect(calls[3].args).toEqual({
      where: { id: "o1" },
      data: { fase: "PROSPECCION", fecha_adjudicacion: null },
    })
    expect(calls[4].args).toEqual({ where: { anio: { in: [2025] } } })
    expect(counts).toEqual<DemoResetCounts>({
      municipios: 3,
      lineas: 4,
      proyectos: 2,
      oportunidades: 1,
      secuencias: 1,
    })
  })

  it("issues no opportunity update when nothing is restored", async () => {
    const calls: Call[] = []
    const tx = {
      proyectoMunicipio: { deleteMany: async () => ({ count: 0 }) },
      proyectoLinea: { deleteMany: async () => ({ count: 0 }) },
      proyecto: { deleteMany: async () => ({ count: 0 }) },
      oportunidad: {
        update: async (args: unknown) => {
          calls.push({ op: "oportunidad.update", args })
          return {}
        },
      },
      proyectoSecuencia: { deleteMany: async () => ({ count: 0 }) },
    } as unknown as DemoResetClient

    const plan: DemoResetPlan = {
      deleteProjects: [],
      keepProjects: [],
      restoreOportunidades: [],
      deleteSecuencias: [],
      keepSecuencias: [],
    }

    const counts = await applyDemoReset(tx, plan)

    expect(calls).toEqual([])
    expect(counts.oportunidades).toBe(0)
  })
})

describe("parseResetArgs", () => {
  it("treats --apply as the only writing mode and anything else as a dry run", () => {
    expect(parseResetArgs(["--apply"])).toBe("apply")
    expect(parseResetArgs([])).toBe("dry-run")
    expect(parseResetArgs(["--dry-run"])).toBe("dry-run")
    expect(parseResetArgs(["--unexpected"])).toBe("dry-run")
  })

  it("reports the documented usage regardless of the other flags", () => {
    expect(parseResetArgs(["--help"])).toBe("help")
    expect(parseResetArgs(["--apply", "--help"])).toBe("help")
  })
})

describe("runDemoReset", () => {
  it("writes nothing on the default mode and reports the plan", async () => {
    const calls: Call[] = []
    const draft = proyecto({ id: "p1", codigo: "PRY-2026-001", oportunidad_id: "o1" })
    const tx = {
      proyecto: { findMany: async () => [draft] },
      oportunidad: {
        findMany: async () => [
          { id: "o1", nombre: "Convertida", fase: "EJECUCION", fecha_adjudicacion: null },
        ],
        update: async (args: unknown) => {
          calls.push({ op: "oportunidad.update", args })
          return {}
        },
      },
      proyectoSecuencia: {
        findMany: async () => [{ anio: 2026, ultimo: 1 }],
        deleteMany: async (args: unknown) => {
          calls.push({ op: "secuencias", args })
          return { count: 0 }
        },
      },
      proyectoMunicipio: {
        deleteMany: async (args: unknown) => {
          calls.push({ op: "municipios", args })
          return { count: 0 }
        },
      },
      proyectoLinea: {
        deleteMany: async (args: unknown) => {
          calls.push({ op: "lineas", args })
          return { count: 0 }
        },
      },
    }

    const output: string[] = []
    const result = await runDemoReset({ $transaction: async (fn) => fn(tx) }, [], (line) =>
      output.push(line),
    )

    expect(result.mode).toBe("dry-run")
    if (result.mode !== "dry-run") throw new Error("unreachable")
    expect(result.plan.deleteProjects.map((row) => row.id)).toEqual(["p1"])
    expect(result.plan.restoreOportunidades.map((row) => row.id)).toEqual(["o1"])
    expect(calls).toEqual([])
    expect(output.join("\n")).toContain("PRY-2026-001")
  })

  it("prints usage for --help without opening a transaction", async () => {
    const output: string[] = []
    const result = await runDemoReset(
      {
        $transaction: async () => {
          throw new Error("--help must not query the database")
        },
      },
      ["--help"],
      (line) => output.push(line),
    )

    expect(result.mode).toBe("help")
    expect(output.join("\n")).toContain("--apply")
  })
})
