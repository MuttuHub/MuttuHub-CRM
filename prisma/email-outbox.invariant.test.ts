// Live-DB coverage for the PR-M1 email outbox: the unique idempotency key under
// `enqueueEmail`, and the claim query's `FOR UPDATE SKIP LOCKED` under two overlapping runs.
//
// The enqueue case rolls back. The claim case needs committed rows (two connections must see
// them), so it inserts rows due in the year 2000 — far before any real row — claims with a `now`
// in that window, and deletes its rows in `finally`.
//
// `./require-local-db` must stay the FIRST import.
import "./require-local-db"

import { randomUUID } from "node:crypto"

import { describe, expect, it } from "vitest"

import { db } from "@/lib/db"
import { createPrismaOutboxStore, enqueueEmail } from "@/lib/email/outbox"

class IntentionalRollback extends Error {}

const TIPO = "INVARIANT_TEST"

describe("email_outbox (live DB)", () => {
  it("skips a duplicate idempotency key without aborting the caller's transaction", async () => {
    const key = `invariant-outbox/${randomUUID()}/dup`
    let rowsInTx = -1
    let afterDuplicate = ""
    try {
      await db.$transaction(async (tx) => {
        const base = { to: "a@example.test", subject: "s", html: "h", tipo: TIPO, idempotencyKey: key }
        expect(await enqueueEmail(tx, base)).toEqual({ enqueued: true })
        expect(await enqueueEmail(tx, { ...base, subject: "other" })).toEqual({ enqueued: false })
        // The transaction is still usable after the skipped insert.
        rowsInTx = await tx.emailOutbox.count({ where: { clave_idempotencia: key } })
        afterDuplicate = (await tx.emailOutbox.findUniqueOrThrow({ where: { clave_idempotencia: key } })).asunto
        throw new IntentionalRollback()
      })
    } catch (error) {
      if (!(error instanceof IntentionalRollback)) throw error
    }
    expect(rowsInTx).toBe(1)
    expect(afterDuplicate).toBe("s")
    expect(await db.emailOutbox.count({ where: { clave_idempotencia: key } })).toBe(0)
  })

  it("gives two overlapping claims disjoint rows and never reclaims a sent row", async () => {
    const prefix = `invariant-outbox/${randomUUID()}/`
    const due = new Date("2000-01-01T00:00:00.000Z")
    const now = new Date("2000-01-02T00:00:00.000Z")
    const notYet = new Date("2000-01-03T00:00:00.000Z")
    const store = createPrismaOutboxStore(db)

    try {
      await db.emailOutbox.createMany({
        data: [
          ...Array.from({ length: 6 }, (_, i) => ({
            destinatario_email: `r${i}@example.test`,
            asunto: `due ${i}`,
            html: "<p>x</p>",
            tipo: TIPO,
            clave_idempotencia: `${prefix}${i}`,
            proximo_intento_at: due,
          })),
          {
            destinatario_email: "later@example.test",
            asunto: "not yet",
            html: "<p>x</p>",
            tipo: TIPO,
            clave_idempotencia: `${prefix}later`,
            proximo_intento_at: notYet,
          },
        ],
      })

      const args = { now, limit: 4, leaseMs: 60_000, maxAttempts: 5 }
      const [one, two] = await Promise.all([store.claimDue(args), store.claimDue(args)])
      const ids = [...one, ...two].map((r) => r.id)

      expect(new Set(ids).size).toBe(ids.length)
      expect(ids).toHaveLength(6)
      expect([...one, ...two].every((r) => r.clave_idempotencia.startsWith(prefix) && r.intentos === 1)).toBe(true)
      expect([...one, ...two].some((r) => r.asunto === "not yet")).toBe(false)

      for (const id of ids) await store.markSent(id, { now, providerId: "invariant" })

      // Sent rows are terminal: a later run claims nothing of ours but the row now due.
      const later = await store.claimDue({ ...args, now: new Date("2000-01-04T00:00:00.000Z") })
      expect(later.map((r) => r.asunto)).toEqual(["not yet"])

      const rows = await db.emailOutbox.findMany({ where: { clave_idempotencia: { startsWith: prefix } } })
      expect(rows.filter((r) => r.estado === "ENVIADO")).toHaveLength(6)
      expect(rows.find((r) => r.asunto === "not yet")).toMatchObject({ estado: "ENVIANDO", intentos: 1 })
    } finally {
      await db.emailOutbox.deleteMany({ where: { clave_idempotencia: { startsWith: prefix } } })
    }
  })
})
