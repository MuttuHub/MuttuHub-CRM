// The only guarantee that a rubro code is immutable is the database trigger
// itself, so these tests hit the LOCAL Docker database and force a rollback on
// every path: nothing is left behind anywhere.
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

const MARKER = "sdd-invariant-rubros"

describe("rubros.codigo invariants (live DB)", () => {
  it("accepts INSERT into rubros", async () => {
    const created = await runAndRollback(async (tx) => {
      const row = await tx.rubro.create({
        data: { codigo: `${MARKER}-insert`, nombre: MARKER, orden: 99 },
      })
      expect(row.id).toBeTruthy()
      return row.codigo
    })

    expect(created).toBe(`${MARKER}-insert`)
  })

  it("the database rejects updating an existing rubro codigo", async () => {
    await expect(
      db.$transaction(async (tx) => {
        const row = await tx.rubro.create({
          data: { codigo: `${MARKER}-immutable`, nombre: MARKER, orden: 98 },
        })
        await tx.$executeRaw`UPDATE rubros SET codigo = 'R99' WHERE id = ${row.id}`
      }, TX_OPTIONS),
    ).rejects.toThrow(/inmutable/i)
  })

  it("allows an UPDATE that leaves codigo unchanged (rename / suspend)", async () => {
    const nombre = await runAndRollback(async (tx) => {
      const row = await tx.rubro.create({
        data: { codigo: `${MARKER}-rename`, nombre: "Antes", orden: 97 },
      })
      await tx.$executeRaw`UPDATE rubros SET nombre = 'Despues', activo = false WHERE id = ${row.id}`
      const updated = await tx.rubro.findUnique({ where: { id: row.id } })
      return updated?.nombre
    })

    expect(nombre).toBe("Despues")
  })

  it("allows assigning a codigo to a row that had none", async () => {
    // The trigger only blocks CHANGING an existing non-null code, which is what
    // makes the adoptive backfill of the legacy rows safe.
    const codigo = await runAndRollback(async (tx) => {
      const row = await tx.rubro.create({
        data: { codigo: null, nombre: `${MARKER}-nocode`, orden: 96 },
      })
      await tx.$executeRaw`UPDATE rubros SET codigo = ${`${MARKER}-assigned`} WHERE id = ${row.id}`
      const updated = await tx.rubro.findUnique({ where: { id: row.id } })
      return updated?.codigo
    })

    expect(codigo).toBe(`${MARKER}-assigned`)
  })
})
