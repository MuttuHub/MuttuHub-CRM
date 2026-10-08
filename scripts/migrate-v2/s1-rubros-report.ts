/**
 * WHY: decision N-13 leaves "Material POP" and "Operación logística" out of the
 * 15-rubro catalog, but their amounts still sit on existing budget lines and
 * must be reassigned by hand later. Before anyone touches data, the team needs a
 * count-first, read-only list of budget lines on a suspended rubro per project.
 *
 * This script opens no write path: it imports the guard first, reads counts and
 * prints the §4.5 report through the harness in forced dry-run mode. The v2
 * budget schema arrives with S5 U2; if the table is absent it reports zero rows
 * and says so instead of inventing numbers. S1.1b adds the amount per project.
 * Counts of expenses wait for S6 (no gastos table yet).
 */
import "./_guard"

import { db } from "../../src/lib/db"

import { runMigration } from "./_harness"
import { buildPlan } from "./s1-rubros-report-plan"

const NAME = "s1-rubros-report"

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
