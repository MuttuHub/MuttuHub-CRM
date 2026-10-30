// Live-DB coverage for the AJ-01 `reportes_actividad` table (activity-level progress
// reports) and the `soportes_proyecto.reporte_actividad_id` fourth parent: the `porcentaje`
// range CHECK and the extended "at most one parent" CHECK on `soportes_proyecto`. Prisma
// cannot express either CHECK, so a mocked client would prove nothing. Every path rolls back.
//
// `./require-local-db` must stay the FIRST import — it loads `.env.local` and refuses any
// non-loopback target before the Prisma client is built. Mirrors the exact boilerplate of
// `prisma/avances.invariant.test.ts` / `prisma/gastos.invariant.test.ts`: there is no graceful
// "skip if the DB is unreachable" in those files either — `require-local-db` only asserts the
// configured URL resolves to loopback; if no Postgres is actually listening there, the first
// `db.$transaction` call below fails with a connection error, same as the files it mirrors.
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

const MARKER = "sdd-invariant-reportes-actividad"

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
    data: { codigo: `PRY-SDD-RA-${suffix}`, nombre: `${MARKER}-${suffix}`, cliente_id: cliente.id },
  })
  const objetivo = await tx.objetivo.create({
    data: { proyecto_id: proyecto.id, codigo: "OE1", descripcion: "a" },
  })
  const actividad = await tx.actividad.create({
    data: {
      proyecto_id: proyecto.id,
      objetivo_id: objetivo.id,
      codigo: "1.1",
      nombre: "A",
      semana_inicio: 1,
      semana_fin: 1,
      peso: 1,
    },
  })
  const datos = {
    proyecto_id: proyecto.id,
    actividad_id: actividad.id,
    fecha: new Date("2026-10-06"),
    porcentaje: 30,
    observacion: "Se ejecutó la primera fase.",
    registrado_por_id: usuario.id,
  }
  return { usuario, proyecto, objetivo, actividad, datos }
}

describe("ReporteActividad invariants (live DB)", () => {
  it("rejects a porcentaje outside (0, 100] via reportes_actividad_porcentaje_check", async () => {
    for (const porcentaje of [0, -1, 100.01, 150]) {
      const error = await captureError(async (tx) => {
        const { datos } = await fixture(tx)
        await tx.reporteActividad.create({ data: { ...datos, porcentaje } })
      })
      expect(driverMessage(error)).toContain("reportes_actividad_porcentaje_check")
    }
  })

  it("accepts the boundary porcentaje values 0.01 and 100", async () => {
    for (const porcentaje of [0.01, 100]) {
      const row = await runAndRollback(async (tx) => {
        const { datos } = await fixture(tx)
        return tx.reporteActividad.create({ data: { ...datos, porcentaje } })
      })
      expect(Number(row.porcentaje)).toBe(porcentaje)
    }
  })

  it("rejects an empty observacion (NOT NULL, required unlike AvanceEntregable's)", async () => {
    const error = await captureError(async (tx) => {
      const { datos } = await fixture(tx)
      // @ts-expect-error — observacion is required; this proves the DB rejects a missing value.
      await tx.reporteActividad.create({ data: { ...datos, observacion: undefined } })
    })
    expect(error).toBeDefined()
  })

  it("makes a cross-project actividad impossible (composite foreign key)", async () => {
    const error = await captureError(async (tx) => {
      const { datos, proyecto } = await fixture(tx)
      const otroProyecto = await tx.proyecto.create({
        data: { codigo: `PRY-SDD-RA-otro-${randomUUID()}`, nombre: `${MARKER}-otro`, cliente_id: (
          await tx.cliente.create({ data: { nombre: `${MARKER}-cliente-otro`, tipo_cliente: "OTRO", responsable_id: datos.registrado_por_id } })
        ).id },
      })
      const objetivoOtro = await tx.objetivo.create({
        data: { proyecto_id: otroProyecto.id, codigo: "OE1", descripcion: "a" },
      })
      const actividadOtro = await tx.actividad.create({
        data: {
          proyecto_id: otroProyecto.id,
          objetivo_id: objetivoOtro.id,
          codigo: "1.1",
          nombre: "A",
          semana_inicio: 1,
          semana_fin: 1,
          peso: 1,
        },
      })
      void proyecto
      await tx.reporteActividad.create({ data: { ...datos, actividad_id: actividadOtro.id } })
    })
    expect(error).toBeDefined()
  })

  it("accepts a void pair (anulado_at + motivo_anulacion) and keeps the row", async () => {
    const row = await runAndRollback(async (tx) => {
      const { datos, usuario } = await fixture(tx)
      return tx.reporteActividad.create({
        data: { ...datos, anulado_at: new Date(), anulado_por_id: usuario.id, motivo_anulacion: "Error de digitación" },
      })
    })
    expect(row.motivo_anulacion).toBe("Error de digitación")
  })
})

describe("SoporteProyecto four-parent invariant (live DB)", () => {
  async function soporteFixture(tx: Tx) {
    const base = await fixture(tx)
    const reporte = await tx.reporteActividad.create({ data: base.datos })
    const datos = {
      proyecto_id: base.proyecto.id,
      nombre: "reporte.pdf",
      storage_path: `proyectos/${base.proyecto.id}/soportes/${randomUUID()}_reporte.pdf`,
      tipo_mime: "application/pdf",
      tamano_bytes: 1024,
      subido_por_id: base.usuario.id,
    }
    return { ...base, reporte, datos }
  }

  it("accepts a soporte with exactly reporte_actividad_id set", async () => {
    const row = await runAndRollback(async (tx) => {
      const { datos, reporte } = await soporteFixture(tx)
      return tx.soporteProyecto.create({ data: { ...datos, reporte_actividad_id: reporte.id } })
    })
    expect(row.reporte_actividad_id).not.toBeNull()
    expect(row.avance_id).toBeNull()
    expect(row.medicion_id).toBeNull()
    expect(row.gasto_id).toBeNull()
  })

  it("accepts a soporte with zero parents set: a project-origin document", async () => {
    const row = await runAndRollback(async (tx) => {
      const { datos } = await soporteFixture(tx)
      return tx.soporteProyecto.create({ data: datos })
    })
    expect(row.avance_id).toBeNull()
    expect(row.medicion_id).toBeNull()
    expect(row.gasto_id).toBeNull()
    expect(row.reporte_actividad_id).toBeNull()
  })

  it("rejects a soporte with reporte_actividad_id and another parent (soportes_proyecto_padre_check)", async () => {
    const error = await captureError(async (tx) => {
      const { datos, reporte } = await soporteFixture(tx)
      await tx.soporteProyecto.create({
        data: { ...datos, reporte_actividad_id: reporte.id, medicion_id: randomUUID() },
      })
    })
    expect(driverMessage(error)).toContain("soportes_proyecto_padre_check")
  })

  it("makes a cross-project reporte_actividad_id impossible (composite foreign key)", async () => {
    const error = await captureError(async (tx) => {
      const { datos, proyecto } = await soporteFixture(tx)
      const otroProyecto = await tx.proyecto.create({
        data: { codigo: `PRY-SDD-RA-otro2-${randomUUID()}`, nombre: `${MARKER}-otro2`, cliente_id: (
          await tx.cliente.create({ data: { nombre: `${MARKER}-cliente-otro2`, tipo_cliente: "OTRO", responsable_id: datos.subido_por_id } })
        ).id },
      })
      const objetivoOtro = await tx.objetivo.create({
        data: { proyecto_id: otroProyecto.id, codigo: "OE1", descripcion: "a" },
      })
      const actividadOtro = await tx.actividad.create({
        data: {
          proyecto_id: otroProyecto.id,
          objetivo_id: objetivoOtro.id,
          codigo: "1.1",
          nombre: "A",
          semana_inicio: 1,
          semana_fin: 1,
          peso: 1,
        },
      })
      const reporteOtro = await tx.reporteActividad.create({
        data: {
          proyecto_id: otroProyecto.id,
          actividad_id: actividadOtro.id,
          fecha: new Date("2026-10-06"),
          porcentaje: 30,
          observacion: "x",
          registrado_por_id: datos.subido_por_id,
        },
      })
      void proyecto
      await tx.soporteProyecto.create({ data: { ...datos, reporte_actividad_id: reporteOtro.id } })
    })
    expect(error).toBeDefined()
  })
})
