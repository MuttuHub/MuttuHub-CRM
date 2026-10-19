// Live-DB coverage for the v7-alignment C4a Relaciones schema:
//   - `contactos` gained the nullable quadrant columns `poder`, `interes`
//     (both 1..5) and `fuerza_relacion` (1..3), plus the optional `owner_id`.
//   - Every column is nullable, so a legacy-shaped row (only `nombre`) survives
//     and reads back with the four new fields as null.
//   - `owner_id` is a real FK to `usuarios`: a set owner resolves through the
//     relation, and an unknown id is rejected by the database.
//
// `./require-local-db` must stay the FIRST import — it loads `.env.local` and
// refuses any non-loopback target before the Prisma client is built.
import "./require-local-db"

import { randomUUID } from "node:crypto"

import { describe, expect, it } from "vitest"

import { db } from "@/lib/db"

const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 }

/** Thrown to force a rollback even when the body succeeded. */
class IntentionalRollback extends Error {}

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0]

async function runAndRollback<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
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

const MARKER = "sdd-invariant-relaciones"

async function fixture(tx: Tx) {
  const suffix = randomUUID()
  const usuario = await tx.usuario.create({
    data: { email: `${MARKER}-${suffix}@example.test`, nombre: MARKER },
  })
  const cliente = await tx.cliente.create({
    data: {
      nombre: `${MARKER}-cliente-${suffix}`,
      tipo_cliente: "OTRO",
      responsable_id: usuario.id,
    },
  })
  return { usuario, cliente }
}

describe("Contacto Relaciones invariants (live DB)", () => {
  it("adds nullable poder/interes/fuerza_relacion/owner_id to contactos", async () => {
    const columns = await runAndRollback(async (tx) => {
      return tx.$queryRaw<{ column_name: string; is_nullable: string; data_type: string }[]>`
        SELECT column_name, is_nullable, data_type
        FROM information_schema.columns
        WHERE table_name = 'contactos'
          AND column_name IN ('poder', 'interes', 'fuerza_relacion', 'owner_id')
        ORDER BY column_name
      `
    })

    const byName = Object.fromEntries(columns.map((c) => [c.column_name, c]))
    expect(byName.poder).toMatchObject({ is_nullable: "YES", data_type: "integer" })
    expect(byName.interes).toMatchObject({ is_nullable: "YES", data_type: "integer" })
    expect(byName.fuerza_relacion).toMatchObject({ is_nullable: "YES", data_type: "integer" })
    expect(byName.owner_id).toMatchObject({ is_nullable: "YES", data_type: "text" })
  })

  it("keeps a legacy-shaped row working: the four new fields stay null", async () => {
    const contacto = await runAndRollback(async (tx) => {
      const { cliente } = await fixture(tx)
      return tx.contacto.create({ data: { cliente_id: cliente.id, nombre: "legacy" } })
    })

    expect(contacto.poder).toBeNull()
    expect(contacto.interes).toBeNull()
    expect(contacto.fuerza_relacion).toBeNull()
    expect(contacto.owner_id).toBeNull()
  })

  it("accepts the quadrant fields and an owner", async () => {
    const contacto = await runAndRollback(async (tx) => {
      const { usuario, cliente } = await fixture(tx)
      return tx.contacto.create({
        data: {
          cliente_id: cliente.id,
          nombre: "con cuadrante",
          poder: 4,
          interes: 5,
          fuerza_relacion: 3,
          owner_id: usuario.id,
        },
        include: { owner: { select: { nombre: true } } },
      })
    })

    expect(contacto.poder).toBe(4)
    expect(contacto.interes).toBe(5)
    expect(contacto.fuerza_relacion).toBe(3)
    expect(contacto.owner?.nombre).toBe(MARKER)
  })

  it("rejects an owner_id that is not an existing usuario (FK enforced)", async () => {
    await expect(
      runAndRollback(async (tx) => {
        const { cliente } = await fixture(tx)
        return tx.contacto.create({
          data: { cliente_id: cliente.id, nombre: "bad owner", owner_id: randomUUID() },
        })
      }),
    ).rejects.toThrow()
  })
})
