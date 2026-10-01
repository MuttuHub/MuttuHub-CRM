/**
 * WHY: the harness decides what a v2 migration script may do — dry-run reads,
 * `--apply` refuses an unreviewed plan, and a `lote` scopes every revert. Those
 * rules are cheap to break and expensive to get wrong against the local Docker
 * Postgres, so they are pinned here with a hand-written fake client: no real DB,
 * no network, and a recorded call list that proves whether a transaction opened.
 */
import { existsSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { describe, expect, it } from "vitest"

import {
  DEFAULT_OUT_DIR,
  planHash,
  runMigration,
  type MigrationClient,
  type Plan,
  type RunMigrationOptions,
} from "./_harness"

const FIXED_NOW = Date.UTC(2026, 0, 1, 12, 30, 45)

const samplePlan: Plan = {
  counts: [{ entity: "rubros → lineas", existing: 3, to_create: 1, to_update: 2, skipped: 0 }],
  decisions: [
    {
      id: "N-13",
      rule: "suspended rubro",
      project: "PRY-2026-001",
      row: "R05",
      detail: "reassign manually",
      default: "report only",
    },
  ],
  actions: [{ key: "rubro:R05", description: "create budget line" }],
}

// `auditoriaCambio` is the REAL generated Prisma delegate name; the table's
// `@@map("auditoria_cambios")` is not a client accessor. The fake must expose
// exactly the name `writeLote` writes through — with the snake_case table name
// this object leaves `tx.auditoria_cambios` undefined and the apply tests fail,
// which is what exposed the original harness defect.
type FakeTx = { auditoriaCambio: { create: (args: unknown) => Promise<unknown> } }

function fakeDb() {
  const calls: { options?: { timeout?: number }; wrote: boolean }[] = []

  const client: MigrationClient = {
    async $transaction<T>(fn: (tx: unknown) => Promise<T>, options?: { timeout?: number }): Promise<T> {
      const record: { options?: { timeout?: number }; wrote: boolean } = { options, wrote: false }
      calls.push(record)

      const tx: FakeTx = {
        auditoriaCambio: {
          create: async () => {
            record.wrote = true
            return {}
          },
        },
      }

      return fn(tx)
    },
  }

  return { client, calls }
}

function capture() {
  const lines: string[] = []
  return { lines, print: (line: string) => lines.push(line) }
}

function tempOutDir(): string {
  return mkdtempSync(join(tmpdir(), "migrate-v2-"))
}

function baseOptions(overrides: Partial<RunMigrationOptions>): RunMigrationOptions {
  const { client } = fakeDb()
  return {
    name: "test",
    argv: [],
    db: client,
    plan: () => samplePlan,
    apply: async () => [],
    outDir: tempOutDir(),
    now: () => FIXED_NOW,
    print: () => {},
    ...overrides,
  }
}

describe("migrate-v2 harness", () => {
  it("dry-run prints counts and decisions and never opens a write transaction", async () => {
    const { client, calls } = fakeDb()
    const { lines, print } = capture()

    const result = await runMigration(
      baseOptions({ db: client, print, plan: () => samplePlan }),
    )

    expect(result.exitCode).toBe(0)
    expect(result.mode).toBe("dry-run")
    const text = lines.join("\n")
    expect(text).toContain("rubros → lineas")
    expect(text).toContain("N-13")
    expect(text).toContain("(no storage data)")
    expect(calls).toHaveLength(0)
    expect(result.reportPath).toBeDefined()
    expect(existsSync(result.reportPath!)).toBe(true)
    // R3-001: the reviewed sha must be obtainable from the dry-run itself, or the
    // documented `--apply --expect-hash <sha>` workflow is impossible.
    expect(result.hash).toBe(planHash(samplePlan))
    expect(text).toContain(planHash(samplePlan))
  })

  it("apply refuses when --expect-hash does not match the recomputed plan", async () => {
    const { client, calls } = fakeDb()
    const { lines, print } = capture()

    const result = await runMigration(
      baseOptions({
        db: client,
        print,
        argv: ["--apply", "--expect-hash", "deadbeef"],
        apply: async () => ["rubro:R05"],
      }),
    )

    expect(result.exitCode).toBe(1)
    expect(lines.join("\n")).toMatch(/hash/i)
    expect(calls).toHaveLength(1)
    expect(calls[0].wrote).toBe(false)
  })

  it("apply refuses --apply without --expect-hash", async () => {
    const { client, calls } = fakeDb()
    const { lines, print } = capture()

    const result = await runMigration(baseOptions({ db: client, print, argv: ["--apply"] }))

    expect(result.exitCode).toBe(1)
    expect(lines.join("\n")).toContain("expect-hash")
    expect(calls).toHaveLength(0)
  })

  it("apply is idempotent: a second run reports zero actions", async () => {
    const { client } = fakeDb()
    const { print } = capture()
    const hash = planHash(samplePlan)
    let run = 0

    const apply = async () => {
      run += 1
      return run === 1 ? ["rubro:R05"] : []
    }

    const first = await runMigration(
      baseOptions({ db: client, print, argv: ["--apply", "--expect-hash", hash], apply }),
    )
    const second = await runMigration(
      baseOptions({ db: client, print, argv: ["--apply", "--expect-hash", hash], apply }),
    )

    expect(first.exitCode).toBe(0)
    expect(first.applied).toEqual(["rubro:R05"])
    expect(second.exitCode).toBe(0)
    expect(second.applied).toEqual([])
  })

  it("revert only touches rows created by the given lote", async () => {
    const { client } = fakeDb()
    const { lines, print } = capture()
    const revertCalls: unknown[][] = []

    const revert = async (tx: unknown, loteId: string) => {
      revertCalls.push([tx, loteId])
      return ["x1", "x2"]
    }

    const result = await runMigration(
      baseOptions({ db: client, print, argv: ["--revert", "lote-123"], revert }),
    )

    expect(result.exitCode).toBe(0)
    expect(revertCalls).toHaveLength(1)
    expect(revertCalls[0][1]).toBe("lote-123")
    expect(result.reverted).toEqual(["x1", "x2"])
    expect(lines.join("\n")).toContain("2")
  })

  it("writes the markdown report to scripts/migrate-v2/out/", async () => {
    expect(DEFAULT_OUT_DIR).toBe("scripts/migrate-v2/out")

    const outDir = tempOutDir()
    const { print } = capture()
    const result = await runMigration(baseOptions({ outDir, print, name: "report-shape" }))

    expect(result.reportPath).toBeDefined()
    expect(result.reportPath!.startsWith(outDir)).toBe(true)
    expect(basename(result.reportPath!)).toMatch(/^report-shape-\d{8}-\d{6}\.md$/)
    expect(existsSync(result.reportPath!)).toBe(true)
  })

  it("rejects an unknown flag", async () => {
    const { client, calls } = fakeDb()
    const { lines, print } = capture()

    const result = await runMigration(baseOptions({ db: client, print, argv: ["--nope"] }))

    expect(result.exitCode).toBe(1)
    expect(lines.join("\n")).toContain("--nope")
    expect(calls).toHaveLength(0)
  })

  it("prints only the host, never a password", async () => {
    const previous = process.env.DATABASE_URL
    process.env.DATABASE_URL =
      "postgresql://postgres:S3cretP4ss@remote.example.com:5432/postgres"
    const { print, lines } = capture()

    try {
      const result = await runMigration(baseOptions({ print }))
      const text = lines.join("\n")

      expect(result.exitCode).toBe(0)
      expect(text).toContain("remote.example.com:5432")
      expect(text).not.toContain("S3cretP4ss")
    } finally {
      if (previous === undefined) delete process.env.DATABASE_URL
      else process.env.DATABASE_URL = previous
    }
  })
})
