// The only guarantee that the audit ledger is truly append-only is the database
// trigger itself, so these tests hit the LOCAL Docker database and force a
// rollback on every path: nothing is left behind anywhere.
//
// `./require-local-db` must stay the FIRST import — it loads `.env.local` and
// refuses any non-loopback target before the Prisma client is built.
import "./require-local-db"

import { describe, expect, it } from "vitest"

import { db } from "@/lib/db"

const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 }

/** Thrown to force a rollback even when the body succeeded. */
class IntentionalRollback extends Error {}

async function runAndRollback<T>(
  fn: (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  let captured: T | undefined
  try {
    await db.$transaction(async (tx) => {
      captured = await fn(tx)
      throw new IntentionalRollback()
    }, TX_OPTIONS)
  } catch (error) {
    if (!(error instanceof IntentionalRollback)) throw error
  }
  return captured as T
}

function auditRow(overrides: Record<string, unknown> = {}) {
  return {
    usuario_id: "sdd-invariant-audit-user",
    accion: "EDITAR" as const,
    entidad: "proyecto",
    entidad_id: "sdd-invariant-audit-entity",
    campo: "nombre",
    valor_anterior: "antes",
    valor_nuevo: "despues",
    ...overrides,
  }
}

describe("auditoria_cambios invariants (live DB)", () => {
  it("accepts INSERT into auditoria_cambios", async () => {
    const created = await runAndRollback(async (tx) => {
      const row = await tx.auditoriaCambio.create({ data: auditRow() })
      expect(row.id).toBeTruthy()
      expect(row.accion).toBe("EDITAR")
      return row.id
    })

    expect(created).toBeTruthy()
  })

  it("rejects UPDATE on auditoria_cambios with the append-only trigger", async () => {
    await expect(
      db.$transaction(async (tx) => {
        const row = await tx.auditoriaCambio.create({ data: auditRow() })
        await tx.$executeRaw`UPDATE auditoria_cambios SET campo = 'x' WHERE id = ${row.id}`
      }, TX_OPTIONS),
    ).rejects.toThrow(/solo escritura/i)
  })

  it("rejects DELETE on auditoria_cambios with the append-only trigger", async () => {
    await expect(
      db.$transaction(async (tx) => {
        const row = await tx.auditoriaCambio.create({ data: auditRow() })
        await tx.$executeRaw`DELETE FROM auditoria_cambios WHERE id = ${row.id}`
      }, TX_OPTIONS),
    ).rejects.toThrow(/solo escritura/i)
  })

  it("rejects TRUNCATE on auditoria_cambios", async () => {
    await expect(
      db.$transaction(async (tx) => {
        await tx.$executeRaw`TRUNCATE TABLE auditoria_cambios`
      }, TX_OPTIONS),
    ).rejects.toThrow(/solo escritura/i)
  })
})
