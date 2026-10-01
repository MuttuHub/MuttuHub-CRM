/**
 * WHY: a v2 data script must never apply a plan nobody reviewed, and a mistake
 * here writes to the local database. This harness enforces the rules once, for
 * every script: `--dry-run` reads and reports without opening a transaction,
 * `--apply` recomputes the plan inside ONE transaction and refuses when its hash
 * differs from the `--expect-hash` copied from the dry-run, and `--revert` is
 * scoped to a single `lote`.
 *
 * It is deliberately DB-agnostic: it never imports `@/lib/db`, so the calling
 * script injects the client and the tests run against a fake with no real
 * database or network.
 */
import { createHash } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { connectionTarget } from "../../prisma/local-env"

export const DEFAULT_OUT_DIR = "scripts/migrate-v2/out"

// Deviation from SDD §4.5, which wrote `counts: Record<string, number>`: the
// count-first report table has five columns (entity, existing, to_create,
// to_update, skipped), so counts is a row list.
export type PlanCount = {
  entity: string
  existing: number
  to_create: number
  to_update: number
  skipped: number
}

export type PlanDecision = {
  id: string
  rule: string
  project: string
  row: string
  detail: string
  default: string
}

export type PlanAction = { key: string; description: string }

export type StorageReport = {
  rows: number
  objects: number
  rows_without_object: number
  objects_without_row: number
}

export type Plan = {
  counts: PlanCount[]
  decisions: PlanDecision[]
  actions: PlanAction[]
  storage?: StorageReport
}

export type MigrationClient = {
  $transaction<T>(fn: (tx: unknown) => Promise<T>, options?: { timeout?: number }): Promise<T>
}

export type Printer = (line: string) => void

export type RunMigrationOptions = {
  name: string
  argv?: readonly string[]
  db: MigrationClient
  plan: (tx: unknown) => Promise<Plan> | Plan
  apply: (tx: unknown, plan: Plan, loteId: string) => Promise<string[]>
  revert?: (tx: unknown, loteId: string) => Promise<string[]>
  outDir?: string
  now?: () => number
  print?: Printer
  /** Overrides the report host; defaults to the DATABASE_URL target. */
  host?: string
}

export type RunMigrationResult = {
  mode: "dry-run" | "apply" | "revert"
  exitCode: number
  reportPath?: string
  plan?: Plan
  applied?: string[]
  skipped?: string[]
  reverted?: string[]
}

const COUNT_HEADERS = ["entity", "existing", "to_create", "to_update", "skipped (already applied)"]
const DECISION_HEADERS = ["id", "rule", "project", "row", "detail", "default"]
const STORAGE_HEADERS = ["soportes rows", "objects found", "rows without object", "objects without row"]

type Mode = "dry-run" | "apply" | "revert"
type ParsedArgs = { mode: Mode; expectHash?: string; revertLote?: string }
type Deps = { print: Printer; now: () => number; outDir: string; host: string }

/**
 * Stable sha256 over the plan's identity: counts, decisions and action *keys*.
 * Descriptions are excluded so wording edits do not invalidate a reviewed hash.
 */
export function planHash(plan: Plan): string {
  const canonical = JSON.stringify({
    counts: plan.counts.map((row) => [row.entity, row.existing, row.to_create, row.to_update, row.skipped]),
    decisions: plan.decisions.map((row) => [row.id, row.rule, row.project, row.row, row.detail, row.default]),
    actions: plan.actions.map((action) => action.key),
  })
  return createHash("sha256").update(canonical).digest("hex")
}

/** One shared table renderer for stdout and the markdown report. */
export function printTable(headers: string[], rows: string[][], print: Printer = console.log): void {
  print(`| ${headers.join(" | ")} |`)
  print(`| ${headers.map(() => "---").join(" | ")} |`)
  for (const row of rows) print(`| ${row.join(" | ")} |`)
}

/** Renders the §4.5 Storage table, or a single note when no storage data exists. */
export function renderStorageTable(storage: StorageReport | undefined, print: Printer = console.log): void {
  if (!storage) {
    print("| (no storage data) |")
    return
  }

  printTable(
    STORAGE_HEADERS,
    [
      [
        String(storage.rows),
        String(storage.objects),
        String(storage.rows_without_object),
        String(storage.objects_without_row),
      ],
    ],
    print,
  )
}

function renderReport(input: { name: string; host: string; plan: Plan; hash: string }, print: Printer): void {
  print(`# Migration dry-run: ${input.name}  (db host: ${input.host})  plan-hash: ${input.hash.slice(0, 12)}…`)
  print("## Counts")
  printTable(
    COUNT_HEADERS,
    input.plan.counts.map((row) => [
      row.entity,
      String(row.existing),
      String(row.to_create),
      String(row.to_update),
      String(row.skipped),
    ]),
    print,
  )
  print("## Decisions required (not applied until resolved)")
  printTable(
    DECISION_HEADERS,
    input.plan.decisions.map((row) => [row.id, row.rule, row.project, row.row, row.detail, row.default]),
    print,
  )
  print("## Storage")
  renderStorageTable(input.plan.storage, print)
}

function emitReport(
  input: { name: string; host: string; plan: Plan; hash: string },
  deps: { print: Printer; now: () => number; outDir: string },
): string {
  const lines: string[] = []
  renderReport(input, (line) => lines.push(line))
  for (const line of lines) deps.print(line)

  mkdirSync(deps.outDir, { recursive: true })
  const reportPath = join(deps.outDir, `${input.name}-${formatStamp(deps.now())}.md`)
  writeFileSync(reportPath, `${lines.join("\n")}\n`, "utf8")
  return reportPath
}

function formatStamp(ms: number): string {
  const date = new Date(ms)
  const pad = (value: number) => String(value).padStart(2, "0")
  return [
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`,
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`,
  ].join("-")
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  let mode: Mode = "dry-run"
  let expectHash: string | undefined
  let revertLote: string | undefined

  const setMode = (next: Mode) => {
    if (mode !== "dry-run" && next !== "dry-run" && next !== mode) {
      throw new Error(`Conflicting modes "${mode}" and "${next}". Pick one of --dry-run, --apply or --revert.`)
    }
    if (next !== "dry-run") mode = next
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === "--dry-run") {
      setMode("dry-run")
    } else if (arg === "--apply") {
      setMode("apply")
    } else if (arg === "--expect-hash") {
      const value = argv[index + 1]
      if (!value) throw new Error("--expect-hash requires the sha copied from a reviewed dry-run.")
      expectHash = value
      index += 1
    } else if (arg === "--revert") {
      setMode("revert")
      const value = argv[index + 1]
      if (!value) throw new Error("--revert requires a lote id.")
      revertLote = value
      index += 1
    } else {
      throw new Error(
        `Unknown flag "${arg}". Use --dry-run (default), --apply, --expect-hash <sha> or --revert <lote_id>.`,
      )
    }
  }

  return { mode, expectHash, revertLote }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function writeLote(tx: unknown, loteId: string): Promise<void> {
  const writer = tx as {
    auditoria_cambios: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> }
  }

  await writer.auditoria_cambios.create({
    data: {
      usuario_id: "migracion_v2",
      accion: "IMPORTAR",
      entidad: "migracion_v2",
      entidad_id: loteId,
      lote_id: loteId,
    },
  })
}

function assertKnownKeys(plan: Plan, applied: readonly string[]): void {
  const known = new Set(plan.actions.map((action) => action.key))
  for (const key of applied) {
    if (!known.has(key)) {
      throw new Error(`apply() returned the unknown action key "${key}", which is not part of the reviewed plan.`)
    }
  }
}

async function runApply(options: RunMigrationOptions, parsed: ParsedArgs, deps: Deps): Promise<RunMigrationResult> {
  const expectHash = parsed.expectHash
  if (!expectHash) {
    deps.print("--apply requires --expect-hash <sha> copied from a reviewed dry-run. Refusing to apply an unreviewed plan.")
    return { mode: "apply", exitCode: 1 }
  }

  const loteId = `${options.name}-${formatStamp(deps.now())}`

  try {
    const outcome = await options.db.$transaction(
      async (tx) => {
        const plan = await options.plan(tx)
        const recomputed = planHash(plan)

        if (recomputed !== expectHash.toLowerCase()) {
          throw new Error(
            `Plan hash mismatch: --expect-hash ${expectHash} does not match the recomputed plan ${recomputed}. Nothing was written.`,
          )
        }

        await writeLote(tx, loteId)
        const applied = await options.apply(tx, plan, loteId)
        assertKnownKeys(plan, applied)
        return { plan, applied }
      },
      { timeout: 120_000 },
    )

    const skipped = outcome.plan.actions.filter((action) => !outcome.applied.includes(action.key))
    deps.print(`Applied ${outcome.applied.length} action(s), skipped ${skipped.length} already-applied action(s). lote ${loteId}`)

    return { mode: "apply", exitCode: 0, plan: outcome.plan, applied: outcome.applied, skipped: skipped.map((a) => a.key) }
  } catch (error) {
    deps.print(errorMessage(error))
    return { mode: "apply", exitCode: 1 }
  }
}

async function runRevert(options: RunMigrationOptions, parsed: ParsedArgs, deps: Deps): Promise<RunMigrationResult> {
  const revert = options.revert
  const loteId = parsed.revertLote

  if (!revert || !loteId) {
    deps.print("--revert requires a revert() implementation and a lote id; this script cannot revert.")
    return { mode: "revert", exitCode: 1 }
  }

  try {
    const reverted = await options.db.$transaction((tx) => revert(tx, loteId), { timeout: 120_000 })
    deps.print(`Reverted ${reverted.length} row(s) from lote ${loteId}.`)
    return { mode: "revert", exitCode: 0, reverted }
  } catch (error) {
    deps.print(errorMessage(error))
    return { mode: "revert", exitCode: 1 }
  }
}

export async function runMigration(options: RunMigrationOptions): Promise<RunMigrationResult> {
  const deps: Deps = {
    print: options.print ?? console.log,
    now: options.now ?? Date.now,
    outDir: options.outDir ?? DEFAULT_OUT_DIR,
    host: options.host ?? connectionTarget(process.env.DATABASE_URL) ?? "unknown",
  }

  let parsed: ParsedArgs
  try {
    parsed = parseArgs(options.argv ?? process.argv.slice(2))
  } catch (error) {
    deps.print(errorMessage(error))
    return { mode: "dry-run", exitCode: 1 }
  }

  if (parsed.mode === "apply") return runApply(options, parsed, deps)
  if (parsed.mode === "revert") return runRevert(options, parsed, deps)

  const plan = await options.plan(options.db)
  const hash = planHash(plan)
  const reportPath = emitReport({ name: options.name, host: deps.host, plan, hash }, deps)
  return { mode: "dry-run", exitCode: 0, reportPath, plan }
}
