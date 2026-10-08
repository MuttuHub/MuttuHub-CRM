// Live-DB coverage for the S5 budget tables (`lineas_presupuestales`,
// `programacion_periodo`): CHECKs, the unique (proyecto, rubro) pair, the
// composite same-project foreign key and the RESTRICT on rubros. Prisma cannot
// express the CHECKs and the API answers from them, so a mocked client would
// prove nothing. Every path rolls back.
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

const MARKER = "sdd-invariant-presupuesto"

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
    data: { codigo: `PRY-SDD-P-${suffix}`, nombre: `${MARKER}-${suffix}`, cliente_id: cliente.id },
  })
  const otro = await tx.proyecto.create({
    data: { codigo: `PRY-SDD-P2-${suffix}`, nombre: `${MARKER}-otro-${suffix}`, cliente_id: cliente.id },
  })
  const rubro = await tx.rubro.create({ data: { codigo: `T-${suffix.slice(0, 8)}`, nombre: `${MARKER}-rubro` } })
  const linea = await tx.lineaPresupuestal.create({
    data: { proyecto_id: proyecto.id, rubro_id: rubro.id, monto_proyectado_cop: 1000 },
  })
  const lineaOtro = await tx.lineaPresupuestal.create({
    data: { proyecto_id: otro.id, rubro_id: rubro.id, monto_proyectado_cop: 1000 },
  })
  return { proyecto, otro, rubro, linea, lineaOtro }
}

describe("LineaPresupuestal invariants (live DB)", () => {
  it("rejects a negative amount through lineas_monto_no_negativo_ck", async () => {
    const error = await captureError(async (tx) => {
      const { proyecto } = await fixture(tx)
      const rubro = await tx.rubro.create({ data: { codigo: `N-${randomUUID().slice(0, 8)}`, nombre: MARKER } })
      await tx.lineaPresupuestal.create({
        data: { proyecto_id: proyecto.id, rubro_id: rubro.id, monto_proyectado_cop: -1 },
      })
    })
    expect(driverMessage(error)).toContain("lineas_monto_no_negativo_ck")
  })

  it("accepts a zero amount (the 'off' state)", async () => {
    const row = await runAndRollback(async (tx) => {
      const { proyecto } = await fixture(tx)
      const rubro = await tx.rubro.create({ data: { codigo: `Z-${randomUUID().slice(0, 8)}`, nombre: MARKER } })
      return tx.lineaPresupuestal.create({
        data: { proyecto_id: proyecto.id, rubro_id: rubro.id, monto_proyectado_cop: 0 },
      })
    })
    expect(row.monto_proyectado_cop.toString()).toBe("0")
  })

  it("rejects a duplicate (proyecto, rubro)", async () => {
    const error = await captureError(async (tx) => {
      const { proyecto, rubro } = await fixture(tx)
      await tx.lineaPresupuestal.create({
        data: { proyecto_id: proyecto.id, rubro_id: rubro.id, monto_proyectado_cop: 5 },
      })
    })
    expect((error as Prisma.PrismaClientKnownRequestError).code).toBe("P2002")
  })

  it("RESTRICTs deleting a rubro that has a line", async () => {
    const error = await captureError(async (tx) => {
      const { rubro } = await fixture(tx)
      await tx.rubro.delete({ where: { id: rubro.id } })
    })
    expect((error as Prisma.PrismaClientKnownRequestError).code).toBe("P2003")
  })
})

describe("ProgramacionPeriodo invariants (live DB)", () => {
  const celda = (proyecto_id: string, linea_id: string, extra: Partial<{ periodo: string; valor: number }> = {}) => ({
    proyecto_id,
    linea_id,
    periodo: "2026-10",
    valor: 10,
    ...extra,
  })

  it("rejects a malformed periodo through programacion_periodo_ck", async () => {
    for (const periodo of ["2026-13", "2026-00", "26-10", "2026-1", "2026/10"]) {
      const error = await captureError(async (tx) => {
        const { proyecto, linea } = await fixture(tx)
        await tx.programacionPeriodo.create({ data: celda(proyecto.id, linea.id, { periodo }) })
      })
      expect(driverMessage(error)).toContain("programacion_periodo_ck")
    }
  })

  it("rejects a negative valor through programacion_valor_no_negativo_ck", async () => {
    const error = await captureError(async (tx) => {
      const { proyecto, linea } = await fixture(tx)
      await tx.programacionPeriodo.create({ data: celda(proyecto.id, linea.id, { valor: -1 }) })
    })
    expect(driverMessage(error)).toContain("programacion_valor_no_negativo_ck")
  })

  it("makes a cross-project line impossible (composite foreign key)", async () => {
    const error = await captureError(async (tx) => {
      const { proyecto, lineaOtro } = await fixture(tx)
      await tx.programacionPeriodo.create({ data: celda(proyecto.id, lineaOtro.id) })
    })
    expect((error as Prisma.PrismaClientKnownRequestError).code).toBe("P2003")
  })

  it("rejects a second cell for the same (linea, periodo)", async () => {
    const error = await captureError(async (tx) => {
      const { proyecto, linea } = await fixture(tx)
      await tx.programacionPeriodo.create({ data: celda(proyecto.id, linea.id) })
      await tx.programacionPeriodo.create({ data: celda(proyecto.id, linea.id) })
    })
    expect((error as Prisma.PrismaClientKnownRequestError).code).toBe("P2002")
  })

  it("stores Decimal(15,2) values", async () => {
    const row = await runAndRollback(async (tx) => {
      const { proyecto, linea } = await fixture(tx)
      return tx.programacionPeriodo.create({ data: celda(proyecto.id, linea.id, { valor: 14875000.5 }) })
    })
    expect(row.valor.toString()).toBe("14875000.5")
  })
})
