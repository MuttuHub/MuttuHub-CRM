// Live-DB coverage for V5 (odd/tasks/producto-pendientes-2026-11.md, S3, decision L8): the
// migration adds the optional `clientes.departamento` and the trigger
// `clientes_departamento_en_catalogo`, which only admits a departamento some municipio carries.
// Each case runs in its own rolled-back transaction (a refused statement aborts the transaction).
//
// `./require-local-db` must stay the FIRST import.
import "./require-local-db"

import { randomUUID } from "node:crypto"

import { describe, expect, it } from "vitest"

import { db } from "@/lib/db"

class IntentionalRollback extends Error {}

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0]

/** Runs `fn` with a fresh user and a catalogue departamento, then rolls everything back. */
async function inRollback(fn: (tx: Tx, ctx: { usuarioId: string; departamento: string }) => Promise<void>) {
  try {
    await db.$transaction(async (tx) => {
      const usuario = await tx.usuario.create({
        data: { email: `v5-${randomUUID()}@example.test`, nombre: "V5 invariant" },
      })
      const departamento = `V5 Departamento ${randomUUID()}`
      await tx.municipio.create({ data: { nombre: "V5 Municipio", departamento, activo: false } })
      await fn(tx, { usuarioId: usuario.id, departamento })
      throw new IntentionalRollback()
    })
  } catch (error) {
    if (!(error instanceof IntentionalRollback)) throw error
  }
}

function base(usuarioId: string) {
  return { nombre: "V5 invariant client", tipo_cliente: "EMPRESA_PRIVADA" as const, responsable_id: usuarioId }
}

describe("V5 clientes.departamento (live DB)", () => {
  it("accepts NULL and a departamento of the catalogue (even from a suspended municipio)", async () => {
    const results: Record<string, unknown> = {}
    await inRollback(async (tx, { usuarioId, departamento }) => {
      const sin = await tx.cliente.create({ data: base(usuarioId) })
      results.sin = sin.departamento
      const con = await tx.cliente.create({ data: { ...base(usuarioId), departamento } })
      results.con = con.departamento === departamento
      const cleared = await tx.cliente.update({ where: { id: con.id }, data: { departamento: null } })
      results.cleared = cleared.departamento
    })
    expect(results).toEqual({ sin: null, con: true, cleared: null })
  })

  it("refuses an INSERT with a departamento no municipio carries", async () => {
    let message = ""
    await inRollback(async (tx, { usuarioId }) => {
      try {
        await tx.cliente.create({ data: { ...base(usuarioId), departamento: `Inventado ${randomUUID()}` } })
      } catch (error) {
        message = String(error)
        throw new IntentionalRollback()
      }
    })
    expect(message).toMatch(/no está en el catálogo de municipios/)
  })

  it("refuses an UPDATE to an unknown departamento", async () => {
    let message = ""
    await inRollback(async (tx, { usuarioId }) => {
      const cliente = await tx.cliente.create({ data: base(usuarioId) })
      try {
        await tx.cliente.update({ where: { id: cliente.id }, data: { departamento: "Narnia" } })
      } catch (error) {
        message = String(error)
        throw new IntentionalRollback()
      }
    })
    expect(message).toMatch(/no está en el catálogo de municipios/)
  })

  it("keeps a stored departamento valid when other fields change, even after it left the catalogue", async () => {
    const results: Record<string, unknown> = {}
    await inRollback(async (tx, { usuarioId, departamento }) => {
      const cliente = await tx.cliente.create({ data: { ...base(usuarioId), departamento } })
      // The departamento is renamed in the catalogue; the client's stored value no longer matches.
      await tx.municipio.updateMany({ where: { departamento }, data: { departamento: `${departamento} (renombrado)` } })
      const updated = await tx.cliente.update({ where: { id: cliente.id }, data: { nombre: "Renamed" } })
      results.nombre = updated.nombre
      results.kept = updated.departamento === departamento
    })
    expect(results).toEqual({ nombre: "Renamed", kept: true })
  })
})
