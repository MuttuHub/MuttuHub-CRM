// Live-DB coverage for the v2_proyecto_descripcion migration (M3): `proyectos.descripcion` is a
// nullable TEXT column, so existing projects keep working untouched. Every path rolls back.
//
// `./require-local-db` must stay the FIRST import.
import "./require-local-db"

import { randomUUID } from "node:crypto"

import { describe, expect, it } from "vitest"

import { db } from "@/lib/db"

const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 }

class IntentionalRollback extends Error {}

describe("proyectos.descripcion", () => {
  it("is a nullable text column", async () => {
    const rows = await db.$queryRaw<{ data_type: string; is_nullable: string }[]>`
      SELECT data_type, is_nullable FROM information_schema.columns
      WHERE table_name = 'proyectos' AND column_name = 'descripcion'`
    expect(rows).toHaveLength(1)
    expect(rows[0].data_type).toBe("text")
    expect(rows[0].is_nullable).toBe("YES")
  })

  it("a project created without it has a null description, and one with it keeps it", async () => {
    let result: { sin: string | null; con: string | null } | undefined
    try {
      await db.$transaction(async (tx) => {
        const suffix = randomUUID()
        const usuario = await tx.usuario.create({
          data: { email: `sdd-invariant-desc-${suffix}@example.test`, nombre: "sdd-invariant-desc", rol: "GERENCIA" },
        })
        const cliente = await tx.cliente.create({
          data: { nombre: `sdd-invariant-desc-${suffix}`, tipo_cliente: "OTRO", responsable_id: usuario.id },
        })
        const sin = await tx.proyecto.create({
          data: { codigo: `PRY-SDD-D1-${suffix}`, nombre: "sin", cliente_id: cliente.id },
        })
        const con = await tx.proyecto.create({
          data: { codigo: `PRY-SDD-D2-${suffix}`, nombre: "con", cliente_id: cliente.id, descripcion: "Alcance del proyecto" },
        })
        result = { sin: sin.descripcion, con: con.descripcion }
        throw new IntentionalRollback()
      }, TX_OPTIONS)
    } catch (error) {
      if (!(error instanceof IntentionalRollback)) throw error
    }
    expect(result).toEqual({ sin: null, con: "Alcance del proyecto" })
  })
})
