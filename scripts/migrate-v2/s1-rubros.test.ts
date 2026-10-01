/**
 * WHY: `planRubros` decides what the S1.1a import will create or touch. It is a
 * pure function of the rows already in the local `rubros` table, so it is pinned
 * here with plain fixtures — no database, no network, no transaction. The
 * `_guard`/`db` imports of the script are mocked away: this file covers the pure
 * planner only, exactly as S1.1a asks.
 */
import { describe, expect, it, vi } from "vitest"

vi.mock("./_guard", () => ({}))
vi.mock("../../src/lib/db", () => ({ db: {} }))

import { planRubros, type ExistingRubro, type RubroAction } from "./s1-rubros"

const EXPECTED_CODES = [
  "R01",
  "R02",
  "R03",
  "R04",
  "R05",
  "R06",
  "R07",
  "R08",
  "R09",
  "R10",
  "R11",
  "R12",
  "R13",
  "R14",
  "R15",
] as const

function row(
  overrides: Pick<ExistingRubro, "codigo" | "nombre" | "orden"> & { id?: string },
): ExistingRubro {
  return {
    id: overrides.id ?? `id-${overrides.codigo}`,
    activo: true,
    codigo: overrides.codigo,
    nombre: overrides.nombre,
    orden: overrides.orden,
  }
}

function migratedRows(actions: readonly RubroAction[]): ExistingRubro[] {
  return actions.map((action, index) =>
    row({ codigo: action.codigo, nombre: action.nombre, orden: action.orden, id: `id-${index}` }),
  )
}

describe("planRubros", () => {
  it("planRubros seeds the 15 R01–R15 rubros in code order", () => {
    const plan = planRubros([])

    expect(plan.rubros.map((rubro) => rubro.codigo)).toEqual([...EXPECTED_CODES])
    expect(plan.rubros.every((rubro) => rubro.kind === "create")).toBe(true)
    expect(plan.rubros.map((rubro) => rubro.orden)).toEqual(
      Array.from({ length: 15 }, (_, index) => index + 1),
    )
    expect(plan.counts).toEqual([
      { entity: "rubros", existing: 0, to_create: 15, to_update: 0, skipped: 0 },
    ])
    expect(plan.actions).toHaveLength(15)
  })

  it("planRubros is idempotent: a second run reports 0 actions", () => {
    const first = planRubros([])
    const second = planRubros(migratedRows(first.rubros))

    expect(second.actions).toEqual([])
    expect(second.rubros).toEqual([])
    expect(second.counts).toEqual([
      { entity: "rubros", existing: 15, to_create: 0, to_update: 0, skipped: 15 },
    ])
  })

  it("detects renamed or reordered rows as updates, not creates", () => {
    const first = planRubros([])
    const existing = migratedRows(first.rubros)
    // Rename R05 and reorder R09; every other row is already correct.
    const mutated = existing.map((rubro) =>
      rubro.codigo === "R05"
        ? { ...rubro, nombre: "Alistamiento antiguo" }
        : rubro.codigo === "R09"
          ? { ...rubro, orden: 99 }
          : rubro,
    )

    const plan = planRubros(mutated)

    expect(plan.rubros.map((rubro) => rubro.codigo)).toEqual(["R05", "R09"])
    expect(plan.rubros.every((rubro) => rubro.kind === "update")).toBe(true)
    expect(plan.counts).toEqual([
      { entity: "rubros", existing: 15, to_create: 0, to_update: 2, skipped: 13 },
    ])
    expect(plan.actions.map((action) => action.key)).toEqual([
      "rubro:R05:update",
      "rubro:R09:update",
    ])
  })

  it("ignores code-less legacy rows and counts only coded rubros as existing", () => {
    const plan = planRubros([
      row({ codigo: null, nombre: "Material POP", orden: 3 }),
      row({ codigo: null, nombre: "Operación logística", orden: 4 }),
    ])

    expect(plan.counts).toEqual([
      { entity: "rubros", existing: 0, to_create: 15, to_update: 0, skipped: 0 },
    ])
    expect(plan.actions).toHaveLength(15)
  })
})
