// Live-DB coverage for the S8 version tables (`versiones_proyecto`, `solicitudes_modificacion`):
// the immutability triggers and the CHECKs Prisma cannot express. Every path rolls back.
//
// `./require-local-db` must stay the FIRST import.
import "./require-local-db"

import { randomUUID } from "node:crypto"

import { describe, expect, it } from "vitest"

import { db } from "@/lib/db"

const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 }

class IntentionalRollback extends Error {}

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0]

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

const MARKER = "sdd-invariant-versiones"

function driverMessage(error: unknown): string {
  const meta = (error as { meta?: { driverAdapterError?: { cause?: { originalMessage?: string } } } }).meta
  return meta?.driverAdapterError?.cause?.originalMessage ?? String(error)
}

async function fixture(tx: Tx) {
  const suffix = randomUUID()
  const usuario = await tx.usuario.create({ data: { email: `${MARKER}-${suffix}@example.test`, nombre: MARKER } })
  const cliente = await tx.cliente.create({
    data: { nombre: `${MARKER}-cliente-${suffix}`, tipo_cliente: "OTRO", responsable_id: usuario.id },
  })
  const proyecto = await tx.proyecto.create({
    data: { codigo: `PRY-SDD-V-${suffix}`, nombre: `${MARKER}-${suffix}`, cliente_id: cliente.id },
  })
  return { usuario, proyecto }
}

async function solicitud(tx: Tx, proyectoId: string, usuarioId: string) {
  return tx.solicitudModificacion.create({
    data: {
      proyecto_id: proyectoId,
      tipo: "TRASLADO",
      motivo: "motivo",
      detalle: [],
      version_base_numero: 0,
      solicitado_por_id: usuarioId,
    },
  })
}

async function baseline(tx: Tx, proyectoId: string, usuarioId: string) {
  return tx.versionProyecto.create({
    data: { proyecto_id: proyectoId, numero: 0, tipo: "LINEA_BASE", aprobado_por_id: usuarioId, snapshot: { schema: 1 } },
  })
}

describe("versiones_proyecto", () => {
  it("rejects UPDATE", async () => {
    const error = await captureError(async (tx) => {
      const { usuario, proyecto } = await fixture(tx)
      const v = await baseline(tx, proyecto.id, usuario.id)
      await tx.versionProyecto.update({ where: { id: v.id }, data: { snapshot: { schema: 2 } } })
    })
    expect(driverMessage(error)).toContain("versiones_proyecto es inmutable")
  })

  it("rejects DELETE", async () => {
    const error = await captureError(async (tx) => {
      const { usuario, proyecto } = await fixture(tx)
      const v = await baseline(tx, proyecto.id, usuario.id)
      await tx.versionProyecto.delete({ where: { id: v.id } })
    })
    expect(driverMessage(error)).toContain("versiones_proyecto es inmutable")
  })

  it("rejects TRUNCATE", async () => {
    const error = await captureError(async (tx) => {
      await tx.$executeRawUnsafe('TRUNCATE TABLE "versiones_proyecto"')
    })
    expect(driverMessage(error)).toContain("versiones_proyecto es inmutable")
  })

  it("rejects numero 0 with tipo MODIFICACION", async () => {
    const error = await captureError(async (tx) => {
      const { usuario, proyecto } = await fixture(tx)
      const s = await solicitud(tx, proyecto.id, usuario.id)
      await tx.versionProyecto.create({
        data: {
          proyecto_id: proyecto.id,
          numero: 0,
          tipo: "MODIFICACION",
          solicitud_id: s.id,
          aprobado_por_id: usuario.id,
          snapshot: {},
        },
      })
    })
    expect(driverMessage(error)).toContain("versiones_proyecto_tipo_numero_ck")
  })

  it("rejects a LINEA_BASE with a numero other than 0", async () => {
    const error = await captureError(async (tx) => {
      const { usuario, proyecto } = await fixture(tx)
      await tx.versionProyecto.create({
        data: { proyecto_id: proyecto.id, numero: 1, tipo: "LINEA_BASE", aprobado_por_id: usuario.id, snapshot: {} },
      })
    })
    expect(driverMessage(error)).toContain("versiones_proyecto_tipo_numero_ck")
  })

  it("requires solicitud_id for a MODIFICACION", async () => {
    const error = await captureError(async (tx) => {
      const { usuario, proyecto } = await fixture(tx)
      await tx.versionProyecto.create({
        data: { proyecto_id: proyecto.id, numero: 1, tipo: "MODIFICACION", aprobado_por_id: usuario.id, snapshot: {} },
      })
    })
    expect(driverMessage(error)).toContain("versiones_proyecto_solicitud_ck")
  })

  it("rejects a LINEA_BASE that carries a solicitud_id", async () => {
    const error = await captureError(async (tx) => {
      const { usuario, proyecto } = await fixture(tx)
      const s = await solicitud(tx, proyecto.id, usuario.id)
      await tx.versionProyecto.create({
        data: {
          proyecto_id: proyecto.id,
          numero: 0,
          tipo: "LINEA_BASE",
          solicitud_id: s.id,
          aprobado_por_id: usuario.id,
          snapshot: {},
        },
      })
    })
    expect(driverMessage(error)).toContain("versiones_proyecto_solicitud_ck")
  })

  it("keeps (proyecto_id, numero) unique", async () => {
    const error = await captureError(async (tx) => {
      const { usuario, proyecto } = await fixture(tx)
      await baseline(tx, proyecto.id, usuario.id)
      await baseline(tx, proyecto.id, usuario.id)
    })
    expect((error as { code?: string }).code).toBe("P2002")
  })

  it("accepts a baseline and a linked modification", async () => {
    const error = await captureError(async (tx) => {
      const { usuario, proyecto } = await fixture(tx)
      await baseline(tx, proyecto.id, usuario.id)
      const s = await solicitud(tx, proyecto.id, usuario.id)
      await tx.versionProyecto.create({
        data: {
          proyecto_id: proyecto.id,
          numero: 1,
          tipo: "MODIFICACION",
          solicitud_id: s.id,
          aprobado_por_id: usuario.id,
          snapshot: {},
        },
      })
    })
    expect(error).toBeUndefined()
  })
})

describe("solicitudes_modificacion", () => {
  it("rejects RECHAZADA without comentario_decision", async () => {
    const error = await captureError(async (tx) => {
      const { usuario, proyecto } = await fixture(tx)
      const s = await solicitud(tx, proyecto.id, usuario.id)
      await tx.solicitudModificacion.update({
        where: { id: s.id },
        data: { estado: "RECHAZADA", decidido_por_id: usuario.id, decidido_at: new Date(), comentario_decision: "  " },
      })
    })
    expect(driverMessage(error)).toContain("solicitudes_modificacion_rechazo_comentario_ck")
  })

  it("rejects a decided request without decidido_por_id", async () => {
    const error = await captureError(async (tx) => {
      const { usuario, proyecto } = await fixture(tx)
      const s = await solicitud(tx, proyecto.id, usuario.id)
      await tx.solicitudModificacion.update({
        where: { id: s.id },
        data: { estado: "APROBADA", decidido_at: new Date() },
      })
    })
    expect(driverMessage(error)).toContain("solicitudes_modificacion_decision_ck")
  })

  it("rejects a negative version_base_numero", async () => {
    const error = await captureError(async (tx) => {
      const { usuario, proyecto } = await fixture(tx)
      await tx.solicitudModificacion.create({
        data: {
          proyecto_id: proyecto.id,
          tipo: "TRASLADO",
          motivo: "m",
          detalle: [],
          version_base_numero: -1,
          solicitado_por_id: usuario.id,
        },
      })
    })
    expect(driverMessage(error)).toContain("solicitudes_modificacion_version_base_ck")
  })

  it("rejects a detalle that is not a JSON array", async () => {
    const error = await captureError(async (tx) => {
      const { usuario, proyecto } = await fixture(tx)
      await tx.solicitudModificacion.create({
        data: {
          proyecto_id: proyecto.id,
          tipo: "TRASLADO",
          motivo: "m",
          detalle: { not: "an array" },
          version_base_numero: 0,
          solicitado_por_id: usuario.id,
        },
      })
    })
    expect(driverMessage(error)).toContain("solicitudes_modificacion_detalle_ck")
  })

  it("accepts an approved request with its decider", async () => {
    const error = await captureError(async (tx) => {
      const { usuario, proyecto } = await fixture(tx)
      const s = await solicitud(tx, proyecto.id, usuario.id)
      await tx.solicitudModificacion.update({
        where: { id: s.id },
        data: { estado: "APROBADA", decidido_por_id: usuario.id, decidido_at: new Date() },
      })
    })
    expect(error).toBeUndefined()
  })
})
