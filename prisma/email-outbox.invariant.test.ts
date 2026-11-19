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

  it("keeps a row sent when a worker whose lease expired reports success after another worker's failure", async () => {
    const key = `invariant-outbox/${randomUUID()}/stale-success`
    const due = new Date("2000-01-01T00:00:00.000Z")
    const first = new Date("2000-01-02T00:00:00.000Z")
    const afterLease = new Date("2000-01-02T00:02:00.000Z")
    const muchLater = new Date("2000-01-05T00:00:00.000Z")
    const store = createPrismaOutboxStore(db)
    const args = { limit: 10, leaseMs: 60_000, maxAttempts: 5 }

    try {
      await db.emailOutbox.create({
        data: { destinatario_email: "s@example.test", asunto: "s", html: "<p>x</p>", tipo: TIPO, clave_idempotencia: key, proximo_intento_at: due },
      })
      const mine = <T extends { clave_idempotencia: string }>(rows: T[]) => rows.filter((r) => r.clave_idempotencia === key)

      const [slow] = mine(await store.claimDue({ ...args, now: first }))
      const [late] = mine(await store.claimDue({ ...args, now: afterLease }))
      expect([slow?.intentos, late?.intentos]).toEqual([1, 2])

      // The second worker fails first; the slow first worker then reports that its send went out.
      await store.markRetry(late.id, { attempt: late.intentos, nextAttemptAt: afterLease, error: "boom" })
      await store.markSent(slow.id, { now: afterLease, providerId: "slow" })

      expect(await db.emailOutbox.findUniqueOrThrow({ where: { clave_idempotencia: key } })).toMatchObject({
        estado: "ENVIADO",
        proveedor_id: "slow",
        bloqueado_hasta: null,
      })
      expect(mine(await store.claimDue({ ...args, now: muchLater }))).toEqual([])
    } finally {
      await db.emailOutbox.deleteMany({ where: { clave_idempotencia: key } })
    }
  })

  it("ignores a failure reported by a worker whose lease another worker has since taken", async () => {
    const key = `invariant-outbox/${randomUUID()}/stale-failure`
    const due = new Date("2000-01-01T00:00:00.000Z")
    const first = new Date("2000-01-02T00:00:00.000Z")
    const afterLease = new Date("2000-01-02T00:02:00.000Z")
    const store = createPrismaOutboxStore(db)
    const args = { limit: 10, leaseMs: 60_000, maxAttempts: 5 }

    try {
      await db.emailOutbox.create({
        data: { destinatario_email: "f@example.test", asunto: "f", html: "<p>x</p>", tipo: TIPO, clave_idempotencia: key, proximo_intento_at: due },
      })
      const mine = <T extends { clave_idempotencia: string }>(rows: T[]) => rows.filter((r) => r.clave_idempotencia === key)

      const [slow] = mine(await store.claimDue({ ...args, now: first }))
      const [late] = mine(await store.claimDue({ ...args, now: afterLease }))

      await store.markRetry(slow.id, { attempt: slow.intentos, nextAttemptAt: afterLease, error: "stale retry" })
      await store.markFailed(slow.id, { attempt: slow.intentos, error: "stale failure" })

      const held = await db.emailOutbox.findUniqueOrThrow({ where: { clave_idempotencia: key } })
      expect(held).toMatchObject({ estado: "ENVIANDO", intentos: 2, ultimo_error: null })
      expect(held.bloqueado_hasta).not.toBeNull()

      await store.markSent(late.id, { now: afterLease, providerId: "late" })
      expect(await db.emailOutbox.findUniqueOrThrow({ where: { clave_idempotencia: key } })).toMatchObject({
        estado: "ENVIADO",
        proveedor_id: "late",
      })
    } finally {
      await db.emailOutbox.deleteMany({ where: { clave_idempotencia: key } })
    }
  })

  it("marks a row sent when its last-attempt worker reports success after the lease expired it to FALLIDO", async () => {
    const key = `invariant-outbox/${randomUUID()}/stale-success-after-failed`
    const due = new Date("2000-01-01T00:00:00.000Z")
    const first = new Date("2000-01-02T00:00:00.000Z")
    const afterLease = new Date("2000-01-02T00:02:00.000Z")
    const muchLater = new Date("2000-01-05T00:00:00.000Z")
    const store = createPrismaOutboxStore(db)
    const args = { limit: 10, leaseMs: 60_000, maxAttempts: 1 }

    try {
      await db.emailOutbox.create({
        data: { destinatario_email: "x@example.test", asunto: "x", html: "<p>x</p>", tipo: TIPO, clave_idempotencia: key, proximo_intento_at: due },
      })
      const mine = <T extends { clave_idempotencia: string }>(rows: T[]) => rows.filter((r) => r.clave_idempotencia === key)

      // The only attempt is claimed; its lease expires, so the next run settles the row to FALLIDO.
      const [slow] = mine(await store.claimDue({ ...args, now: first }))
      expect(slow?.intentos).toBe(1)
      expect(mine(await store.claimDue({ ...args, now: afterLease }))).toEqual([])
      expect(await db.emailOutbox.findUniqueOrThrow({ where: { clave_idempotencia: key } })).toMatchObject({ estado: "FALLIDO" })

      // The slow worker's send did go out: the row must record it and never be sent again.
      await store.markSent(slow.id, { now: afterLease, providerId: "slow" })
      expect(await db.emailOutbox.findUniqueOrThrow({ where: { clave_idempotencia: key } })).toMatchObject({
        estado: "ENVIADO",
        proveedor_id: "slow",
        ultimo_error: null,
        bloqueado_hasta: null,
      })
      expect(mine(await store.claimDue({ ...args, now: muchLater }))).toEqual([])
    } finally {
      await db.emailOutbox.deleteMany({ where: { clave_idempotencia: key } })
    }
  })

  it("releases a rate-limited row without spending its attempt, and ignores a release from a stale worker", async () => {
    const key = `invariant-outbox/${randomUUID()}/release`
    const due = new Date("2000-01-01T00:00:00.000Z")
    const first = new Date("2000-01-02T00:00:00.000Z")
    const afterLease = new Date("2000-01-02T00:02:00.000Z")
    const retryAt = new Date("2000-01-02T00:03:00.000Z")
    const store = createPrismaOutboxStore(db)
    const args = { limit: 10, leaseMs: 60_000, maxAttempts: 5 }

    try {
      await db.emailOutbox.create({
        data: { destinatario_email: "r@example.test", asunto: "r", html: "<p>x</p>", tipo: TIPO, clave_idempotencia: key, proximo_intento_at: due },
      })
      const mine = <T extends { clave_idempotencia: string }>(rows: T[]) => rows.filter((r) => r.clave_idempotencia === key)

      const [slow] = mine(await store.claimDue({ ...args, now: first }))
      const [late] = mine(await store.claimDue({ ...args, now: afterLease }))

      // The stale worker's release must not touch the row the newer worker holds.
      await store.release(slow.id, { attempt: slow.intentos, nextAttemptAt: retryAt, error: "stale 429" })
      expect(await db.emailOutbox.findUniqueOrThrow({ where: { clave_idempotencia: key } })).toMatchObject({
        estado: "ENVIANDO",
        intentos: 2,
        ultimo_error: null,
      })

      await store.release(late.id, { attempt: late.intentos, nextAttemptAt: retryAt, error: "Resend HTTP 429" })
      const released = await db.emailOutbox.findUniqueOrThrow({ where: { clave_idempotencia: key } })
      expect(released).toMatchObject({ estado: "PENDIENTE", intentos: 1, ultimo_error: "Resend HTTP 429", bloqueado_hasta: null })
      expect(released.proximo_intento_at.toISOString()).toBe(retryAt.toISOString())

      expect(mine(await store.claimDue({ ...args, now: afterLease }))).toEqual([])
      expect(mine(await store.claimDue({ ...args, now: retryAt })).map((r) => r.intentos)).toEqual([2])
    } finally {
      await db.emailOutbox.deleteMany({ where: { clave_idempotencia: key } })
    }
  })
})
