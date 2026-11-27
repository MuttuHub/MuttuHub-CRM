// Live-DB coverage for T8 (odd/tasks/reportes-etiqueta-y-posicion-propia.md, S16): the migration adds
// an optional `bitacora_entradas.proyecto_id` with a NO ACTION foreign key to `proyectos`, so an entry
// keeps working without a project, cannot name a project that does not exist, and a referenced project
// cannot be hard-deleted. Whether the client is an ally of that project is checked by the API.
// Each case runs in its own rolled-back transaction (a refused statement aborts the transaction).
//
// `./require-local-db` must stay the FIRST import.
import "./require-local-db"

import { randomUUID } from "node:crypto"

import { describe, expect, it } from "vitest"

import { db } from "@/lib/db"

class IntentionalRollback extends Error {}

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0]

type Base = { tx: Tx; clienteId: string; autorId: string; proyectoId: string }

/** Runs `fn` with a fresh client and posición propia project, then rolls everything back. Returns the error `fn` threw, if any. */
async function inRollback(fn: (base: Base) => Promise<void>): Promise<string> {
  let refused = ""
  try {
    await db.$transaction(async (tx) => {
      const usuario = await tx.usuario.create({
        data: { email: `bp-${randomUUID()}@example.test`, nombre: "Bitácora proyecto invariant" },
      })
      const cliente = await tx.cliente.create({
        data: { nombre: "Bitácora proyecto client", tipo_cliente: "OTRO", responsable_id: usuario.id },
      })
      const proyecto = await tx.proyecto.create({
        data: { codigo: `BP-${randomUUID()}`, nombre: "Bitácora proyecto", origen: "POSICION_PROPIA" },
      })
      try {
        await fn({ tx, clienteId: cliente.id, autorId: usuario.id, proyectoId: proyecto.id })
      } catch (error) {
        refused = String(error)
      }
      throw new IntentionalRollback()
    })
  } catch (error) {
    if (!(error instanceof IntentionalRollback)) throw error
  }
  return refused
}

describe("T8 bitácora entry linked to a project (live DB)", () => {
  it("keeps an entry without a project valid, with proyecto_id NULL", async () => {
    let fila: unknown = null
    const refused = await inRollback(async ({ tx, clienteId, autorId }) => {
      fila = await tx.bitacoraEntrada.create({
        data: { cliente_id: clienteId, autor_id: autorId, texto: "Sin proyecto" },
        select: { proyecto_id: true },
      })
    })
    expect(refused).toBe("")
    expect(fila).toEqual({ proyecto_id: null })
  })

  it("stores an entry linked to an existing project", async () => {
    let fila: unknown = null
    let esperado = ""
    const refused = await inRollback(async ({ tx, clienteId, autorId, proyectoId }) => {
      esperado = proyectoId
      fila = await tx.bitacoraEntrada.create({
        data: { cliente_id: clienteId, autor_id: autorId, texto: "Con proyecto", proyecto_id: proyectoId },
        select: { proyecto_id: true },
      })
    })
    expect(refused).toBe("")
    expect(fila).toEqual({ proyecto_id: esperado })
  })

  it("refuses an entry naming a project that does not exist", async () => {
    const refused = await inRollback(async ({ tx, clienteId, autorId }) => {
      await tx.bitacoraEntrada.create({
        data: { cliente_id: clienteId, autor_id: autorId, texto: "Proyecto fantasma", proyecto_id: randomUUID() },
      })
    })
    expect(refused).toMatch(/bitacora_entradas_proyecto_id_fkey|Foreign key constraint|P2003/)
  })

  it("refuses hard-deleting a project an entry names (NO ACTION)", async () => {
    const refused = await inRollback(async ({ tx, clienteId, autorId, proyectoId }) => {
      await tx.bitacoraEntrada.create({
        data: { cliente_id: clienteId, autor_id: autorId, texto: "Con proyecto", proyecto_id: proyectoId },
      })
      await tx.proyecto.delete({ where: { id: proyectoId } })
    })
    expect(refused).toMatch(/bitacora_entradas_proyecto_id_fkey|Foreign key constraint|P2003/)
  })

  // T8 verifier probe: the route's ally lookup must not find an ally row of a soft-deleted project.
  it("does not match an ally of a soft-deleted project with the route's ally lookup", async () => {
    let encontrado: unknown = "unset"
    const refused = await inRollback(async ({ tx, clienteId, proyectoId }) => {
      await tx.proyectoCliente.create({ data: { proyecto_id: proyectoId, cliente_id: clienteId, rol: "ALIADO" } })
      await tx.proyecto.update({ where: { id: proyectoId }, data: { deleted_at: new Date() } })
      encontrado = await tx.proyectoCliente.findFirst({
        where: { proyecto_id: proyectoId, cliente_id: clienteId, proyecto: { deleted_at: null } },
        select: { id: true },
      })
    })
    expect(refused).toBe("")
    expect(encontrado).toBeNull()
  })
})
