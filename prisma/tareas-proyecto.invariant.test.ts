// Live-DB coverage for V2 (odd/tasks/producto-pendientes-2026-11.md, S2): `tareas.proyecto_id`.
// The migration adds a plain FK to `proyectos` and a composite FK
// (proyecto_id, oportunidad_id) -> proyectos(id, oportunidad_id), so a task carrying both links can
// only point at its opportunity's project. It also backfills the tasks of opportunities already
// converted; the backfill test runs the migration's own UPDATE statement on fresh rows. Every path
// rolls back.
//
// `./require-local-db` must stay the FIRST import.
import "./require-local-db"

import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { Prisma } from "@prisma/client"
import { describe, expect, it } from "vitest"

import { db } from "@/lib/db"

const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 }
const MARKER = "v2-invariant-tarea-proyecto"
const MIGRATION = join(__dirname, "migrations", "20261119130000_v2_tarea_proyecto", "migration.sql")

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

/** Runs `fn`, returns the error it threw (a failed statement poisons the tx) and rolls back. */
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

function driverMessage(error: unknown): string {
  const meta = (error as { meta?: { driverAdapterError?: { cause?: { originalMessage?: string } } } }).meta
  return meta?.driverAdapterError?.cause?.originalMessage ?? String(error)
}

/** The backfill statement exactly as the migration ships it. */
function backfillSql(): string {
  const sql = readFileSync(MIGRATION, "utf8")
  const match = sql.match(/UPDATE "tareas"[\s\S]*?;/)
  if (!match) throw new Error("backfill UPDATE not found in the V2 migration")
  return match[0]
}

async function fixture(tx: Tx) {
  const suffix = randomUUID()
  const usuario = await tx.usuario.create({ data: { email: `${MARKER}-${suffix}@example.test`, nombre: MARKER } })
  const cliente = await tx.cliente.create({
    data: { nombre: `${MARKER}-${suffix}`, tipo_cliente: "EMPRESA_PRIVADA", responsable_id: usuario.id },
  })
  const ganada = await tx.oportunidad.create({
    data: { cliente_id: cliente.id, nombre: `${MARKER}-a`, estado: "GANADA", fase: "EJECUCION" },
  })
  const otra = await tx.oportunidad.create({
    data: { cliente_id: cliente.id, nombre: `${MARKER}-b`, estado: "GANADA", fase: "EJECUCION" },
  })
  const proyecto = await tx.proyecto.create({
    data: { codigo: `PRY-V2-A-${suffix}`, nombre: MARKER, cliente_id: cliente.id, oportunidad_id: ganada.id },
  })
  const otroProyecto = await tx.proyecto.create({
    data: { codigo: `PRY-V2-B-${suffix}`, nombre: MARKER, cliente_id: cliente.id, oportunidad_id: otra.id },
  })
  const independiente = await tx.proyecto.create({
    data: { codigo: `PRY-V2-I-${suffix}`, nombre: MARKER, cliente_id: cliente.id },
  })
  const tarea = (data: Partial<Prisma.TareaUncheckedCreateInput> = {}) =>
    tx.tarea.create({ data: { titulo: MARKER, responsable_id: usuario.id, cliente_id: cliente.id, ...data } })
  return { usuario, cliente, ganada, otra, proyecto, otroProyecto, independiente, tarea }
}

describe("V2 tareas.proyecto_id (live DB)", () => {
  it("accepts a task linked to its opportunity's project, or to a project alone", async () => {
    const result = await runAndRollback(async (tx) => {
      const f = await fixture(tx)
      const both = await f.tarea({ oportunidad_id: f.ganada.id, proyecto_id: f.proyecto.id })
      const projectOnly = await f.tarea({ proyecto_id: f.independiente.id })
      return { both: both.proyecto_id === f.proyecto.id, projectOnly: projectOnly.proyecto_id === f.independiente.id }
    })
    expect(result).toEqual({ both: true, projectOnly: true })
  })

  it("rejects a task whose project belongs to another opportunity", async () => {
    const error = await captureError(async (tx) => {
      const f = await fixture(tx)
      await f.tarea({ oportunidad_id: f.ganada.id, proyecto_id: f.otroProyecto.id })
    })
    expect(driverMessage(error)).toContain("tareas_proyecto_id_oportunidad_id_fkey")
  })

  it("rejects a task with an opportunity linked to an INDEPENDIENTE project", async () => {
    const error = await captureError(async (tx) => {
      const f = await fixture(tx)
      await f.tarea({ oportunidad_id: f.ganada.id, proyecto_id: f.independiente.id })
    })
    expect(driverMessage(error)).toContain("tareas_proyecto_id_oportunidad_id_fkey")
  })

  it("rejects moving a linked task to another opportunity while it keeps the project", async () => {
    const error = await captureError(async (tx) => {
      const f = await fixture(tx)
      const t = await f.tarea({ oportunidad_id: f.ganada.id, proyecto_id: f.proyecto.id })
      await tx.tarea.update({ where: { id: t.id }, data: { oportunidad_id: f.otra.id } })
    })
    expect(driverMessage(error)).toContain("tareas_proyecto_id_oportunidad_id_fkey")
  })

  it("rejects a project id that does not exist", async () => {
    const error = await captureError(async (tx) => {
      const f = await fixture(tx)
      await f.tarea({ proyecto_id: randomUUID() })
    })
    expect(driverMessage(error)).toContain("tareas_proyecto_id_fkey")
  })

  it("backfills open and completed tasks of converted opportunities, and nothing else", async () => {
    const result = await runAndRollback(async (tx) => {
      const f = await fixture(tx)
      const deletedProjectOpp = await tx.oportunidad.create({
        data: { cliente_id: f.cliente.id, nombre: `${MARKER}-c`, estado: "GANADA", fase: "EJECUCION" },
      })
      await tx.proyecto.create({
        data: {
          codigo: `PRY-V2-D-${randomUUID()}`,
          nombre: MARKER,
          cliente_id: f.cliente.id,
          oportunidad_id: deletedProjectOpp.id,
          deleted_at: new Date(),
        },
      })
      const libre = await tx.oportunidad.create({
        data: { cliente_id: f.cliente.id, nombre: `${MARKER}-libre`, estado: "GANADA" },
      })
      const rows = {
        open: await f.tarea({ oportunidad_id: f.ganada.id, estado: "EN_CURSO" }),
        completed: await f.tarea({ oportunidad_id: f.ganada.id, estado: "COMPLETADA" }),
        cancelled: await f.tarea({ oportunidad_id: f.ganada.id, estado: "CANCELADA" }),
        deleted: await f.tarea({ oportunidad_id: f.ganada.id, deleted_at: new Date() }),
        otherOpp: await f.tarea({ oportunidad_id: f.otra.id }),
        deletedProject: await f.tarea({ oportunidad_id: deletedProjectOpp.id }),
        unconverted: await f.tarea({ oportunidad_id: libre.id }),
        noOpp: await f.tarea(),
        alreadyLinked: await f.tarea({ proyecto_id: f.independiente.id }),
      }
      await tx.$executeRawUnsafe(backfillSql())
      const after = await tx.tarea.findMany({
        where: { id: { in: Object.values(rows).map((r) => r.id) } },
        select: { id: true, proyecto_id: true },
      })
      const byId = new Map(after.map((r) => [r.id, r.proyecto_id]))
      const name = (id: string | null) =>
        id === f.proyecto.id ? "proyecto" : id === f.otroProyecto.id ? "otroProyecto" : id === f.independiente.id ? "independiente" : id
      return Object.fromEntries(Object.entries(rows).map(([k, r]) => [k, name(byId.get(r.id) ?? null)]))
    })
    expect(result).toEqual({
      open: "proyecto",
      completed: "proyecto",
      cancelled: null,
      deleted: null,
      otherOpp: "otroProyecto",
      deletedProject: null,
      unconverted: null,
      noOpp: null,
      alreadyLinked: "independiente",
    })
  })
})
