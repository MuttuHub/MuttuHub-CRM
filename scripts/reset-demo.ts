/**
 * WHY: Friday's live demo converts a GANADA opportunity into a project, and
 * only two of those opportunities exist — `PRY-2026-001` is a consumable
 * resource, so every rehearsal needs the demo state back. This script restores
 * exactly what the demo path mutated, and nothing else.
 *
 * `planDemoReset` is pure, so the deletion scope is testable without a database:
 * it deletes a project only while `estado` is still the initial `BORRADOR`
 * (anything else is reported, never deleted), returns a converted opportunity
 * to `PROSPECCION` only when that would actually change a value, and drops a
 * `proyecto_secuencias` year row only when no surviving project of that year
 * remains. The project row is hard-deleted on purpose: `proyectos.oportunidad_id`
 * is `@unique` and its index is not partial, so a soft-deleted project would
 * keep blocking a new conversion for the same opportunity.
 *
 * `auditoria_cambios` is never touched: it is append-only by design, its
 * triggers reject UPDATE/DELETE, and a rehearsal is not an auditable business
 * event.
 *
 * The `require-local-db` guard MUST be the first import: ES modules evaluate
 * their imports in order, so it loads `.env.local` and refuses a non-loopback
 * host before `@/lib/db` can build a Prisma client. A dry run is the default;
 * only `--apply` writes.
 */
import "../prisma/require-local-db"

import type {
  EstadoProyecto,
  FaseOportunidad,
  OrigenProyecto,
  Prisma,
} from "@prisma/client"

import { connectionTarget, NonLocalDatabaseError } from "../prisma/local-env"
import { parseProjectCode } from "../src/lib/proyectos/codigo"
import { db } from "../src/lib/db"

/** Reason reported for every project the reset refuses to delete. */
export const KEEP_PROJECT_REASON = "not in its initial state"

/** Reason reported for a counter row a surviving project still needs. */
export const KEEP_SECUENCIA_REASON = "projects of that year remain"

export type DemoProjectRow = {
  id: string
  codigo: string
  nombre: string
  cliente_id: string
  oportunidad_id: string | null
  estado: EstadoProyecto
  origen: OrigenProyecto | null
  created_at: Date
}

export type DemoOportunidadRow = {
  id: string
  nombre: string
  fase: FaseOportunidad
  fecha_adjudicacion: Date | null
}

export type DemoSecuenciaRow = {
  anio: number
  ultimo: number
}

/** Everything the planner reads, in the shape the CLI queries it. */
export type DemoSnapshot = {
  proyectos: DemoProjectRow[]
  oportunidades: DemoOportunidadRow[]
  secuencias: DemoSecuenciaRow[]
}

/** One opportunity the reset returns to its pre-conversion state. */
export type DemoRestore = {
  id: string
  nombre: string
  fase: FaseOportunidad
  fecha_adjudicacion: Date | null
}

export type DemoResetPlan = {
  deleteProjects: DemoProjectRow[]
  keepProjects: { row: DemoProjectRow; reason: string }[]
  restoreOportunidades: DemoRestore[]
  deleteSecuencias: number[]
  keepSecuencias: { anio: number; reason: string }[]
}

export type DemoResetCounts = {
  municipios: number
  lineas: number
  proyectos: number
  oportunidades: number
  secuencias: number
}

/**
 * The minimal write surface `applyDemoReset` needs. Structural on purpose: the
 * unit test drives it with a fake that records the call order, and the CLI
 * hands it the Prisma transaction client.
 */
export type DemoResetClient = {
  proyectoMunicipio: {
    deleteMany(args: { where: { proyecto_id: { in: string[] } } }): Promise<{ count: number }>
  }
  proyectoLinea: {
    deleteMany(args: { where: { proyecto_id: { in: string[] } } }): Promise<{ count: number }>
  }
  proyecto: {
    deleteMany(args: { where: { id: { in: string[] } } }): Promise<{ count: number }>
  }
  oportunidad: {
    update(args: {
      where: { id: string }
      data: { fase: "PROSPECCION"; fecha_adjudicacion: null }
    }): Promise<unknown>
  }
  proyectoSecuencia: {
    deleteMany(args: { where: { anio: { in: number[] } } }): Promise<{ count: number }>
  }
}

export type DemoResetMode = "dry-run" | "apply" | "help"

export type DemoResetDb = {
  $transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T>
}

export type DemoResetRunResult =
  | { mode: "dry-run"; plan: DemoResetPlan }
  | { mode: "apply"; plan: DemoResetPlan; counts: DemoResetCounts }
  | { mode: "help" }

type Printer = (line: string) => void

export const USAGE = [
  "Demo reset — restores the MuttuHub v2 projects demo to its pre-conversion state.",
  "",
  "Usage:",
  "  npx tsx scripts/reset-demo.ts            # dry run: prints the plan, writes nothing",
  "  npx tsx scripts/reset-demo.ts --apply    # applies the plan in ONE transaction",
  "  npx tsx scripts/reset-demo.ts --help     # this message",
  "",
  "Deletes every BORRADOR project with its lineas and municipios, returns the",
  "converted opportunities to PROSPECCION and drops the counter row of the years",
  "left without projects. It only runs against a loopback database and never",
  "touches auditoria_cambios.",
] as const

/**
 * Pure: given the rows currently in the local database, returns the plan that
 * restores the demo. Deterministic and time-free — it never reads the clock, so
 * the same snapshot always yields the same plan. Input order is preserved in
 * every list so the printed report is stable between runs.
 */
export function planDemoReset(snapshot: DemoSnapshot): DemoResetPlan {
  const deleteProjects: DemoProjectRow[] = []
  const keepProjects: { row: DemoProjectRow; reason: string }[] = []

  for (const row of snapshot.proyectos) {
    // Only a project that never left BORRADOR is demo residue. Any sign of
    // work (PLANIFICACION, EN_EJECUCION, a soft delete, ...) is reported and
    // left alone: the reset must never destroy real progress.
    if (row.estado === "BORRADOR") {
      deleteProjects.push(row)
    } else {
      keepProjects.push({ row, reason: KEEP_PROJECT_REASON })
    }
  }

  const oportunidadesById = new Map<string, DemoOportunidadRow>()
  for (const row of snapshot.oportunidades) oportunidadesById.set(row.id, row)

  const restoreOportunidades: DemoRestore[] = []
  const restoredIds = new Set<string>()
  for (const row of deleteProjects) {
    if (row.oportunidad_id === null || restoredIds.has(row.oportunidad_id)) continue

    const oportunidad = oportunidadesById.get(row.oportunidad_id)
    if (!oportunidad) continue

    // A dry run must report only real changes: an opportunity the conversion
    // never touched is already in its initial state.
    if (oportunidad.fase === "PROSPECCION" && oportunidad.fecha_adjudicacion === null) continue

    restoredIds.add(oportunidad.id)
    restoreOportunidades.push({
      id: oportunidad.id,
      nombre: oportunidad.nombre,
      fase: oportunidad.fase,
      fecha_adjudicacion: oportunidad.fecha_adjudicacion,
    })
  }

  // A surviving project keeps its `codigo`, and `proyectos_codigo_key` is
  // unique, so its year's counter row must survive too. `project-code.ts` also
  // re-seeds the counter from the codes already present, so deleting a year row
  // while projects of that year survive could never duplicate a code — but the
  // row is still what the demo's next conversion needs to look restorable.
  const survivingYears = new Set<number>()
  for (const { row } of keepProjects) {
    const parsed = parseProjectCode(row.codigo)
    if (parsed) survivingYears.add(parsed.year)
  }

  const deleteSecuencias: number[] = []
  const keepSecuencias: { anio: number; reason: string }[] = []
  for (const row of snapshot.secuencias) {
    if (survivingYears.has(row.anio)) {
      keepSecuencias.push({ anio: row.anio, reason: KEEP_SECUENCIA_REASON })
    } else {
      deleteSecuencias.push(row.anio)
    }
  }

  return { deleteProjects, keepProjects, restoreOportunidades, deleteSecuencias, keepSecuencias }
}

/**
 * Executes the plan in the only order the schema allows: both child tables have
 * an `ON DELETE RESTRICT` FK to `proyectos`, so lineas and municipios go first;
 * the opportunity restore follows the project deletion (they are independent but
 * keeping every removal together reads better in a transaction log); the counter
 * rows go last.
 */
export async function applyDemoReset(
  tx: DemoResetClient,
  plan: DemoResetPlan,
): Promise<DemoResetCounts> {
  const proyectoIds = plan.deleteProjects.map((row) => row.id)

  const municipios = await tx.proyectoMunicipio.deleteMany({
    where: { proyecto_id: { in: proyectoIds } },
  })
  const lineas = await tx.proyectoLinea.deleteMany({
    where: { proyecto_id: { in: proyectoIds } },
  })
  const proyectos = await tx.proyecto.deleteMany({ where: { id: { in: proyectoIds } } })

  let oportunidades = 0
  for (const row of plan.restoreOportunidades) {
    await tx.oportunidad.update({
      where: { id: row.id },
      data: { fase: "PROSPECCION", fecha_adjudicacion: null },
    })
    oportunidades += 1
  }

  const secuencias = await tx.proyectoSecuencia.deleteMany({
    where: { anio: { in: plan.deleteSecuencias } },
  })

  return {
    municipios: municipios.count,
    lineas: lineas.count,
    proyectos: proyectos.count,
    oportunidades,
    secuencias: secuencias.count,
  }
}

/** `--apply` is the only writing mode; every other argument keeps the dry run. */
export function parseResetArgs(argv: readonly string[]): DemoResetMode {
  if (argv.includes("--help")) return "help"
  return argv.includes("--apply") ? "apply" : "dry-run"
}

/**
 * Reads every row the planner needs. Soft-deleted projects are included on
 * purpose: they hold their unique `codigo` and `oportunidad_id`, so they still
 * shape what a reset may delete.
 */
async function readSnapshot(tx: Prisma.TransactionClient): Promise<DemoSnapshot> {
  const proyectos = await tx.proyecto.findMany({
    select: {
      id: true,
      codigo: true,
      nombre: true,
      cliente_id: true,
      oportunidad_id: true,
      estado: true,
      origen: true,
      created_at: true,
    },
    orderBy: { codigo: "asc" },
  })

  const oportunidades = await tx.oportunidad.findMany({
    select: { id: true, nombre: true, fase: true, fecha_adjudicacion: true },
    orderBy: { nombre: "asc" },
  })

  const secuencias = await tx.proyectoSecuencia.findMany({
    select: { anio: true, ultimo: true },
    orderBy: { anio: "asc" },
  })

  return { proyectos, oportunidades, secuencias }
}

function printReport(result: DemoResetRunResult, print: Printer): void {
  if (result.mode === "help") return

  const { plan } = result
  const host = connectionTarget(process.env.DATABASE_URL) ?? "unknown"
  const heading = result.mode === "apply" ? "Demo reset — apply" : "Demo reset — dry run (no writes)"
  print(`${heading}  (db host: ${host})`)

  print(`Projects to delete (${plan.deleteProjects.length}):`)
  for (const row of plan.deleteProjects) {
    print(`  ${row.codigo} ${row.nombre} ${row.estado} ${row.origen ?? "(no origen)"}`)
  }

  print(`Opportunities returned to PROSPECCION (${plan.restoreOportunidades.length}):`)
  for (const row of plan.restoreOportunidades) {
    print(`  ${row.id} ${row.nombre} ${row.fase} -> PROSPECCION (fecha_adjudicacion -> null)`)
  }

  print(
    `Sequence years to delete (${plan.deleteSecuencias.length}): ${
      plan.deleteSecuencias.length > 0 ? plan.deleteSecuencias.join(", ") : "(none)"
    }`,
  )

  print(`Kept projects (${plan.keepProjects.length}):`)
  for (const item of plan.keepProjects) {
    print(`  ${item.row.codigo} ${item.row.nombre} — ${item.reason}`)
  }

  print(`Kept sequence years (${plan.keepSecuencias.length}):`)
  for (const item of plan.keepSecuencias) {
    print(`  ${item.anio} — ${item.reason}`)
  }

  const summary = [
    `Summary: proyectos=${plan.deleteProjects.length}`,
    `oportunidades=${plan.restoreOportunidades.length}`,
    `secuencias=${plan.deleteSecuencias.length}`,
    `kept_proyectos=${plan.keepProjects.length}`,
    `kept_secuencias=${plan.keepSecuencias.length}`,
  ]
  if (result.mode === "apply") {
    summary.push(`municipios=${result.counts.municipios}`, `lineas=${result.counts.lineas}`)
  }
  print(summary.join(" "))
  if (result.mode === "dry-run") print("Dry run: nothing was written. Re-run with --apply to execute.")
}

/**
 * The one code path the CLI uses for both modes: the snapshot is read and the
 * plan is built inside a single transaction, so a dry run and an apply see the
 * same rows. Only `applyDemoReset` writes, and only the plan it just built.
 */
export async function runDemoReset(
  client: DemoResetDb,
  argv: readonly string[] = process.argv.slice(2),
  print: Printer = (line) => console.log(line),
): Promise<DemoResetRunResult> {
  const mode = parseResetArgs(argv)
  if (mode === "help") {
    for (const line of USAGE) print(line)
    return { mode: "help" }
  }

  const result = await client.$transaction(async (tx) => {
    const snapshot = await readSnapshot(tx as Prisma.TransactionClient)
    const plan = planDemoReset(snapshot)

    if (mode === "apply") {
      const counts = await applyDemoReset(tx as unknown as DemoResetClient, plan)
      return { mode, plan, counts }
    }

    return { mode, plan }
  })

  printReport(result, print)
  return result
}

async function main(): Promise<void> {
  const client: DemoResetDb = {
    $transaction: (fn) => db.$transaction((tx) => fn(tx)),
  }

  await runDemoReset(client, process.argv.slice(2))
}

/** The guard's message is the actionable part; a stack trace only buries it. */
function reportError(error: unknown): void {
  if (error instanceof NonLocalDatabaseError) {
    console.error(error.message)
  } else {
    console.error(error instanceof Error ? error.message : String(error))
  }
  process.exitCode = 1
}

// Only run when invoked as a script. The unit test imports the planner and the
// CLI helpers from this module and must not query a database as an import side
// effect.
const invokedDirectly = (process.argv[1] ?? "")
  .replace(/\\/g, "/")
  .endsWith("scripts/reset-demo.ts")

if (invokedDirectly) {
  main().catch(reportError)
}
