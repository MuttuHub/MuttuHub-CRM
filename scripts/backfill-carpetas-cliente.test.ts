/**
 * The client-folder backfill (task 1.4) must stay inert by default: a dry run
 * issues zero writes, `--apply` files each single-client mirror into its
 * client's folder through the shared find-or-create helper, and a second run
 * has nothing left to do. The `require-local-db` guard (mocked here) is what
 * refuses a non-loopback database before the Prisma client exists.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("../prisma/require-local-db", () => ({}))
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
