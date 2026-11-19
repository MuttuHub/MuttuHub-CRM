// Live-DB coverage for B6 (odd/tasks/producto-pendientes-2026-11.md, S1, decision L7 «Bloquear»): a rubro
// switched off for ONE project through `proyecto_rubros_deshabilitados`. Everything runs in a rolled-back
// transaction, audit rows included (the append-only triggers only reject UPDATE/DELETE, not a rollback).
//
// `./require-local-db` must stay the FIRST import.
import "./require-local-db"

import { randomUUID } from "node:crypto"

import { describe, expect, it } from "vitest"

import { db } from "@/lib/db"
import { RespuestaAbortada } from "@/lib/api/errors"
import { loadBudgetView } from "@/lib/api/presupuesto"
import { cambiarHabilitacionRubro } from "@/lib/api/rubros-proyecto"

class IntentionalRollback extends Error {}

const MARKER = "b6-invariant"

describe("B6 rubros disabled per project (live DB)", () => {
  it("disables a $0 rubro for one project only, refuses one with money, audits and re-enables", async () => {
    const results: Record<string, unknown> = {}
    try {
      await db.$transaction(async (tx) => {
        const suffix = randomUUID()
        const usuario = await tx.usuario.create({ data: { email: `${MARKER}-${suffix}@example.test`, nombre: MARKER } })
        const cliente = await tx.cliente.create({
          data: { nombre: `${MARKER}-cliente-${suffix}`, tipo_cliente: "OTRO", responsable_id: usuario.id },
        })
        const proyecto = await tx.proyecto.create({
          data: { codigo: `PRY-B6-A-${suffix}`, nombre: `${MARKER}-a`, cliente_id: cliente.id },
        })
        const otro = await tx.proyecto.create({
          data: { codigo: `PRY-B6-B-${suffix}`, nombre: `${MARKER}-b`, cliente_id: cliente.id },
        })
        const rubro = await tx.rubro.create({ data: { codigo: `B6-${suffix.slice(0, 8)}`, nombre: `${MARKER}-rubro` } })
        await tx.lineaPresupuestal.create({ data: { proyecto_id: proyecto.id, rubro_id: rubro.id, monto_proyectado_cop: 0 } })
        await tx.lineaPresupuestal.create({ data: { proyecto_id: otro.id, rubro_id: rubro.id, monto_proyectado_cop: 1000 } })

        const args = { rubroId: rubro.id, usuarioId: usuario.id }
        results.disabled = await cambiarHabilitacionRubro(tx, { ...args, proyectoId: proyecto.id, habilitado: false })

        const vista = await loadBudgetView(tx, proyecto.id, "BORRADOR", null)
        results.hiddenInA = !vista.rubros.some((r) => r.rubro_id === rubro.id) && !vista.lineas.some((l) => l.rubro_id === rubro.id)
        results.listedApartInA = vista.rubros_deshabilitados.map((r) => r.rubro_id)
        const vistaOtro = await loadBudgetView(tx, otro.id, "BORRADOR", null)
        results.offeredInB = vistaOtro.rubros.some((r) => r.rubro_id === rubro.id) && vistaOtro.rubros_deshabilitados.length === 0

        // The other project has money on it: refused, nothing written.
        const refused = await cambiarHabilitacionRubro(tx, { ...args, proyectoId: otro.id, habilitado: false }).catch((e) => e)
        results.refusedStatus = refused instanceof RespuestaAbortada ? refused.response.status : String(refused)

        // The composite key keeps one row per (project, rubro).
        const { count } = await tx.proyectoRubroDeshabilitado.createMany({
          data: [{ proyecto_id: proyecto.id, rubro_id: rubro.id, created_by_id: usuario.id }],
          skipDuplicates: true,
        })
        results.duplicateCount = count

        results.audit = await tx.auditoriaCambio.findMany({
          where: { entidad: "rubro", entidad_id: rubro.id },
          select: { proyecto_id: true, accion: true, campo: true, valor_anterior: true, valor_nuevo: true },
        })

        results.enabled = await cambiarHabilitacionRubro(tx, { ...args, proyectoId: proyecto.id, habilitado: true })
        results.rowsAfterEnable = await tx.proyectoRubroDeshabilitado.count({ where: { rubro_id: rubro.id } })
        results.catalogueActive = (await tx.rubro.findUniqueOrThrow({ where: { id: rubro.id } })).activo
        results.projectIdForAudit = proyecto.id

        throw new IntentionalRollback()
      })
    } catch (error) {
      if (!(error instanceof IntentionalRollback)) throw error
    }
    const proyectoId = results.projectIdForAudit
    expect(results).toMatchObject({
      disabled: { habilitado: false },
      hiddenInA: true,
      offeredInB: true,
      refusedStatus: 409,
      duplicateCount: 0,
      audit: [{ proyecto_id: proyectoId, accion: "EDITAR", campo: "habilitado", valor_anterior: true, valor_nuevo: false }],
      enabled: { habilitado: true },
      rowsAfterEnable: 0,
      catalogueActive: true,
    })
    expect((results.listedApartInA as string[]).length).toBe(1)
  })
})
