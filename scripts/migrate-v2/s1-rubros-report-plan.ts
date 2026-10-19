/**
 * Read-only planner of the suspended-rubro report (S1.1a/S1.1b). Kept apart from
 * the script entry so it can be tested with a fake client: no guard, no db import.
 */
import type { Plan, PlanCount, PlanDecision } from "./_harness"

type RawClient = { $queryRawUnsafe<T = unknown>(sql: string, ...params: unknown[]): Promise<T> }
type TableProbe = { lineas: string | null; rubros: string | null }
type SuspendidoRow = { proyecto_id: string; lineas: number; monto: string }

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
    detail: `${row.lineas} budget line(s) on a suspended rubro, total ${row.monto} COP`,
    default: "reassign manually later (S1.1b)",
  }))

  return { counts, decisions, actions: [] }
}

export async function buildPlan(tx: unknown): Promise<Plan> {
  const client = tx as RawClient

  const [tables] = await client.$queryRawUnsafe<TableProbe[]>(
    "SELECT to_regclass('public.lineas_presupuestales')::text AS lineas, to_regclass('public.rubros')::text AS rubros",
  )

  if (!tables?.lineas || !tables?.rubros) return pendingSchemaPlan()

  const rows = await client.$queryRawUnsafe<SuspendidoRow[]>(
    `SELECT lp.proyecto_id AS proyecto_id, count(*)::int AS lineas,
            coalesce(sum(lp.monto_proyectado_cop), 0)::numeric(15,2)::text AS monto
       FROM lineas_presupuestales lp
       JOIN rubros r ON r.id = lp.rubro_id
      WHERE r.activo = false
      GROUP BY lp.proyecto_id
      ORDER BY lp.proyecto_id`,
  )

  return planFromRows(rows)
}

