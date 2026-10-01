/**
 * WHY: decision N-13 leaves "Material POP" and "Operación logística" out of the
 * 15-rubro catalog, but their amounts still sit on existing budget lines and
 * must be reassigned by hand later. Before anyone touches data, the team needs a
 * count-first, read-only list of budget lines on a suspended rubro per project.
 *
 * This script opens no write path: it imports the guard first, reads counts and
 * prints the §4.5 report through the harness in forced dry-run mode. The v2
 * budget schema does not exist yet (S1.1a/S5.1 add it), so on the current local
 * database it reports zero rows and says so instead of inventing numbers.
 */
import "./_guard"

import { db } from "../../src/lib/db"

import { runMigration, type Plan, type PlanCount, type PlanDecision } from "./_harness"

const NAME = "s1-rubros-report"

type RawClient = { $queryRawUnsafe<T = unknown>(sql: string, ...params: unknown[]): Promise<T> }
type TableProbe = { lineas: string | null; rubros: string | null }
type SuspendidoRow = { proyecto_id: string; lineas: number }

function pendingSchemaPlan(): Plan {
  const counts: PlanCount[] = [
    {
      entity: "lineas_presupuestales → rubros suspendidos",
      existing: 0,
      to_create: 0,
      to_update: 0,
      skipped: 0,
    },
  ]

  const decisions: PlanDecision[] = [
    {
      id: "N-13",
      rule: "suspended rubro pending reassignment",
      project: "-",
      row: "-",
      detail: "The v2 budget schema is not migrated yet, so there are no lines to reassign.",
      default: "reassign manually later (S1.1b)",
    },
  ]

  return { counts, decisions, actions: [] }
}

function planFromRows(rows: SuspendidoRow[]): Plan {
  const total = rows.reduce((sum, row) => sum + row.lineas, 0)
  const counts: PlanCount[] = [
    {
      entity: "lineas_presupuestales → rubros suspendidos",
      existing: total,
      to_create: 0,
      to_update: 0,
      skipped: 0,
    },
    ...rows.map((row) => ({
      entity: `proyecto ${row.proyecto_id}`,
      existing: row.lineas,
      to_create: 0,
      to_update: 0,
      skipped: 0,
    })),
  ]

  const decisions: PlanDecision[] = rows.map((row) => ({
    id: "N-13",
    rule: "suspended rubro pending reassignment",
    project: row.proyecto_id,
    row: "-",
    detail: `${row.lineas} budget line(s) on a suspended rubro`,
    default: "reassign manually later (S1.1b)",
  }))

  return { counts, decisions, actions: [] }
}

async function buildPlan(tx: unknown): Promise<Plan> {
  const client = tx as RawClient

  const [tables] = await client.$queryRawUnsafe<TableProbe[]>(
    "SELECT to_regclass('public.lineas_presupuestales')::text AS lineas, to_regclass('public.rubros')::text AS rubros",
  )

  if (!tables?.lineas || !tables?.rubros) return pendingSchemaPlan()

  const rows = await client.$queryRawUnsafe<SuspendidoRow[]>(
    `SELECT lp.proyecto_id AS proyecto_id, count(*)::int AS lineas
       FROM lineas_presupuestales lp
       JOIN rubros r ON r.id = lp.rubro_id
      WHERE r.activo = false
      GROUP BY lp.proyecto_id
      ORDER BY lp.proyecto_id`,
  )

  return planFromRows(rows)
}

async function main(): Promise<void> {
  const result = await runMigration({
    name: NAME,
    argv: ["--dry-run"],
    db,
    plan: buildPlan,
    apply: async () => {
      throw new Error("s1-rubros-report is read-only: --apply is not supported.")
    },
  })

  process.exitCode = result.exitCode
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
