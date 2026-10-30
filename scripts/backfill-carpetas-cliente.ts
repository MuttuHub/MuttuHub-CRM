/**
 * WHY (S6, task 1.4): task attachments have always been mirrored into the
 * Document Repository linked to the task's client, but without a folder, so
 * they only show up under «Todas». From 1.4 on the mirror files them into the
 * client's folder; this backfill does the same for the mirrors that already
 * exist. Optional and one-off.
 *
 *   npx tsx scripts/backfill-carpetas-cliente.ts            # dry run (default, no writes)
 *   npx tsx scripts/backfill-carpetas-cliente.ts --apply    # writes
 *
 * Candidates: active documents with no folder that mirror a task attachment and
 * are linked to exactly ONE client. Documents linked to several clients are
 * reported and skipped (no folder can be chosen without guessing). Each
 * client's folder is found or created through the SAME helper the app uses
 * (findOrCreateClientFolder: one folder per client, race-safe); a created
 * folder is attributed to the author of that client's first mirrored document.
 * Idempotent: only rows still without a folder are updated, so a second run
 * finds nothing to do.
 *
 * The `require-local-db` guard MUST be the first import: it loads `.env.local`
 * and refuses a non-loopback database before `@/lib/db` builds a Prisma client
 * (same guard as prisma/seed.ts and the other scripts). Running it against
 * production is a separate, explicit decision outside this script.
 */
import "../prisma/require-local-db"

import { connectionTarget } from "../prisma/local-env"
import { db } from "../src/lib/db"
import { findOrCreateClientFolder } from "../src/lib/documents/client-folder"

export type BackfillMode = "dry-run" | "apply" | "help"

export type BackfillCandidate = { documentoId: string; autorId: string; clienteIds: string[] }

export type BackfillDeps = {
  findCandidates: () => Promise<BackfillCandidate[]>
  existingClientFolders: (clienteIds: string[]) => Promise<Set<string>>
  findOrCreateClientFolder: (
    clienteId: string,
    creadoPorId: string,
  ) => Promise<{ carpeta: { id: string }; creada: boolean } | null>
  fileDocuments: (documentoIds: string[], carpetaId: string) => Promise<number>
}

export type BackfillReport = {
  mode: BackfillMode
  candidatos: number
  clientes: number
  omitidosVariosClientes: number
  omitidosClienteEliminado: number
  carpetasCreadas: number
  documentosArchivados: number
}

type Printer = (line: string) => void

const USAGE = [
  "Usage:",
  "  npx tsx scripts/backfill-carpetas-cliente.ts           # dry run (default, no writes)",
  "  npx tsx scripts/backfill-carpetas-cliente.ts --apply   # file the mirrored documents into their client folders",
]

export function parseBackfillArgs(argv: readonly string[]): BackfillMode {
  if (argv.includes("--help")) return "help"
  const unknown = argv.filter((arg) => arg !== "--apply")
  if (unknown.length > 0) throw new Error(`Unknown argument(s): ${unknown.join(" ")}. Use --help.`)
  return argv.includes("--apply") ? "apply" : "dry-run"
}

export async function runBackfill(
  deps: BackfillDeps,
  argv: readonly string[] = process.argv.slice(2),
  print: Printer = (line) => console.log(line),
): Promise<BackfillReport> {
  const mode = parseBackfillArgs(argv)
  const report: BackfillReport = {
    mode,
    candidatos: 0,
    clientes: 0,
    omitidosVariosClientes: 0,
    omitidosClienteEliminado: 0,
    carpetasCreadas: 0,
    documentosArchivados: 0,
  }
  if (mode === "help") {
    for (const line of USAGE) print(line)
    return report
  }

  const host = connectionTarget(process.env.DATABASE_URL) ?? "unknown"
  print(`${mode === "apply" ? "Backfill client folders — apply" : "Backfill client folders — dry run (no writes)"}  (db host: ${host})`)

  const candidates = await deps.findCandidates()
  report.candidatos = candidates.length

  // Group the single-client mirrors by client, keeping the first author.
  const byClient = new Map<string, { autorId: string; documentoIds: string[] }>()
  for (const candidate of candidates) {
    if (candidate.clienteIds.length !== 1) {
      report.omitidosVariosClientes += 1
      continue
    }
    const clienteId = candidate.clienteIds[0]
    const group = byClient.get(clienteId) ?? { autorId: candidate.autorId, documentoIds: [] }
    group.documentoIds.push(candidate.documentoId)
    byClient.set(clienteId, group)
  }
  report.clientes = byClient.size

  const existing = await deps.existingClientFolders([...byClient.keys()])
  const toFile = [...byClient.values()].reduce((n, g) => n + g.documentoIds.length, 0)
  print(`  mirrored documents without folder: ${report.candidatos}`)
  print(`  linked to several clients (skipped): ${report.omitidosVariosClientes}`)
  print(`  documents to file: ${toFile} across ${report.clientes} client(s)`)
  print(`  client folders: ${existing.size} existing, ${report.clientes - existing.size} to create`)

  if (mode !== "apply") {
    print("Dry run: nothing was written. Re-run with --apply to execute.")
    return report
  }

  for (const [clienteId, group] of byClient) {
    const folder = await deps.findOrCreateClientFolder(clienteId, group.autorId)
    if (!folder) {
      // Deleted client: its documents stay where they are.
      report.omitidosClienteEliminado += group.documentoIds.length
      continue
    }
    if (folder.creada) report.carpetasCreadas += 1
    report.documentosArchivados += await deps.fileDocuments(group.documentoIds, folder.carpeta.id)
  }

  print(`  folders created: ${report.carpetasCreadas}`)
  print(`  documents filed: ${report.documentosArchivados}`)
  print(`  skipped (deleted client): ${report.omitidosClienteEliminado}`)
  print("Done.")
  return report
}

/** Production wiring of the deps against the guarded local Prisma client. */
export function prismaDeps(): BackfillDeps {
  return {
    async findCandidates() {
      const rows = await db.documento.findMany({
        where: {
          deleted_at: null,
          carpeta_id: null,
          adjuntos_tarea: { some: {} },
          clientes: { some: {} },
        },
        select: { id: true, autor_id: true, clientes: { select: { cliente_id: true } } },
        orderBy: { created_at: "asc" },
      })
      return rows.map((r) => ({
        documentoId: r.id,
        autorId: r.autor_id,
        clienteIds: r.clientes.map((c) => c.cliente_id),
      }))
    },
    async existingClientFolders(clienteIds) {
      if (clienteIds.length === 0) return new Set()
      const rows = await db.carpeta.findMany({
        where: { cliente_id: { in: clienteIds }, deleted_at: null },
        select: { cliente_id: true },
      })
      return new Set(rows.map((r) => r.cliente_id).filter((id): id is string => id !== null))
    },
    findOrCreateClientFolder,
    async fileDocuments(documentoIds, carpetaId) {
      // `carpeta_id: null` keeps the run idempotent and never moves a document
      // someone filed by hand in the meantime.
      const result = await db.documento.updateMany({
        where: { id: { in: documentoIds }, carpeta_id: null, deleted_at: null },
        data: { carpeta_id: carpetaId },
      })
      return result.count
    },
  }
}

// Only run when invoked as a script: a test imports this module and must not
// query a database as an import side effect.
const invokedDirectly = (process.argv[1] ?? "")
  .replace(/\\/g, "/")
  .endsWith("scripts/backfill-carpetas-cliente.ts")

if (invokedDirectly) {
  runBackfill(prismaDeps())
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
    .finally(() => db.$disconnect())
}
