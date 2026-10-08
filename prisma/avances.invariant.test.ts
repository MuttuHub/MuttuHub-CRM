// Live-DB coverage for the S4 avances table (`avances_entregable`): the quantity
// and void CHECKs and the composite same-project foreign key to the deliverable.
// Prisma cannot express them and the API answers 400/409 from them, so a mocked
// client would prove nothing. Every path rolls back.
//
// `./require-local-db` must stay the FIRST import.
import "./require-local-db"

import { randomUUID } from "node:crypto"

import { Prisma } from "@prisma/client"
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

const MARKER = "sdd-invariant-avances"

function driverMessage(error: unknown): string {
  const meta = (error as { meta?: { driverAdapterError?: { cause?: { originalMessage?: string } } } }).meta
  return meta?.driverAdapterError?.cause?.originalMessage ?? String(error)
}

async function fixture(tx: Tx) {
  const suffix = randomUUID()
  const usuario = await tx.usuario.create({
    data: { email: `${MARKER}-${suffix}@example.test`, nombre: MARKER },
  })
  const cliente = await tx.cliente.create({
    data: { nombre: `${MARKER}-cliente-${suffix}`, tipo_cliente: "OTRO", responsable_id: usuario.id },
  })
  const proyecto = await tx.proyecto.create({
    data: { codigo: `PRY-SDD-A-${suffix}`, nombre: `${MARKER}-${suffix}`, cliente_id: cliente.id },
  })
  const otro = await tx.proyecto.create({
    data: { codigo: `PRY-SDD-A2-${suffix}`, nombre: `${MARKER}-otro-${suffix}`, cliente_id: cliente.id },
  })
  const crear = async (proyectoId: string) => {
    const objetivo = await tx.objetivo.create({ data: { proyecto_id: proyectoId, codigo: "OE1", descripcion: "a" } })
    const actividad = await tx.actividad.create({
      data: { proyecto_id: proyectoId, objetivo_id: objetivo.id, codigo: "1.1", nombre: "A", semana_inicio: 1, semana_fin: 1, peso: 1 },
    })
    return tx.entregable.create({
      data: {
        proyecto_id: proyectoId,
        actividad_id: actividad.id,
        codigo: "1.1-E1",
        descripcion: "d",
        cantidad_meta: 10,
        unidad: "u",
        tipo_medio_exigido: "Acta",
      },
    })
  }
  const entregable = await crear(proyecto.id)
  const entregableOtro = await crear(otro.id)
  const datos = {
    proyecto_id: proyecto.id,
    entregable_id: entregable.id,
    fecha: new Date("2026-10-06"),
    cantidad: 1,
    registrado_por_id: usuario.id,
  }
  return { usuario, proyecto, entregable, entregableOtro, datos }
}

describe("AvanceEntregable invariants (live DB)", () => {
  it("rejects a non-positive cantidad through avances_entregable_cantidad_check", async () => {
    for (const cantidad of [0, -1]) {
      const error = await captureError(async (tx) => {
        const { datos } = await fixture(tx)
        await tx.avanceEntregable.create({ data: { ...datos, cantidad } })
      })
      expect(driverMessage(error)).toContain("avances_entregable_cantidad_check")
    }
  })

  it("requires anulado_at and motivo_anulacion together (avances_entregable_anulacion_check)", async () => {
    for (const partial of [{ anulado_at: new Date() }, { motivo_anulacion: "x" }]) {
      const error = await captureError(async (tx) => {
        const { datos } = await fixture(tx)
        await tx.avanceEntregable.create({ data: { ...datos, ...partial } })
      })
      expect(driverMessage(error)).toContain("avances_entregable_anulacion_check")
    }
  })

  it("accepts a void pair and keeps the row", async () => {
    const row = await runAndRollback(async (tx) => {
      const { datos, usuario } = await fixture(tx)
      return tx.avanceEntregable.create({
        data: { ...datos, anulado_at: new Date(), anulado_por_id: usuario.id, motivo_anulacion: "Error de digitación" },
      })
    })
    expect(row.motivo_anulacion).toBe("Error de digitación")
  })

  it("makes a cross-project deliverable impossible (composite foreign key)", async () => {
    const error = await captureError(async (tx) => {
      const { datos, entregableOtro } = await fixture(tx)
      await tx.avanceEntregable.create({ data: { ...datos, entregable_id: entregableOtro.id } })
    })
    expect((error as Prisma.PrismaClientKnownRequestError).code).toBe("P2003")
  })

  it("stores Decimal(15,2) quantities", async () => {
    const row = await runAndRollback(async (tx) => {
      const { datos } = await fixture(tx)
      return tx.avanceEntregable.create({ data: { ...datos, cantidad: 2.5 } })
    })
    expect(row.cantidad.toString()).toBe("2.5")
  })

  it("takes a row lock on the deliverable with the SQL the progress route runs", async () => {
    const rows = await runAndRollback(async (tx) => {
      const { entregable } = await fixture(tx)
      return tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "entregables" WHERE "id" = ${entregable.id} FOR UPDATE`
    })
    expect(rows).toHaveLength(1)
  })
})

describe("SoporteProyecto invariants (live DB)", () => {
  async function soporteFixture(tx: Tx) {
    const base = await fixture(tx)
    const avance = await tx.avanceEntregable.create({ data: base.datos })
    const otroAvance = await tx.avanceEntregable.create({
      data: { ...base.datos, proyecto_id: base.entregableOtro.proyecto_id, entregable_id: base.entregableOtro.id },
    })
    const datos = {
      proyecto_id: base.proyecto.id,
      avance_id: avance.id,
      nombre: "acta.pdf",
      storage_path: `proyectos/${base.proyecto.id}/soportes/${randomUUID()}_acta.pdf`,
      tipo_mime: "application/pdf",
      tamano_bytes: 1024,
      subido_por_id: base.usuario.id,
    }
    return { ...base, avance, otroAvance, datos }
  }

  it("requires exactly one parent (soportes_proyecto_padre_check)", async () => {
    for (const parent of [{ avance_id: null }, { medicion_id: randomUUID() }]) {
      const error = await captureError(async (tx) => {
        const { datos } = await soporteFixture(tx)
        await tx.soporteProyecto.create({ data: { ...datos, ...parent } })
      })
      expect(driverMessage(error)).toContain("soportes_proyecto_padre_check")
    }
  })

  it("requires exactly one source: file or external link (soportes_proyecto_fuente_check)", async () => {
    for (const source of [
      { storage_path: null },
      { url_externa: "https://example.com/x" },
    ]) {
      const error = await captureError(async (tx) => {
        const { datos } = await soporteFixture(tx)
        await tx.soporteProyecto.create({ data: { ...datos, ...source } })
      })
      expect(driverMessage(error)).toContain("soportes_proyecto_fuente_check")
    }
  })

  it("accepts a link-only medio", async () => {
    const row = await runAndRollback(async (tx) => {
      const { datos } = await soporteFixture(tx)
      return tx.soporteProyecto.create({
        data: { ...datos, storage_path: null, tipo_mime: null, tamano_bytes: null, url_externa: "https://example.com/x" },
      })
    })
    expect(row.url_externa).toBe("https://example.com/x")
  })

  it("makes a cross-project avance impossible (composite foreign key)", async () => {
    const error = await captureError(async (tx) => {
      const { datos, otroAvance } = await soporteFixture(tx)
      await tx.soporteProyecto.create({ data: { ...datos, avance_id: otroAvance.id } })
    })
    expect((error as Prisma.PrismaClientKnownRequestError).code).toBe("P2003")
  })

  it("never links the same stored object twice (storage_path unique)", async () => {
    const error = await captureError(async (tx) => {
      const { datos } = await soporteFixture(tx)
      await tx.soporteProyecto.create({ data: datos })
      await tx.soporteProyecto.create({ data: { ...datos, nombre: "otro.pdf" } })
    })
    expect((error as Prisma.PrismaClientKnownRequestError).code).toBe("P2002")
  })

  it("rejects a non-positive tamano_bytes (soportes_proyecto_tamano_check)", async () => {
    const error = await captureError(async (tx) => {
      const { datos } = await soporteFixture(tx)
      await tx.soporteProyecto.create({ data: { ...datos, tamano_bytes: 0 } })
    })
    expect(driverMessage(error)).toContain("soportes_proyecto_tamano_check")
  })
})
