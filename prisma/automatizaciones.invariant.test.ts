// Live-DB coverage for V8 (odd/tasks/producto-pendientes-2026-11.md, S4): the «sin contacto»
// notification. The migrations add the SIN_CONTACTO enum value and `notificaciones.cliente_id`
// with a unique (usuario_id, tipo, cliente_id) key; the automation rule relies on that key to keep
// one row per (usuario, cliente) across cron reruns. Everything runs in a rolled-back transaction.
//
// `./require-local-db` must stay the FIRST import.
import "./require-local-db"

import { randomUUID } from "node:crypto"

import { describe, expect, it } from "vitest"

import { db } from "@/lib/db"

class IntentionalRollback extends Error {}

describe("V8 SIN_CONTACTO notifications (live DB)", () => {
  it("keeps one row per (usuario, cliente), re-arms it in place and unlinks a deleted client", async () => {
    const results: Record<string, unknown> = {}
    try {
      await db.$transaction(async (tx) => {
        const usuario = await tx.usuario.create({
          data: { email: `v8-${randomUUID()}@example.test`, nombre: "V8 invariant" },
        })
        const cliente = await tx.cliente.create({
          data: { nombre: "V8 invariant client", tipo_cliente: "EMPRESA_PRIVADA", responsable_id: usuario.id },
        })
        const key = { usuario_id: usuario.id, tipo: "SIN_CONTACTO" as const, cliente_id: cliente.id }

        // The rule's write: upsert by the compound key, twice (a rerun in a new stretch).
        const first = await tx.notificacion.upsert({
          where: { usuario_id_tipo_cliente_id: key },
          create: key,
          update: { leida: false },
        })
        await tx.notificacion.update({ where: { id: first.id }, data: { leida: true } })
        const second = await tx.notificacion.upsert({
          where: { usuario_id_tipo_cliente_id: key },
          create: key,
          update: { leida: false },
        })
        results.sameRow = second.id === first.id
        results.rearmed = second.leida === false

        // A plain duplicate insert is refused by the unique index.
        const { count } = await tx.notificacion.createMany({ data: [key], skipDuplicates: true })
        results.duplicateCount = count
        results.rows = await tx.notificacion.count({ where: key })

        // Deleting the client keeps the notification, unlinked.
        await tx.cliente.delete({ where: { id: cliente.id } })
        results.afterDelete = (await tx.notificacion.findUniqueOrThrow({ where: { id: first.id } })).cliente_id

        throw new IntentionalRollback()
      })
    } catch (error) {
      if (!(error instanceof IntentionalRollback)) throw error
    }
    expect(results).toEqual({ sameRow: true, rearmed: true, duplicateCount: 0, rows: 1, afterDelete: null })
  })
})
