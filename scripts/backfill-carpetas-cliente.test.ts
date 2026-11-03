/**
 * The client-folder backfill (task 1.4) must stay inert by default: a dry run
 * issues zero writes, `--apply` files each single-client mirror into its
 * client's folder through the shared find-or-create helper, and a second run
 * has nothing left to do. The migrate-v2 guard (mocked here) is what refuses a
 * non-loopback database before the Prisma client exists, unless the operator
 * allows one exact remote host; a remote --apply must then carry the document
 * count copied from a reviewed dry run.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("./migrate-v2/_guard", () => ({ isRemoteRun: false }))
vi.mock("../src/lib/db", () => ({ db: {} }))
vi.mock("../src/lib/documents/client-folder", () => ({ findOrCreateClientFolder: vi.fn() }))

import { parseBackfillArgs, runBackfill, type BackfillCandidate, type BackfillDeps } from "./backfill-carpetas-cliente"

function fakeDeps(candidates: BackfillCandidate[], over: Partial<BackfillDeps> = {}) {
  const filed = new Set<string>()
  const deps: BackfillDeps = {
    findCandidates: vi.fn(async () => candidates.filter((c) => !filed.has(c.documentoId))),
    existingClientFolders: vi.fn(async () => new Set(["cli-old"])),
    findOrCreateClientFolder: vi.fn(async (clienteId: string) => ({
      carpeta: { id: `f-${clienteId}` },
      creada: clienteId !== "cli-old",
    })),
    fileDocuments: vi.fn(async (ids: string[]) => {
      ids.forEach((id) => filed.add(id))
      return ids.length
    }),
    ...over,
  }
  return deps
}

const CANDIDATES: BackfillCandidate[] = [
  { documentoId: "d1", autorId: "u1", clienteIds: ["cli-1"] },
  { documentoId: "d2", autorId: "u2", clienteIds: ["cli-1"] },
  { documentoId: "d3", autorId: "u3", clienteIds: ["cli-old"] },
  { documentoId: "d4", autorId: "u4", clienteIds: ["cli-1", "cli-2"] },
]

const silent = () => {}

afterEach(() => {
  vi.clearAllMocks()
})

describe("parseBackfillArgs", () => {
  it("defaults to a dry run, --apply writes, --help prints usage, anything else is rejected", () => {
    expect(parseBackfillArgs([])).toBe("dry-run")
    expect(parseBackfillArgs(["--apply"])).toBe("apply")
    expect(parseBackfillArgs(["--help"])).toBe("help")
    expect(() => parseBackfillArgs(["--force"])).toThrow("Unknown argument(s): --force")
  })

  it("accepts --expect-documents with a non-negative integer and rejects a missing or invalid value", () => {
    expect(parseBackfillArgs(["--apply", "--expect-documents", "52"])).toBe("apply")
    expect(() => parseBackfillArgs(["--apply", "--expect-documents"])).toThrow(
      "--expect-documents needs a whole number",
    )
    expect(() => parseBackfillArgs(["--apply", "--expect-documents", "-1"])).toThrow(
      "--expect-documents needs a whole number",
    )
    expect(() => parseBackfillArgs(["--apply", "--expect-documents", "5x"])).toThrow(
      "--expect-documents needs a whole number",
    )
  })
})

describe("remote safety", () => {
  it("loads the migrate-v2 guard as the very first import, before any database client", () => {
    const source = readFileSync(resolve(process.cwd(), "scripts/backfill-carpetas-cliente.ts"), "utf8")
    const firstImport = source.split("\n").find((line) => line.startsWith("import "))
    expect(firstImport).toBe('import { isRemoteRun } from "./migrate-v2/_guard"')
    expect(source).not.toContain("require-local-db")
  })

  it("refuses a remote --apply without --expect-documents before reading anything", async () => {
    const deps = fakeDeps(CANDIDATES)

    await expect(runBackfill(deps, ["--apply"], silent, { remote: true })).rejects.toThrow(
      "Remote --apply requires --expect-documents <n> copied from a dry run against the same database.",
    )
    expect(deps.findCandidates).not.toHaveBeenCalled()
    expect(deps.fileDocuments).not.toHaveBeenCalled()
  })

  it("aborts before writing when the documents to file differ from --expect-documents", async () => {
    const deps = fakeDeps(CANDIDATES)

    await expect(
      runBackfill(deps, ["--apply", "--expect-documents", "52"], silent, { remote: true }),
    ).rejects.toThrow("Expected 52 document(s) to file but found 3. Nothing was written; re-run the dry run.")
    expect(deps.findOrCreateClientFolder).not.toHaveBeenCalled()
    expect(deps.fileDocuments).not.toHaveBeenCalled()
  })

  it("a remote --apply with the matching count files the documents", async () => {
    const deps = fakeDeps(CANDIDATES)

    const report = await runBackfill(deps, ["--apply", "--expect-documents", "3"], silent, { remote: true })

    expect(report).toMatchObject({ carpetasCreadas: 1, documentosArchivados: 3 })
  })

  it("a remote dry run needs no count and writes nothing", async () => {
    const deps = fakeDeps(CANDIDATES)

    const report = await runBackfill(deps, [], silent, { remote: true })

    expect(report).toMatchObject({ mode: "dry-run", candidatos: 4 })
    expect(deps.fileDocuments).not.toHaveBeenCalled()
  })

  it("a local --apply still works without --expect-documents (previous behavior)", async () => {
    const deps = fakeDeps(CANDIDATES)

    const report = await runBackfill(deps, ["--apply"], silent)

    expect(report).toMatchObject({ documentosArchivados: 3 })
  })
})

describe("runBackfill", () => {
  it("dry run reports the counts and writes nothing", async () => {
    const deps = fakeDeps(CANDIDATES)
    const lines: string[] = []

    const report = await runBackfill(deps, [], (l) => lines.push(l))

    expect(report).toMatchObject({ mode: "dry-run", candidatos: 4, clientes: 2, omitidosVariosClientes: 1 })
    expect(deps.findOrCreateClientFolder).not.toHaveBeenCalled()
    expect(deps.fileDocuments).not.toHaveBeenCalled()
    expect(lines).toContain("  documents to file: 3 across 2 client(s)")
    expect(lines).toContain("  client folders: 1 existing, 1 to create")
  })

  it("--apply files each single-client mirror into its client's folder, attributing new folders to the first author", async () => {
    const deps = fakeDeps(CANDIDATES)

    const report = await runBackfill(deps, ["--apply"], silent)

    expect(deps.findOrCreateClientFolder).toHaveBeenCalledWith("cli-1", "u1")
    expect(deps.findOrCreateClientFolder).toHaveBeenCalledWith("cli-old", "u3")
    expect(deps.findOrCreateClientFolder).toHaveBeenCalledTimes(2)
    expect(deps.fileDocuments).toHaveBeenCalledWith(["d1", "d2"], "f-cli-1")
    expect(deps.fileDocuments).toHaveBeenCalledWith(["d3"], "f-cli-old")
    expect(report).toMatchObject({ carpetasCreadas: 1, documentosArchivados: 3, omitidosVariosClientes: 1 })
  })

  it("is idempotent: a second --apply finds only the skipped multi-client document", async () => {
    const deps = fakeDeps(CANDIDATES)

    await runBackfill(deps, ["--apply"], silent)
    vi.mocked(deps.fileDocuments).mockClear()
    const second = await runBackfill(deps, ["--apply"], silent)

    expect(second).toMatchObject({ candidatos: 1, clientes: 0, documentosArchivados: 0 })
    expect(deps.fileDocuments).not.toHaveBeenCalled()
  })

  it("leaves the documents of a deleted client where they are", async () => {
    const deps = fakeDeps([{ documentoId: "d9", autorId: "u9", clienteIds: ["cli-gone"] }], {
      findOrCreateClientFolder: vi.fn(async () => null),
    })

    const report = await runBackfill(deps, ["--apply"], silent)

    expect(deps.fileDocuments).not.toHaveBeenCalled()
    expect(report).toMatchObject({ omitidosClienteEliminado: 1, documentosArchivados: 0 })
  })

  it("--help prints the usage and touches nothing", async () => {
    const deps = fakeDeps(CANDIDATES)
    const lines: string[] = []

    await runBackfill(deps, ["--help"], (l) => lines.push(l))

    expect(lines[0]).toBe("Usage:")
    expect(deps.findCandidates).not.toHaveBeenCalled()
  })
})
