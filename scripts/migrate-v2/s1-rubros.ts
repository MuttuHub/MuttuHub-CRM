/**
 * WHY: REQ-CAT-01 — the 15-rubro catalog R01..R15 is the single source of truth
 * for v2 budget lines. The migration adopts the abandoned v1 `rubros` table that
 * production already has (and seeds nothing on a fresh database); this import
 * brings the catalog to exactly RUBROS_V2. The codes and names come from
 * `src/lib/catalogs.ts`, never a second list here.
 *
 * Contract, shared with `scripts/migrate-v2/_harness.ts`: `--dry-run` reads and
 * reports without opening a transaction, `--apply --expect-hash <sha>` recomputes
 * the plan inside ONE transaction and refuses on a hash mismatch, and
 * `--revert <lote_id>` deletes only the rows that lote created. The lote is
 * tracked through one `auditoria_cambios` row per created rubro (`accion`
 * IMPORTAR, `lote_id`), so revert never touches the adopted R01/R12 rows.
 */
import "./_guard"

import type { Prisma } from "@prisma/client"

import { RUBROS_V2 } from "../../src/lib/catalogs"
import { db } from "../../src/lib/db"
import { logChanges } from "../../src/lib/api/audit-cambios"

import { runMigration, type Plan, type PlanAction, type PlanCount } from "./_harness"

const NAME = "s1-rubros"
const LOTE_USER = "migracion_v2"
const ENTIDAD = "rubro"

export type ExistingRubro = {
  id: string
  codigo: string | null
  nombre: string
  activo: boolean
  orden: number
}

export type RubroAction = {
  key: string
  codigo: string
  nombre: string
  orden: number
  kind: "create" | "update"
}

export type RubroPlan = Plan & { rubros: RubroAction[] }

/**
 * Pure: given the rows currently in `rubros`, returns the plan that brings the
 * catalog to exactly RUBROS_V2. Code-less legacy rows are ignored — they are
 * suspended and have left the catalog. A second call over the plan's own output
 * reports zero actions: that is the idempotency guarantee enforced by the unit
 * test.
 */
export function planRubros(existing: readonly ExistingRubro[]): RubroPlan {
  const byCode = new Map<string, ExistingRubro>()
  for (const rubro of existing) {
    if (rubro.codigo !== null) byCode.set(rubro.codigo, rubro)
  }

  const rubros: RubroAction[] = []
  let toCreate = 0
  let toUpdate = 0
  let skipped = 0

  for (const target of RUBROS_V2) {
    const current = byCode.get(target.codigo)

    if (!current) {
      toCreate += 1
      rubros.push({
        key: `rubro:${target.codigo}`,
        codigo: target.codigo,
        nombre: target.nombre,
        orden: target.orden,
        kind: "create",
      })
      continue
    }

    if (current.nombre === target.nombre && current.orden === target.orden) {
      skipped += 1
      continue
    }

    toUpdate += 1
    rubros.push({
      key: `rubro:${target.codigo}:update`,
      codigo: target.codigo,
      nombre: target.nombre,
      orden: target.orden,
      kind: "update",
    })
  }

  const counts: PlanCount[] = [
    { entity: "rubros", existing: byCode.size, to_create: toCreate, to_update: toUpdate, skipped },
  ]
  const actions: PlanAction[] = rubros.map((rubro) => ({
    key: rubro.key,
    description:
      rubro.kind === "create"
        ? `create rubro ${rubro.codigo} ${rubro.nombre} (orden ${rubro.orden})`
        : `update rubro ${rubro.codigo} to "${rubro.nombre}" (orden ${rubro.orden})`,
  }))

  return { counts, decisions: [], actions, rubros }
}

async function buildPlan(client: unknown): Promise<RubroPlan> {
  const tx = client as Prisma.TransactionClient

  const existing = await tx.rubro.findMany({
    select: { id: true, codigo: true, nombre: true, activo: true, orden: true },
    orderBy: { codigo: "asc" },
  })

  return planRubros(existing)
}

async function applyPlan(client: unknown, plan: Plan, loteId: string): Promise<string[]> {
  const tx = client as Prisma.TransactionClient
  const rubroPlan = plan as RubroPlan
  const applied: string[] = []

  for (const action of rubroPlan.rubros) {
    if (action.kind === "create") {
      const created = await tx.rubro.create({
        data: {
          codigo: action.codigo,
          nombre: action.nombre,
          orden: action.orden,
          activo: true,
        },
      })
      await logChanges(tx, [
        {
          usuario_id: LOTE_USER,
          accion: "IMPORTAR",
          entidad: ENTIDAD,
          entidad_id: created.id,
          lote_id: loteId,
          campo: "codigo",
          valor_anterior: null,
          valor_nuevo: action.codigo,
        },
      ])
    } else {
      const current = await tx.rubro.findUnique({ where: { codigo: action.codigo } })
      if (!current) continue

      await tx.rubro.update({
        where: { id: current.id },
        data: { nombre: action.nombre, orden: action.orden },
      })
      await logChanges(tx, [
        {
          usuario_id: LOTE_USER,
          accion: "EDITAR",
          entidad: ENTIDAD,
          entidad_id: current.id,
          lote_id: loteId,
          campo: "nombre",
          valor_anterior: current.nombre,
          valor_nuevo: action.nombre,
        },
      ])
    }

    applied.push(action.key)
  }

  return applied
}

async function revertPlan(client: unknown, loteId: string): Promise<string[]> {
  const tx = client as Prisma.TransactionClient

  const created = await tx.auditoriaCambio.findMany({
    where: { lote_id: loteId, entidad: ENTIDAD, accion: "IMPORTAR" },
    select: { entidad_id: true },
  })
  const ids = [...new Set(created.map((row) => row.entidad_id))]
  if (ids.length === 0) return []

  await tx.rubro.deleteMany({ where: { id: { in: ids } } })
  return ids
}

async function main(): Promise<void> {
  const result = await runMigration({
    name: NAME,
    db,
    plan: buildPlan,
    apply: applyPlan,
    revert: revertPlan,
  })

  process.exitCode = result.exitCode
}

// Only run when invoked as a script. The unit test imports `planRubros` from
// this module and must not trigger a migration as an import side effect.
const invokedDirectly = (process.argv[1] ?? "")
  .replace(/\\/g, "/")
  .endsWith("scripts/migrate-v2/s1-rubros.ts")

if (invokedDirectly) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
