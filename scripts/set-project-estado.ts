/**
 * WHY: manual QA of the execution module needs a project that is already EN_EJECUCION.
 * The real way there is the baseline approval (POST /projects/:id/baseline/approve, S8),
 * which also freezes version 0. This is a LOCAL-ONLY QA tool, not a feature: it sets
 * `proyectos.estado` for one project and audits the change, WITHOUT creating v0, so a
 * project moved this way cannot take modifications or `base=original` (the script warns).
 * Do not add an API route that changes `estado` outside the baseline approval.
 *
 *   npx tsx scripts/set-project-estado.ts PRY-2026-001 EN_EJECUCION                   # dry run
 *   npx tsx scripts/set-project-estado.ts PRY-2026-001 EN_EJECUCION --actor me@x --apply
 *
 * The `require-local-db` guard MUST be the first import: it loads `.env.local`
 * and refuses a non-loopback database before `@/lib/db` builds a Prisma client,
 * exactly like `scripts/reset-demo.ts`. A dry run is the default; only `--apply`
 * writes, and it needs `--actor <email>` (an existing user) for the audit row.
 */
import "../prisma/require-local-db"

import type { EstadoProyecto, Prisma } from "@prisma/client"

import { connectionTarget } from "../prisma/local-env"
import { logChange } from "../src/lib/api/audit-cambios"
import { db } from "../src/lib/db"

const ESTADOS: readonly EstadoProyecto[] = [
  "PLANIFICACION",
  "BORRADOR",
  "EN_EJECUCION",
  "SUSPENDIDO",
  "CERRADO",
  "CANCELADO",
]

export type SetEstadoMode = "dry-run" | "apply" | "help"

export type SetEstadoArgs = {
  mode: SetEstadoMode
  proyecto: string
  estado: EstadoProyecto
  actor: string | null
}

export type SetEstadoDb = { $transaction: <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T> }

type Printer = (line: string) => void

const USAGE = [
  "Usage:",
  "  npx tsx scripts/set-project-estado.ts <codigo|id> <ESTADO>                       # dry run (default)",
  "  npx tsx scripts/set-project-estado.ts <codigo|id> <ESTADO> --actor <email> --apply",
  `ESTADO: ${ESTADOS.join(" | ")}`,
]

export function parseSetEstadoArgs(argv: readonly string[]): SetEstadoArgs {
  if (argv.includes("--help")) return { mode: "help", proyecto: "", estado: "BORRADOR", actor: null }

  const positional: string[] = []
  let actor: string | null = null
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--apply") continue
    if (arg === "--actor") {
      actor = argv[i + 1] ?? null
      i += 1
      continue
    }
    positional.push(arg)
  }

  const [proyecto, estado] = positional
  if (!proyecto || !estado) throw new Error("Missing arguments: <codigo|id> <ESTADO>. Use --help.")
  if (!ESTADOS.includes(estado as EstadoProyecto)) {
    throw new Error(`Unknown estado "${estado}". Expected one of: ${ESTADOS.join(", ")}.`)
  }

  return { mode: argv.includes("--apply") ? "apply" : "dry-run", proyecto, estado: estado as EstadoProyecto, actor }
}

export async function runSetEstado(
  client: SetEstadoDb,
  argv: readonly string[] = process.argv.slice(2),
  print: Printer = (line) => console.log(line),
): Promise<{ mode: SetEstadoMode }> {
  const args = parseSetEstadoArgs(argv)
  if (args.mode === "help") {
    for (const line of USAGE) print(line)
    return { mode: "help" }
  }
  if (args.mode === "apply" && !args.actor) {
    throw new Error("--apply needs --actor <email> so the change can be audited.")
  }

  await client.$transaction(async (tx) => {
    const proyecto = await tx.proyecto.findFirst({
      where: { OR: [{ id: args.proyecto }, { codigo: args.proyecto }], deleted_at: null },
      select: { id: true, codigo: true, nombre: true, estado: true },
    })
    if (!proyecto) throw new Error(`Project "${args.proyecto}" not found.`)
    if (proyecto.estado === args.estado) {
      throw new Error(`Project ${proyecto.codigo} is already ${proyecto.estado}.`)
    }

    const host = connectionTarget(process.env.DATABASE_URL) ?? "unknown"
    print(`${args.mode === "apply" ? "Set estado — apply" : "Set estado — dry run (no writes)"}  (db host: ${host})`)
    print(`  ${proyecto.codigo} ${proyecto.nombre}: ${proyecto.estado} -> ${args.estado}`)
    if (args.estado === "EN_EJECUCION" && (await tx.versionProyecto.count({ where: { proyecto_id: proyecto.id } })) === 0) {
      print(
        "  WARNING: this project has no baseline (v0): modifications and base=original will answer 409. " +
          "Approve the baseline through POST /api/v1/projects/:id/baseline/approve instead.",
      )
    }

    if (args.mode !== "apply") {
      print("Dry run: nothing was written. Re-run with --actor <email> --apply to execute.")
      return
    }

    const actor = await tx.usuario.findFirst({ where: { email: args.actor! }, select: { id: true } })
    if (!actor) throw new Error(`Actor "${args.actor}" not found: pass the email of an existing user.`)

    await tx.proyecto.update({ where: { id: proyecto.id }, data: { estado: args.estado } })
    await logChange(tx, {
      usuario_id: actor.id,
      accion: "EDITAR",
      entidad: "proyecto",
      entidad_id: proyecto.id,
      proyecto_id: proyecto.id,
      campo: "estado",
      valor_anterior: proyecto.estado,
      valor_nuevo: args.estado,
    })
    print("Done.")
  })

  return { mode: args.mode }
}

async function main(): Promise<void> {
  await runSetEstado(db as unknown as SetEstadoDb)
}

// Only run when invoked as a script: a test imports this module and must not
// query a database as an import side effect.
const invokedDirectly = (process.argv[1] ?? "")
  .replace(/\\/g, "/")
  .endsWith("scripts/set-project-estado.ts")

if (invokedDirectly) {
  main()
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
    .finally(() => db.$disconnect())
}
