// Live-DB coverage for T4a (odd/tasks/reportes-etiqueta-y-posicion-propia.md, S8, S9): the
// migration makes `proyectos.cliente_id` optional only for a POSICION_PROPIA project (CHECK
// `proyectos_cliente_por_origen_check`, which must also refuse a NULL origin without a client) and
// creates `proyecto_clientes` (one row per project and client, RESTRICT foreign keys).
// Each case runs in its own rolled-back transaction (a refused statement aborts the transaction).
//
// `./require-local-db` must stay the FIRST import.
import "./require-local-db"

import { randomUUID } from "node:crypto"

import type { OrigenProyecto, Usuario } from "@prisma/client"
import { describe, expect, it } from "vitest"

import { projectListWhere } from "@/lib/api/projects"
import { db } from "@/lib/db"
import { ALIADOS_ACTIVOS_COUNT } from "@/lib/proyectos/posicion-propia"

class IntentionalRollback extends Error {}

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0]

/** Runs `fn` with a fresh client, then rolls everything back. Returns the error `fn` threw, if any. */
async function inRollback(fn: (tx: Tx, clienteId: string) => Promise<void>): Promise<string> {
  let refused = ""
  try {
    await db.$transaction(async (tx) => {
      const usuario = await tx.usuario.create({
        data: { email: `pp-${randomUUID()}@example.test`, nombre: "PP invariant" },
      })
      const cliente = await tx.cliente.create({
        data: { nombre: "PP invariant client", tipo_cliente: "OTRO", responsable_id: usuario.id },
      })
      try {
        await fn(tx, cliente.id)
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

const proyecto = (origen: OrigenProyecto | null, cliente_id: string | null) => ({
  codigo: `PP-${randomUUID()}`,
  nombre: "PP invariant project",
  origen,
  cliente_id,
})

describe("T4a posición propia (live DB)", () => {
  it("accepts a POSICION_PROPIA project without a client", async () => {
    const refused = await inRollback(async (tx) => {
      await tx.proyecto.create({ data: proyecto("POSICION_PROPIA", null) })
    })
    expect(refused).toBe("")
  })

  it.each<[OrigenProyecto | null]>([["INDEPENDIENTE"], ["OPORTUNIDAD"], [null]])(
    "refuses a project of origin %s without a client",
    async (origen) => {
      const refused = await inRollback(async (tx) => {
        await tx.proyecto.create({ data: proyecto(origen, null) })
      })
      expect(refused).toMatch(/proyectos_cliente_por_origen_check/)
    },
  )

  it("keeps one ally row per project and client", async () => {
    const refused = await inRollback(async (tx, clienteId) => {
      const p = await tx.proyecto.create({ data: proyecto("POSICION_PROPIA", null) })
      await tx.proyectoCliente.create({ data: { proyecto_id: p.id, cliente_id: clienteId, rol: "ALIADO" } })
      await tx.proyectoCliente.create({ data: { proyecto_id: p.id, cliente_id: clienteId, rol: "FINANCIADOR" } })
    })
    expect(refused).toMatch(/Unique constraint|P2002/)
  })

  it("refuses deleting a client that is an ally (ON DELETE RESTRICT)", async () => {
    const refused = await inRollback(async (tx, clienteId) => {
      const p = await tx.proyecto.create({ data: proyecto("POSICION_PROPIA", null) })
      await tx.proyectoCliente.create({ data: { proyecto_id: p.id, cliente_id: clienteId, rol: "PROSPECTO" } })
      await tx.cliente.delete({ where: { id: clienteId } })
    })
    expect(refused).toMatch(/proyecto_clientes_cliente_id_fkey|Foreign key constraint|P2003/)
  })

  it("starts an ally EN_GESTION with no contribution", async () => {
    let fila: unknown = null
    const refused = await inRollback(async (tx, clienteId) => {
      const p = await tx.proyecto.create({ data: proyecto("POSICION_PROPIA", null) })
      fila = await tx.proyectoCliente.create({
        data: { proyecto_id: p.id, cliente_id: clienteId, rol: "ALIADO" },
        select: { estado: true, aporte_cop: true },
      })
    })
    expect(refused).toBe("")
    expect(fila).toEqual({ estado: "EN_GESTION", aporte_cop: null })
  })

  // T6 verifier advisory A3: the ally rule the list filter and the «N aliados» count share
  // (not DESCARTADO, client not soft-deleted) checked against Postgres, not only against mocks.
  it("counts and matches only allies that are not discarded and whose client is not deleted", async () => {
    let resultado: unknown = null
    const refused = await inRollback(async (tx, activoId) => {
      const { responsable_id } = await tx.cliente.findUniqueOrThrow({ where: { id: activoId } })
      const nuevoCliente = (nombre: string, deleted_at: Date | null = null) =>
        tx.cliente.create({ data: { nombre, tipo_cliente: "OTRO", responsable_id, deleted_at } })
      const descartado = await nuevoCliente("PP descartado")
      const borrado = await nuevoCliente("PP borrado", new Date())
      const p = await tx.proyecto.create({ data: proyecto("POSICION_PROPIA", null) })
      await tx.proyectoCliente.createMany({
        data: [
          { proyecto_id: p.id, cliente_id: activoId, rol: "FINANCIADOR", estado: "COMPROMETIDO" },
          { proyecto_id: p.id, cliente_id: descartado.id, rol: "ALIADO", estado: "DESCARTADO" },
          { proyecto_id: p.id, cliente_id: borrado.id, rol: "ALIADO" },
        ],
      })
      const gerencia = { id: responsable_id, rol: "GERENCIA" } as Usuario
      const coincide = async (cliente_id: string) =>
        (await tx.proyecto.count({ where: { AND: [{ id: p.id }, projectListWhere(gerencia, { cliente_id })] } })) === 1
      const fila = await tx.proyecto.findUniqueOrThrow({ where: { id: p.id }, select: ALIADOS_ACTIVOS_COUNT })
      resultado = {
        aliados: fila._count.aliados,
        activo: await coincide(activoId),
        descartado: await coincide(descartado.id),
        borrado: await coincide(borrado.id),
      }
    })
    expect(refused).toBe("")
    expect(resultado).toEqual({ aliados: 1, activo: true, descartado: false, borrado: false })
  })
})
