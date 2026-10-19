import { afterEach, describe, expect, it, vi } from "vitest"

// The generator must never open its own transaction: this mock exists so the
// suite can prove `db.$transaction` is not called while the given `tx` is used.
vi.mock("@/lib/db", () => ({
  db: { $transaction: vi.fn() },
}))

import { db } from "@/lib/db"
import { nextProjectCode } from "./project-code"

type CodeRow = { codigo: string }

/**
 * Minimal stand-in for `Prisma.TransactionClient`: only the two calls the
 * generator is allowed to make. `$queryRaw` captures the tagged-template values
 * so a test can inspect the initial counter value the SQL was given.
 */
function fakeTx(options: { existing?: CodeRow[]; result?: { ultimo: number }[] } = {}) {
  const queries: { values: unknown[] }[] = []
  const findMany = vi.fn().mockResolvedValue(options.existing ?? [])
  const queryRaw = vi.fn().mockImplementation((_strings: TemplateStringsArray, ...values: unknown[]) => {
    queries.push({ values })
    return Promise.resolve(options.result ?? [{ ultimo: 1 }])
  })
  return { tx: { proyecto: { findMany }, $queryRaw: queryRaw }, queries, findMany, queryRaw }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe("nextProjectCode", () => {
  it("formats the sequence returned by the atomic upsert", async () => {
    const { tx, findMany, queryRaw } = fakeTx({ existing: [], result: [{ ultimo: 1 }] })

    const code = await nextProjectCode(tx as never, 1999)

    expect(code).toBe("PRY-1999-001")
    expect(findMany).toHaveBeenCalledTimes(1)
    expect(queryRaw).toHaveBeenCalledTimes(1)
    expect(findMany).toHaveBeenCalledWith({
      where: { codigo: { startsWith: "PRY-1999-" } },
      select: { codigo: true },
    })
  })

  it("initialises the counter from the maximum existing code of the year", async () => {
    const { tx, queries } = fakeTx({
      existing: [
        { codigo: "PRY-1999-002" },
        { codigo: "PRY-1999-007" },
        { codigo: "PRY-2000-050" },
        { codigo: "not-a-project-code" },
      ],
      result: [{ ultimo: 8 }],
    })

    const code = await nextProjectCode(tx as never, 1999)

    expect(code).toBe("PRY-1999-008")
    // The INSERT value is the floor (max existing + 1), so the first call for a
    // pre-existing year continues the series instead of colliding.
    expect(queries).toEqual([{ values: [1999, 8] }])
  })

  it("uses the transaction it is given and never opens its own", async () => {
    const { tx, queryRaw } = fakeTx({ existing: [], result: [{ ultimo: 1 }] })

    await nextProjectCode(tx as never, 1999)

    expect(queryRaw).toHaveBeenCalledTimes(1)
    expect(db.$transaction).not.toHaveBeenCalled()
  })
})
