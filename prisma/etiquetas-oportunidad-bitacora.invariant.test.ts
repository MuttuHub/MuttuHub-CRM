// Live-DB coverage for T11 (odd/tasks/reportes-etiqueta-y-posicion-propia.md, S18): the migration adds an
// optional `etiquetas` list to `oportunidades` and `bitacora_entradas`. A row written without tags reads back
// as an empty list, tags round-trip in order, and the report's `has` filter finds them.
// Everything runs in one rolled-back transaction.
//
// `./require-local-db` must stay the FIRST import.
import "./require-local-db"

import { randomUUID } from "node:crypto"

import { describe, expect, it } from "vitest"

import { db } from "@/lib/db"

class IntentionalRollback extends Error {}

describe("S18 tags on opportunities and bitácora entries (live DB)", () => {
  it("defaults to an empty list, keeps the tags in order and filters with has", async () => {
    let checked = false
    try {
      await db.$transaction(async (tx) => {
        const tag = `s18-${randomUUID()}`
        const usuario = await tx.usuario.create({
          data: { email: `s18-${randomUUID()}@example.test`, nombre: "S18 invariant" },
        })
        const cliente = await tx.cliente.create({
          data: { nombre: "S18 client", tipo_cliente: "OTRO", responsable_id: usuario.id },
        })

        const sinEtiquetas = await tx.oportunidad.create({ data: { cliente_id: cliente.id, nombre: "S18 plain" } })
        const conEtiquetas = await tx.oportunidad.create({
          data: { cliente_id: cliente.id, nombre: "S18 tagged", etiquetas: [tag, "Segunda"] },
        })
        expect(sinEtiquetas.etiquetas).toEqual([])
        expect(conEtiquetas.etiquetas).toEqual([tag, "Segunda"])

        const entradaSin = await tx.bitacoraEntrada.create({
          data: { cliente_id: cliente.id, autor_id: usuario.id, texto: "S18 plain" },
        })
        const entradaCon = await tx.bitacoraEntrada.create({
          data: { cliente_id: cliente.id, autor_id: usuario.id, texto: "S18 tagged", etiquetas: [tag] },
        })
        expect(entradaSin.etiquetas).toEqual([])

        const oportunidades = await tx.oportunidad.findMany({ where: { etiquetas: { has: tag } }, select: { id: true } })
        const entradas = await tx.bitacoraEntrada.findMany({ where: { etiquetas: { has: tag } }, select: { id: true } })
        expect(oportunidades).toEqual([{ id: conEtiquetas.id }])
        expect(entradas).toEqual([{ id: entradaCon.id }])
        checked = true
        throw new IntentionalRollback()
      })
    } catch (error) {
      if (!(error instanceof IntentionalRollback)) throw error
    }
    expect(checked).toBe(true)
  })
})
