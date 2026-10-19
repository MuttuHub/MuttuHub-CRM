// Live-DB coverage for the S2.2 project-code counter:
//   - atomicity: two concurrent transactions get consecutive, distinct `PRY-`
//     sequences for the same year;
//   - initialisation: a year whose projects exist but whose counter row does
//     not yet continues the series from the maximum code instead of colliding
//     with `proyectos_codigo_key`.
//
// A mocked Prisma client cannot prove either (the first needs real row locks,
// the second real rows), so this file hits the LOCAL Docker database.
//
// `./require-local-db` must stay the FIRST import — it loads `.env.local` and
// refuses any non-loopback target before the Prisma client is built.
import "./require-local-db"

import { randomUUID } from "node:crypto"

import { describe, expect, it } from "vitest"

import { nextProjectCode } from "@/lib/api/project-code"
import { parseProjectCode } from "@/lib/proyectos/codigo"
import { db } from "@/lib/db"

const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 }

// Synthetic year on purpose: the Friday demo's first project MUST come out as
// `PRY-2026-001`, so no test may touch the counter or the rows of the current
// year. 1999 exercises the same code paths and owns nothing the demo needs.
const YEAR = 1999
const YEAR_PREFIX = "PRY-1999-"
const MARKER = "sdd-invariant-secuencia"

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

/** Removes every row this suite could own for `year` — no leftovers. */
async function cleanup(year: number): Promise<void> {
  await db.proyecto.deleteMany({ where: { codigo: { startsWith: `PRY-${year}-` } } })
  await db.proyectoSecuencia.deleteMany({ where: { anio: year } })
}

async function fixture(tx: Tx) {
  const suffix = randomUUID()
  const usuario = await tx.usuario.create({
    data: { email: `${MARKER}-${suffix}@example.test`, nombre: MARKER },
  })
  const cliente = await tx.cliente.create({
    data: { nombre: `${MARKER}-cliente-${suffix}`, tipo_cliente: "OTRO", responsable_id: usuario.id },
  })
  return { suffix, cliente }
}

describe("project-code counter (live DB)", () => {
  it("gives two concurrent transactions consecutive, distinct codes", async () => {
    await cleanup(YEAR)
    try {
      const [a, b] = await Promise.all([
        db.$transaction((tx) => nextProjectCode(tx, YEAR), TX_OPTIONS),
        db.$transaction((tx) => nextProjectCode(tx, YEAR), TX_OPTIONS),
      ])

      expect(a).not.toBe(b)
      const sequences = [parseProjectCode(a)!.sequence, parseProjectCode(b)!.sequence].sort(
        (x, y) => x - y,
      )
      expect(sequences[1]).toBe(sequences[0] + 1)
    } finally {
      await cleanup(YEAR)
    }
  })

  it("continues the series from the maximum existing code when the counter does not exist", async () => {
    const code = await runAndRollback(async (tx) => {
      const { suffix, cliente } = await fixture(tx)
      await tx.proyecto.create({
        data: { codigo: `${YEAR_PREFIX}005`, nombre: `${MARKER}-p5-${suffix}`, cliente_id: cliente.id },
      })
      await tx.proyecto.create({
        data: { codigo: `${YEAR_PREFIX}002`, nombre: `${MARKER}-p2-${suffix}`, cliente_id: cliente.id },
      })

      return nextProjectCode(tx, YEAR)
    })

    expect(code).toBe("PRY-1999-006")
  })
})
