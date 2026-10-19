// Live-DB coverage for the S2.6 `ProyectoMiembro` invariants:
//   - At most ONE active membership per `(proyecto_id, usuario_id)`, enforced
//     by the partial unique index `proyecto_miembros_activo_uq` (something
//     Prisma cannot express in schema.prisma).
//   - Removal is a soft delete: a row with `removed_at` set falls outside that
//     predicate, so the same pair can be re-added later.
//   - Memberships can never point at a project or a user that does not exist.
//
// The API answers 409 from this index, so a mocked Prisma client would prove
// nothing; this file hits the LOCAL Docker database and forces a rollback on
// every path.
//
// `./require-local-db` must stay the FIRST import — it loads `.env.local` and
// refuses any non-loopback target before the Prisma client is built.
import "./require-local-db"

import { randomUUID } from "node:crypto"

import { Prisma } from "@prisma/client"
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

/** Runs `fn` and returns the error it threw, then rolls the transaction back. */
async function captureError(fn: (tx: Tx) => Promise<unknown>): Promise<unknown> {
  let captured: unknown
  try {
    await db.$transaction(async (tx) => {
      try {
        await fn(tx)
      } catch (error) {
        captured = error
      }
      throw new IntentionalRollback()
    }, TX_OPTIONS)
  } catch (error) {
    if (!(error instanceof IntentionalRollback)) throw error
  }
  return captured
}

const MARKER = "sdd-invariant-miembros"

function originalMessage(error: Prisma.PrismaClientKnownRequestError): string {
  const meta = error.meta as
    | { driverAdapterError?: { cause?: { originalMessage?: string } } }
    | undefined
  return meta?.driverAdapterError?.cause?.originalMessage ?? ""
}

/**
 * Every id is a fresh UUID and every code is MARKER-prefixed, so nothing this
 * suite creates can collide with a value `prisma/seed.ts` already owns.
 */
async function fixture(tx: Tx) {
  const suffix = randomUUID()
  const usuario = await tx.usuario.create({
    data: { email: `${MARKER}-${suffix}@example.test`, nombre: MARKER },
  })
  const cliente = await tx.cliente.create({
    data: { nombre: `${MARKER}-cliente-${suffix}`, tipo_cliente: "OTRO", responsable_id: usuario.id },
  })
  const proyecto = await tx.proyecto.create({
    data: {
      codigo: `PRY-SDD-M-${suffix}`,
      nombre: `${MARKER}-proyecto-${suffix}`,
      cliente_id: cliente.id,
    },
  })
  return { suffix, usuario, cliente, proyecto }
}

describe("ProyectoMiembro invariants (live DB)", () => {
  it("the database rejects a second ACTIVE membership for the same pair through proyecto_miembros_activo_uq", async () => {
    const error = await captureError(async (tx) => {
      const { usuario, proyecto } = await fixture(tx)
      await tx.proyectoMiembro.create({
        data: { proyecto_id: proyecto.id, usuario_id: usuario.id, agregado_por_id: usuario.id },
      })
      await tx.proyectoMiembro.create({
        data: { proyecto_id: proyecto.id, usuario_id: usuario.id, agregado_por_id: usuario.id },
      })
    })

    expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError)
    const known = error as Prisma.PrismaClientKnownRequestError
    expect(known.code).toBe("P2002")
    expect(originalMessage(known)).toContain("proyecto_miembros_activo_uq")
  })

  it("allows re-adding the same pair once the previous row is removed (removed_at IS NOT NULL)", async () => {
    const active = await runAndRollback(async (tx) => {
      const { usuario, proyecto } = await fixture(tx)
      await tx.proyectoMiembro.create({
        data: {
          proyecto_id: proyecto.id,
          usuario_id: usuario.id,
          agregado_por_id: usuario.id,
          removed_at: new Date(),
          removido_por_id: usuario.id,
        },
      })
      await tx.proyectoMiembro.create({
        data: { proyecto_id: proyecto.id, usuario_id: usuario.id, agregado_por_id: usuario.id },
      })
      return tx.proyectoMiembro.count({
        where: { proyecto_id: proyecto.id, usuario_id: usuario.id, removed_at: null },
      })
    })

    expect(active).toBe(1)
  })

  it("rejects a membership that references a non-existent project", async () => {
    const error = await captureError(async (tx) => {
      const { usuario } = await fixture(tx)
      await tx.proyectoMiembro.create({
        data: { proyecto_id: randomUUID(), usuario_id: usuario.id, agregado_por_id: usuario.id },
      })
    })

    expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError)
    const known = error as Prisma.PrismaClientKnownRequestError
    expect(known.code).toBe("P2003")
    expect(originalMessage(known)).toContain("proyecto_miembros_proyecto_id_fkey")
  })

  it("rejects a membership that references a non-existent user", async () => {
    const error = await captureError(async (tx) => {
      const { usuario, proyecto } = await fixture(tx)
      await tx.proyectoMiembro.create({
        data: { proyecto_id: proyecto.id, usuario_id: randomUUID(), agregado_por_id: usuario.id },
      })
    })

    expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError)
    const known = error as Prisma.PrismaClientKnownRequestError
    expect(known.code).toBe("P2003")
    expect(originalMessage(known)).toContain("proyecto_miembros_usuario_id_fkey")
  })
})
