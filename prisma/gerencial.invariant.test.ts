// Live-DB coverage for the S9 gerencial flag (`usuarios.puede_ver_tablero_gerencial`): the column
// exists as NOT NULL boolean defaulting to false, so nobody gains the portfolio view by migrating.
// Every path rolls back.
//
// `./require-local-db` must stay the FIRST import.
import "./require-local-db"

import { randomUUID } from "node:crypto"

import { describe, expect, it } from "vitest"

import { db } from "@/lib/db"

const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 }

class IntentionalRollback extends Error {}

describe("usuarios.puede_ver_tablero_gerencial", () => {
  it("is a NOT NULL boolean column defaulting to false", async () => {
    const rows = await db.$queryRaw<{ data_type: string; is_nullable: string; column_default: string | null }[]>`
      SELECT data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'usuarios' AND column_name = 'puede_ver_tablero_gerencial'`
    expect(rows).toHaveLength(1)
    expect(rows[0].data_type).toBe("boolean")
    expect(rows[0].is_nullable).toBe("NO")
    expect(rows[0].column_default).toBe("false")
  })

  it("a new user does not have the flag", async () => {
    let flag: boolean | undefined
    try {
      await db.$transaction(async (tx) => {
        const usuario = await tx.usuario.create({
          data: { email: `sdd-invariant-gerencial-${randomUUID()}@example.test`, nombre: "sdd-invariant-gerencial" },
        })
        flag = usuario.puede_ver_tablero_gerencial
        throw new IntentionalRollback()
      }, TX_OPTIONS)
    } catch (error) {
      if (!(error instanceof IntentionalRollback)) throw error
    }
    expect(flag).toBe(false)
  })
})
