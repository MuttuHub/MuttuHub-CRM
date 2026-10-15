// Live-DB coverage for the S6 project notifications (`notificaciones.proyecto_id/gasto_id`,
// the `SOBREGASTO_RUBRO` enum value, the unique key) and the row lock the overspend
// validation takes on `lineas_presupuestales`. Every path rolls back.
//
// `./require-local-db` must stay the FIRST import.
import "./require-local-db"

import { randomUUID } from "node:crypto"

import { describe, expect, it } from "vitest"

import { db } from "@/lib/db"

const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 }

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

async function captureError(fn: (tx: Tx) => Promise<unknown>): Promise<unknown> {
  let captured: unknown
  try {
    await db.$transaction(async (tx) => {
      try {
        await fn(tx)
      } catch (error) {
        captured = error
      }
      throw new IntentionalRollback()
    }, TX_OPTIONS)
  } catch (error) {
    if (!(error instanceof IntentionalRollback)) throw error
  }
  return captured
}

const MARKER = "sdd-invariant-notif-proyecto"

async function fixture(tx: Tx) {
  const suffix = randomUUID()
  const usuario = await tx.usuario.create({
    data: { email: `${MARKER}-${suffix}@example.test`, nombre: MARKER, rol: "GERENCIA" },
  })
  const cliente = await tx.cliente.create({
    data: { nombre: `${MARKER}-cliente-${suffix}`, tipo_cliente: "OTRO", responsable_id: usuario.id },
  })
  const proyecto = await tx.proyecto.create({
    data: { codigo: `PRY-SDD-N-${suffix}`, nombre: `${MARKER}-${suffix}`, cliente_id: cliente.id },
  })
  const rubro = await tx.rubro.create({ data: { codigo: `N-${suffix.slice(0, 8)}`, nombre: `${MARKER}-rubro` } })
  const linea = await tx.lineaPresupuestal.create({
    data: { proyecto_id: proyecto.id, rubro_id: rubro.id, monto_proyectado_cop: 1000 },
  })
  const gasto = await tx.gasto.create({
    data: {
      proyecto_id: proyecto.id,
      linea_id: linea.id,
      fecha_documento: new Date("2026-10-15"),
      periodo: "2026-10",
      tipo_soporte: "FACTURA_PROVEEDOR",
      tercero_nombre: "Proveedor SAS",
      tercero_tipo_id: "NIT",
      tercero_numero_id: "900123456",
      tercero_id_norm: "900123456",
      numero_documento: "FE-1",
      numero_documento_norm: "FE1",
      descripcion: "Tiquetes",
      monto_cop: 100,
      registrado_por_id: usuario.id,
    },
  })
  return { usuario, proyecto, linea, gasto }
}

describe("Project notifications (live DB)", () => {
  it("stores a SOBREGASTO_RUBRO notification tied to a project and an expense", async () => {
    const row = await runAndRollback(async (tx) => {
      const { usuario, proyecto, gasto } = await fixture(tx)
      return tx.notificacion.create({
        data: { usuario_id: usuario.id, tipo: "SOBREGASTO_RUBRO", proyecto_id: proyecto.id, gasto_id: gasto.id },
      })
    })
    expect(row.tipo).toBe("SOBREGASTO_RUBRO")
    expect(row.leida).toBe(false)
  })

  it("stores a GASTO_RECHAZADO notification tied to a project and an expense", async () => {
    const row = await runAndRollback(async (tx) => {
      const { usuario, proyecto, gasto } = await fixture(tx)
      return tx.notificacion.create({
        data: {
          usuario_id: usuario.id,
          tipo: "GASTO_RECHAZADO",
          proyecto_id: proyecto.id,
          gasto_id: gasto.id,
        },
      })
    })
    expect(row.tipo).toBe("GASTO_RECHAZADO")
    expect(row.leida).toBe(false)
  })

  it("keeps one notification per (usuario, tipo, gasto): skipDuplicates adds nothing", async () => {
    const total = await runAndRollback(async (tx) => {
      const { usuario, proyecto, gasto } = await fixture(tx)
      const data = { usuario_id: usuario.id, tipo: "SOBREGASTO_RUBRO" as const, proyecto_id: proyecto.id, gasto_id: gasto.id }
      await tx.notificacion.createMany({ data: [data], skipDuplicates: true })
      await tx.notificacion.createMany({ data: [data], skipDuplicates: true })
      return tx.notificacion.count({ where: { usuario_id: usuario.id, gasto_id: gasto.id } })
    })
    expect(total).toBe(1)
  })

  it("rejects a duplicate (usuario, tipo, gasto) without skipDuplicates", async () => {
    const error = await captureError(async (tx) => {
      const { usuario, proyecto, gasto } = await fixture(tx)
      const data = { usuario_id: usuario.id, tipo: "SOBREGASTO_RUBRO" as const, proyecto_id: proyecto.id, gasto_id: gasto.id }
      await tx.notificacion.create({ data })
      await tx.notificacion.create({ data })
    })
    expect((error as { code?: string }).code).toBe("P2002")
  })

  it("allows many task notifications (NULL gasto_id) of the same tipo", async () => {
    const total = await runAndRollback(async (tx) => {
      const { usuario } = await fixture(tx)
      await tx.notificacion.create({ data: { usuario_id: usuario.id, tipo: "TAREA_VENCIDA" } })
      await tx.notificacion.create({ data: { usuario_id: usuario.id, tipo: "TAREA_VENCIDA" } })
      return tx.notificacion.count({ where: { usuario_id: usuario.id, tipo: "TAREA_VENCIDA" } })
    })
    expect(total).toBe(2)
  })

  it("runs the SQL the overspend validation uses to lock the budget line and sum validated expenses", async () => {
    const result = await runAndRollback(async (tx) => {
      const { linea, gasto, usuario } = await fixture(tx)
      await tx.gasto.update({
        where: { id: gasto.id },
        data: {
          estado: "VALIDADO",
          validado_por_id: `${usuario.id}-otro`,
          validado_at: new Date(),
        },
      })
      const lock = await tx.$queryRaw<{ monto: string }[]>`
        SELECT "monto_proyectado_cop"::text AS "monto" FROM "lineas_presupuestales" WHERE "id" = ${linea.id} FOR UPDATE`
      const sum = await tx.$queryRaw<{ total: string }[]>`
        SELECT COALESCE(SUM("monto_cop"), 0)::text AS "total" FROM "gastos" WHERE "linea_id" = ${linea.id} AND "estado" = 'VALIDADO'`
      return { lock, sum }
    })
    expect(result.lock).toEqual([{ monto: "1000.00" }])
    expect(result.sum).toEqual([{ total: "100.00" }])
  })
})
