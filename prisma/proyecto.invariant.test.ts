// Live-DB coverage for the S2.1 `Proyecto` aggregate invariants:
//   - DP-05: at most ONE principal strategic line per project, enforced by the
//     partial unique index `proyecto_lineas_principal_uq` (something Prisma
//     cannot express in schema.prisma).
//   - 1:1 with a GANADA opportunity: `proyectos_oportunidad_id_key` rejects a
//     second project for the same `oportunidad_id`.
//   - Several projects may share one cliente, so `cliente_id` is NOT unique.
//   - The join tables can never point at a project that does not exist.
//
// The API answers 409 from these indexes, so a mocked Prisma client would prove
// nothing; this file hits the LOCAL Docker database and forces a rollback on
// every path.
//
// `./require-local-db` must stay the FIRST import — it loads `.env.local` and
// refuses any non-loopback target before the Prisma client is built.
import "./require-local-db"

import { randomUUID } from "node:crypto"

import { Prisma } from "@prisma/client"
import { describe, expect, it } from "vitest"

import { db } from "@/lib/db"

const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 }

/** Thrown to force a rollback even when the body succeeded. */
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

/** Runs `fn` and returns the error it threw, then rolls the transaction back. */
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

const MARKER = "sdd-invariant-proyecto"

/**
 * Prisma 7 + `@prisma/adapter-pg` shape: the violated columns live in
 * `meta.driverAdapterError.cause.constraint.fields`.
 */
function uniqueViolationFields(error: Prisma.PrismaClientKnownRequestError): string[] | undefined {
  const meta = error.meta as
    | { driverAdapterError?: { cause?: { constraint?: { fields?: string[] } } } }
    | undefined
  return meta?.driverAdapterError?.cause?.constraint?.fields
}

function originalMessage(error: Prisma.PrismaClientKnownRequestError): string {
  const meta = error.meta as
    | { driverAdapterError?: { cause?: { originalMessage?: string } } }
    | undefined
  return meta?.driverAdapterError?.cause?.originalMessage ?? ""
}

/**
 * Every id is a fresh UUID and every code is MARKER-prefixed, so nothing this
 * suite creates can collide with a value `prisma/seed.ts` already owns.
 */
async function fixture(tx: Tx) {
  const suffix = randomUUID()
  const usuario = await tx.usuario.create({
    data: { email: `${MARKER}-${suffix}@example.test`, nombre: MARKER },
  })
  const cliente = await tx.cliente.create({
    data: { nombre: `${MARKER}-cliente-${suffix}`, tipo_cliente: "OTRO", responsable_id: usuario.id },
  })
  const oportunidad = await tx.oportunidad.create({
    data: { cliente_id: cliente.id, nombre: `${MARKER}-oportunidad-${suffix}` },
  })
  return { suffix, usuario, cliente, oportunidad }
}

function proyectoData(suffix: string, clienteId: string, extra: Record<string, unknown> = {}) {
  return {
    codigo: `PRY-SDD-${suffix}`,
    nombre: `${MARKER}-proyecto-${suffix}`,
    cliente_id: clienteId,
    ...extra,
  }
}

describe("Proyecto invariants (live DB)", () => {
  it("allows two projects for the same cliente_id", async () => {
    const total = await runAndRollback(async (tx) => {
      const { suffix, cliente } = await fixture(tx)
      await tx.proyecto.create({ data: proyectoData(`${suffix}-a`, cliente.id) })
      await tx.proyecto.create({ data: proyectoData(`${suffix}-b`, cliente.id) })
      return tx.proyecto.count({ where: { cliente_id: cliente.id } })
    })

    expect(total).toBe(2)
  })

  it("the database rejects a second project for the same oportunidad_id", async () => {
    const error = await captureError(async (tx) => {
      const { suffix, cliente, oportunidad } = await fixture(tx)
      await tx.proyecto.create({
        data: proyectoData(`${suffix}-a`, cliente.id, { oportunidad_id: oportunidad.id }),
      })
      await tx.proyecto.create({
        data: proyectoData(`${suffix}-b`, cliente.id, { oportunidad_id: oportunidad.id }),
      })
    })

    expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError)
    const known = error as Prisma.PrismaClientKnownRequestError
    expect(known.code).toBe("P2002")
    expect(uniqueViolationFields(known)).toEqual(["oportunidad_id"])
    expect(originalMessage(known)).toContain("proyectos_oportunidad_id_key")
  })

  it("allows several projects with a NULL oportunidad_id (INDEPENDIENTE)", async () => {
    const total = await runAndRollback(async (tx) => {
      const { suffix, cliente } = await fixture(tx)
      await tx.proyecto.create({
        data: proyectoData(`${suffix}-a`, cliente.id, { oportunidad_id: null }),
      })
      await tx.proyecto.create({
        data: proyectoData(`${suffix}-b`, cliente.id, { oportunidad_id: null }),
      })
      return tx.proyecto.count({ where: { cliente_id: cliente.id, oportunidad_id: null } })
    })

    expect(total).toBe(2)
  })

  it("rejects a second principal line for the same project through proyecto_lineas_principal_uq", async () => {
    await expect(
      db.$transaction(async (tx) => {
        const { suffix, cliente } = await fixture(tx)
        const proyecto = await tx.proyecto.create({
          data: proyectoData(suffix, cliente.id),
        })
        const lineaA = await tx.lineaEstrategicaCatalogo.create({
          data: { codigo: `LE-SDD-${suffix}-a`, nombre: `${MARKER}-linea-a` },
        })
        const lineaB = await tx.lineaEstrategicaCatalogo.create({
          data: { codigo: `LE-SDD-${suffix}-b`, nombre: `${MARKER}-linea-b` },
        })

        // Raw SQL so the failing index is named directly: the partial index is
        // invisible to Prisma's schema, so the constraint name IS the contract.
        await tx.$executeRaw`INSERT INTO proyecto_lineas (proyecto_id, linea_id, principal)
          VALUES (${proyecto.id}, ${lineaA.id}, true)`
        await tx.$executeRaw`INSERT INTO proyecto_lineas (proyecto_id, linea_id, principal)
          VALUES (${proyecto.id}, ${lineaB.id}, true)`
      }, TX_OPTIONS),
    ).rejects.toThrow(/proyecto_lineas_principal_uq/)
  })

  it("allows many non-principal lines on the same project", async () => {
    const rows = await runAndRollback(async (tx) => {
      const { suffix, cliente } = await fixture(tx)
      const proyecto = await tx.proyecto.create({ data: proyectoData(suffix, cliente.id) })
      const lineaA = await tx.lineaEstrategicaCatalogo.create({
        data: { codigo: `LE-SDD-${suffix}-a`, nombre: `${MARKER}-linea-a` },
      })
      const lineaB = await tx.lineaEstrategicaCatalogo.create({
        data: { codigo: `LE-SDD-${suffix}-b`, nombre: `${MARKER}-linea-b` },
      })
      await tx.proyectoLinea.create({
        data: { proyecto_id: proyecto.id, linea_id: lineaA.id, principal: false },
      })
      await tx.proyectoLinea.create({
        data: { proyecto_id: proyecto.id, linea_id: lineaB.id, principal: false },
      })
      return tx.proyectoLinea.count({ where: { proyecto_id: proyecto.id, principal: false } })
    })

    expect(rows).toBe(2)
  })

  it("rejects ProyectoLinea rows that reference a non-existent project", async () => {
    const error = await captureError(async (tx) => {
      const { suffix } = await fixture(tx)
      const linea = await tx.lineaEstrategicaCatalogo.create({
        data: { codigo: `LE-SDD-${suffix}-fk`, nombre: `${MARKER}-linea-fk` },
      })
      await tx.proyectoLinea.create({
        data: { proyecto_id: randomUUID(), linea_id: linea.id, principal: false },
      })
    })

    expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError)
    const known = error as Prisma.PrismaClientKnownRequestError
    expect(known.code).toBe("P2003")
    expect(originalMessage(known)).toContain("proyecto_lineas_proyecto_id_fkey")
  })

  it("rejects ProyectoMunicipio rows that reference a non-existent project", async () => {
    const error = await captureError(async (tx) => {
      const { suffix } = await fixture(tx)
      const municipio = await tx.municipio.create({
        data: { nombre: `${MARKER}-municipio-${suffix}`, departamento: "Antioquia" },
      })
      await tx.proyectoMunicipio.create({
        data: { proyecto_id: randomUUID(), municipio_id: municipio.id },
      })
    })

    expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError)
    const known = error as Prisma.PrismaClientKnownRequestError
    expect(known.code).toBe("P2003")
    expect(originalMessage(known)).toContain("proyecto_municipios_proyecto_id_fkey")
  })
})
