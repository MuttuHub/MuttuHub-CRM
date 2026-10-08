// Live-DB coverage for the S3 technical-structure tables (Objetivo, Actividad,
// Entregable, Indicador): partial unique code indexes, CHECK constraints and the
// composite same-project foreign keys. Prisma cannot express any of them, and
// the API answers 409/400 from them, so a mocked client would prove nothing.
// Every path rolls back.
//
// `./require-local-db` must stay the FIRST import.
import "./require-local-db"

import { randomUUID } from "node:crypto"

import { Prisma } from "@prisma/client"
import { describe, expect, it } from "vitest"

import { db } from "@/lib/db"

const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 }

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

/** Runs `fn`, returns the error it threw (a failed statement poisons the tx) and rolls back. */
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

const MARKER = "sdd-invariant-estructura"

function driverMessage(error: unknown): string {
  const meta = (error as { meta?: { driverAdapterError?: { cause?: { originalMessage?: string } } } }).meta
  return meta?.driverAdapterError?.cause?.originalMessage ?? String(error)
}

async function fixture(tx: Tx) {
  const suffix = randomUUID()
  const usuario = await tx.usuario.create({
    data: { email: `${MARKER}-${suffix}@example.test`, nombre: MARKER },
  })
  const cliente = await tx.cliente.create({
    data: { nombre: `${MARKER}-cliente-${suffix}`, tipo_cliente: "OTRO", responsable_id: usuario.id },
  })
  const proyecto = await tx.proyecto.create({
    data: { codigo: `PRY-SDD-E-${suffix}`, nombre: `${MARKER}-${suffix}`, cliente_id: cliente.id },
  })
  const otro = await tx.proyecto.create({
    data: { codigo: `PRY-SDD-E2-${suffix}`, nombre: `${MARKER}-otro-${suffix}`, cliente_id: cliente.id },
  })
  return { suffix, usuario, cliente, proyecto, otro }
}

describe("Objetivo invariants (live DB)", () => {
  it("rejects a second live objective with the same codigo, ignoring case, in the same project", async () => {
    const error = await captureError(async (tx) => {
      const { proyecto } = await fixture(tx)
      await tx.objetivo.create({ data: { proyecto_id: proyecto.id, codigo: "OE1", descripcion: "a" } })
      await tx.objetivo.create({ data: { proyecto_id: proyecto.id, codigo: "oe1", descripcion: "b" } })
    })

    expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError)
    expect((error as Prisma.PrismaClientKnownRequestError).code).toBe("P2002")
    expect(driverMessage(error)).toContain("objetivos_codigo_activo_uq")
  })

  it("allows the same codigo in another project and again after a soft delete", async () => {
    const live = await runAndRollback(async (tx) => {
      const { proyecto, otro } = await fixture(tx)
      await tx.objetivo.create({
        data: { proyecto_id: proyecto.id, codigo: "OE1", descripcion: "a", deleted_at: new Date() },
      })
      await tx.objetivo.create({ data: { proyecto_id: proyecto.id, codigo: "OE1", descripcion: "b" } })
      await tx.objetivo.create({ data: { proyecto_id: otro.id, codigo: "OE1", descripcion: "c" } })
      return tx.objetivo.count({ where: { codigo: "OE1", deleted_at: null, proyecto_id: { in: [proyecto.id, otro.id] } } })
    })

    expect(live).toBe(2)
  })

  it("rejects an objective that references a non-existent project", async () => {
    const error = await captureError(async (tx) => {
      await fixture(tx)
      await tx.objetivo.create({ data: { proyecto_id: randomUUID(), codigo: "OE1", descripcion: "a" } })
    })

    expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError)
    expect((error as Prisma.PrismaClientKnownRequestError).code).toBe("P2003")
  })
})
