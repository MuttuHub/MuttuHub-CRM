// Live-DB coverage for the v7-alignment C3a Interacciones schema:
//   - The `TipoInteraccion` enum exists with the five v7 values (REUNION,
//     CORREO, LLAMADA, VISITA, OTRO).
//   - `bitacora_entradas` gained `tipo` (NOT NULL, default OTRO) and a nullable
//     `proximo_paso`. The default is what keeps pre-existing rows working.
//   - A row inserted without `tipo` — the shape of every legacy entry — lands
//     as OTRO with `proximo_paso` null; the column is never a hard requirement
//     for writers that predate this unit.
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

const MARKER = "sdd-invariant-interacciones"

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

describe("TipoInteraccion / bitacora_entradas invariants (live DB)", () => {
  it("the TipoInteraccion enum exists with the five v7 values", async () => {
    const labels = await runAndRollback(async (tx) => {
      const rows = await tx.$queryRaw<{ enumlabel: string }[]>`
        SELECT e.enumlabel
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'TipoInteraccion'
        ORDER BY e.enumsortorder
      `
      return rows.map((r) => r.enumlabel)
    })

    expect(labels).toEqual(["REUNION", "CORREO", "LLAMADA", "VISITA", "OTRO"])
  })

  it("adds `tipo` (NOT NULL, default OTRO) and nullable `proximo_paso` to bitacora_entradas", async () => {
    const columns = await runAndRollback(async (tx) => {
      return tx.$queryRaw<
        {
          column_name: string
          is_nullable: string
          column_default: string | null
          udt_name: string
        }[]
      >`
        SELECT column_name, is_nullable, column_default, udt_name
        FROM information_schema.columns
        WHERE table_name = 'bitacora_entradas'
          AND column_name IN ('tipo', 'proximo_paso')
        ORDER BY column_name
      `
    })

    const tipo = columns.find((c) => c.column_name === "tipo")
    const proximo = columns.find((c) => c.column_name === "proximo_paso")

    expect(tipo).toMatchObject({ is_nullable: "NO", udt_name: "TipoInteraccion" })
    expect(tipo?.column_default).toContain("OTRO")
    expect(proximo).toMatchObject({ is_nullable: "YES", udt_name: "text" })
  })

  it("keeps a legacy-shaped row working: omitted tipo defaults to OTRO and proximo_paso stays null", async () => {
    const entrada = await runAndRollback(async (tx) => {
      const { usuario, cliente } = await fixture(tx)
      return tx.bitacoraEntrada.create({
        data: { cliente_id: cliente.id, autor_id: usuario.id, texto: "nota legacy" },
      })
    })

    expect(entrada.tipo).toBe("OTRO")
    expect(entrada.proximo_paso).toBeNull()
  })

  it("accepts an explicit tipo and proximo_paso", async () => {
    const entrada = await runAndRollback(async (tx) => {
      const { usuario, cliente } = await fixture(tx)
      return tx.bitacoraEntrada.create({
        data: {
          cliente_id: cliente.id,
          autor_id: usuario.id,
          texto: "reunion de seguimiento",
          tipo: "REUNION",
          proximo_paso: "Enviar propuesta",
        },
      })
    })

    expect(entrada.tipo).toBe("REUNION")
    expect(entrada.proximo_paso).toBe("Enviar propuesta")
  })
})
