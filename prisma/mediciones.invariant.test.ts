// Live-DB coverage for the S4 measurements and beneficiaries tables: value and
// quantity CHECKs, the void CHECK and the composite same-project foreign keys
// (including soportes_proyecto.medicion_id). Prisma cannot express them and the
// API answers 400/409 from them. Every path rolls back.
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

const MARKER = "sdd-invariant-mediciones"

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
    data: { codigo: `PRY-SDD-M-${suffix}`, nombre: `${MARKER}-${suffix}`, cliente_id: cliente.id },
  })
  const otro = await tx.proyecto.create({
    data: { codigo: `PRY-SDD-M2-${suffix}`, nombre: `${MARKER}-otro-${suffix}`, cliente_id: cliente.id },
  })
  const crear = async (proyectoId: string) => {
    const objetivo = await tx.objetivo.create({ data: { proyecto_id: proyectoId, codigo: "OE1", descripcion: "a" } })
    const actividad = await tx.actividad.create({
      data: { proyecto_id: proyectoId, objetivo_id: objetivo.id, codigo: "1.1", nombre: "A", semana_inicio: 1, semana_fin: 1 },
    })
    const indicador = await tx.indicador.create({
      data: { proyecto_id: proyectoId, objetivo_id: objetivo.id, codigo: "IND-01", nombre: "I", meta: 10, unidad: "u" },
    })
    return { actividad, indicador }
  }
  const base = await crear(proyecto.id)
  const ajeno = await crear(otro.id)
  return { usuario, proyecto, otro, base, ajeno }
}

describe("MedicionIndicador invariants (live DB)", () => {
  const datos = (f: Awaited<ReturnType<typeof fixture>>) => ({
    proyecto_id: f.proyecto.id,
    indicador_id: f.base.indicador.id,
    fecha: new Date("2026-10-06"),
    valor: 3,
    registrado_por_id: f.usuario.id,
  })

  it("rejects a negative valor (mediciones_indicador_valor_check) and accepts zero", async () => {
    const error = await captureError(async (tx) => {
      const f = await fixture(tx)
      await tx.medicionIndicador.create({ data: { ...datos(f), valor: -1 } })
    })
    expect(driverMessage(error)).toContain("mediciones_indicador_valor_check")
    const row = await runAndRollback(async (tx) => {
      const f = await fixture(tx)
      return tx.medicionIndicador.create({ data: { ...datos(f), valor: 0 } })
    })
    expect(row.valor.toString()).toBe("0")
  })

  it("requires anulado_at and motivo_anulacion together (mediciones_indicador_anulacion_check)", async () => {
    for (const partial of [{ anulado_at: new Date() }, { motivo_anulacion: "x" }]) {
      const error = await captureError(async (tx) => {
        const f = await fixture(tx)
        await tx.medicionIndicador.create({ data: { ...datos(f), ...partial } })
      })
      expect(driverMessage(error)).toContain("mediciones_indicador_anulacion_check")
    }
  })

  it("makes a cross-project indicator impossible (composite foreign key)", async () => {
    const error = await captureError(async (tx) => {
      const f = await fixture(tx)
      await tx.medicionIndicador.create({ data: { ...datos(f), indicador_id: f.ajeno.indicador.id } })
    })
    expect((error as Prisma.PrismaClientKnownRequestError).code).toBe("P2003")
  })

  it("lets a medio hang from a measurement of the same project only", async () => {
    const ok = await runAndRollback(async (tx) => {
      const f = await fixture(tx)
      const medicion = await tx.medicionIndicador.create({ data: datos(f) })
      return tx.soporteProyecto.create({
        data: {
          proyecto_id: f.proyecto.id,
          medicion_id: medicion.id,
          nombre: "x",
          url_externa: "https://example.com/x",
          subido_por_id: f.usuario.id,
        },
      })
    })
    expect(ok.medicion_id).not.toBeNull()

    const error = await captureError(async (tx) => {
      const f = await fixture(tx)
      const ajena = await tx.medicionIndicador.create({
        data: { ...datos(f), proyecto_id: f.otro.id, indicador_id: f.ajeno.indicador.id },
      })
      await tx.soporteProyecto.create({
        data: {
          proyecto_id: f.proyecto.id,
          medicion_id: ajena.id,
          nombre: "x",
          url_externa: "https://example.com/x",
          subido_por_id: f.usuario.id,
        },
      })
    })
    expect((error as Prisma.PrismaClientKnownRequestError).code).toBe("P2003")
  })
})

describe("RegistroBeneficiario invariants (live DB)", () => {
  const datos = (f: Awaited<ReturnType<typeof fixture>>) => ({
    proyecto_id: f.proyecto.id,
    fecha: new Date("2026-10-06"),
    cantidad: 5,
    registrado_por_id: f.usuario.id,
  })

  it("rejects a non-positive cantidad (registros_beneficiarios_cantidad_check)", async () => {
    for (const cantidad of [0, -3]) {
      const error = await captureError(async (tx) => {
        const f = await fixture(tx)
        await tx.registroBeneficiario.create({ data: { ...datos(f), cantidad } })
      })
      expect(driverMessage(error)).toContain("registros_beneficiarios_cantidad_check")
    }
  })

  it("requires anulado_at and motivo_anulacion together (registros_beneficiarios_anulacion_check)", async () => {
    for (const partial of [{ anulado_at: new Date() }, { motivo_anulacion: "x" }]) {
      const error = await captureError(async (tx) => {
        const f = await fixture(tx)
        await tx.registroBeneficiario.create({ data: { ...datos(f), ...partial } })
      })
      expect(driverMessage(error)).toContain("registros_beneficiarios_anulacion_check")
    }
  })

  it("accepts a registro without actividad and one with an activity of the same project", async () => {
    const rows = await runAndRollback(async (tx) => {
      const f = await fixture(tx)
      const sin = await tx.registroBeneficiario.create({ data: datos(f) })
      const con = await tx.registroBeneficiario.create({ data: { ...datos(f), actividad_id: f.base.actividad.id } })
      return [sin, con]
    })
    expect(rows[0].actividad_id).toBeNull()
    expect(rows[1].actividad_id).not.toBeNull()
  })

  it("makes a cross-project actividad impossible (composite foreign key)", async () => {
    const error = await captureError(async (tx) => {
      const f = await fixture(tx)
      await tx.registroBeneficiario.create({ data: { ...datos(f), actividad_id: f.ajeno.actividad.id } })
    })
    expect((error as Prisma.PrismaClientKnownRequestError).code).toBe("P2003")
  })
})
