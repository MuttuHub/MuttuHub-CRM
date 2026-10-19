// Live-DB coverage for the two uniqueness guarantees the S1.3 municipios
// catalog rests on (REQ-CAT-04): `(nombre, departamento)` together and
// `codigo_dane` unique only WHEN PRESENT. The API answers 409 from these
// indexes, so a mocked Prisma client would prove nothing; this file hits the
// LOCAL Docker database and forces a rollback on every path.
//
// `./require-local-db` must stay the FIRST import — it loads `.env.local` and
// refuses any non-loopback target before the Prisma client is built.
import "./require-local-db"

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

const MARKER = "sdd-invariant-municipios"

/**
 * Prisma 7 + `@prisma/adapter-pg` shape: the violated columns live in
 * `meta.driverAdapterError.cause.constraint.fields`. Narrowing it here (rather
 * than casting to `any`) keeps the assertion honest about what it observed.
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

describe("municipios uniqueness invariants (live DB)", () => {
  it("accepts INSERT into municipios", async () => {
    const created = await runAndRollback(async (tx) => {
      const row = await tx.municipio.create({
        data: {
          nombre: MARKER,
          departamento: "Antioquia",
          // Must NOT be a `codigo_dane` used by `MUNICIPIOS_DEMO` in
          // prisma/seed.ts: this suite runs against the same local database the
          // demo seed populates, so reusing a real demo code (05001 = Medellín)
          // makes the whole suite red on a migrated + seeded database even
          // though the rollback is correct. The 990xx range is synthetic.
          codigo_dane: "99001",
          orden: 99,
        },
      })
      expect(row.id).toBeTruthy()
      return row.nombre
    })

    expect(created).toBe(MARKER)
  })

  it("the database rejects a duplicate (nombre, departamento) pair", async () => {
    await expect(
      db.$transaction(async (tx) => {
        await tx.$executeRaw`INSERT INTO municipios (id, nombre, departamento, updated_at)
          VALUES (${`${MARKER}-pair-1`}, ${MARKER}, 'Antioquia', CURRENT_TIMESTAMP)`
        await tx.$executeRaw`INSERT INTO municipios (id, nombre, departamento, updated_at)
          VALUES (${`${MARKER}-pair-2`}, ${MARKER}, 'Antioquia', CURRENT_TIMESTAMP)`
      }, TX_OPTIONS),
    ).rejects.toThrow(/municipios_nombre_departamento_key/)
  })

  it("the database rejects a duplicate codigo_dane when present", async () => {
    await expect(
      db.$transaction(async (tx) => {
        await tx.$executeRaw`INSERT INTO municipios (id, nombre, departamento, codigo_dane, updated_at)
          VALUES (${`${MARKER}-dane-1`}, ${MARKER}, 'Antioquia', '99001', CURRENT_TIMESTAMP)`
        await tx.$executeRaw`INSERT INTO municipios (id, nombre, departamento, codigo_dane, updated_at)
          VALUES (${`${MARKER}-dane-2`}, ${MARKER}, 'Cundinamarca', '99001', CURRENT_TIMESTAMP)`
      }, TX_OPTIONS),
    ).rejects.toThrow(/municipios_codigo_dane_key/)
  })

  it("allows the same nombre in a different departamento", async () => {
    const names = await runAndRollback(async (tx) => {
      await tx.municipio.create({
        data: { nombre: `${MARKER}-unión`, departamento: "Antioquia" },
      })
      await tx.municipio.create({
        data: { nombre: `${MARKER}-unión`, departamento: "Valle del Cauca" },
      })
      const rows = await tx.municipio.findMany({
        where: { nombre: `${MARKER}-unión` },
        select: { departamento: true },
      })
      return rows.map((row) => row.departamento).sort()
    })

    expect(names).toEqual(["Antioquia", "Valle del Cauca"])
  })

  it("allows several municipios without codigo_dane (NULLs repeat)", async () => {
    const total = await runAndRollback(async (tx) => {
      await tx.municipio.create({
        data: { nombre: `${MARKER}-sin-código-a`, departamento: "Caldas", codigo_dane: null },
      })
      await tx.municipio.create({
        data: { nombre: `${MARKER}-sin-código-b`, departamento: "Caldas", codigo_dane: null },
      })
      return tx.municipio.count({ where: { codigo_dane: null, nombre: { startsWith: MARKER } } })
    })

    expect(total).toBe(2)
  })

  it("surfaces the (nombre, departamento) index in the P2002 error the API turns into 409", async () => {
    const error = await captureError(async (tx) => {
      await tx.municipio.create({
        data: { nombre: `${MARKER}-p2002-pair`, departamento: "Antioquia", codigo_dane: "99002" },
      })
      await tx.municipio.create({
        data: { nombre: `${MARKER}-p2002-pair`, departamento: "Antioquia", codigo_dane: "99003" },
      })
    })

    expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError)
    const known = error as Prisma.PrismaClientKnownRequestError
    expect(known.code).toBe("P2002")
    // Prisma 7 with the pg driver adapter reports the offending columns in
    // `meta.driverAdapterError.cause.constraint.fields`, not in `meta.target`.
    // These two asserts are what tie the API's 409 to the real index.
    expect(uniqueViolationFields(known)).toEqual(["nombre", "departamento"])
    expect(originalMessage(known)).toContain("municipios_nombre_departamento_key")
  })

  it("surfaces the codigo_dane index in the P2002 error the API turns into 409", async () => {
    const error = await captureError(async (tx) => {
      await tx.municipio.create({
        data: { nombre: `${MARKER}-p2002-dane-a`, departamento: "Antioquia", codigo_dane: "99004" },
      })
      await tx.municipio.create({
        data: { nombre: `${MARKER}-p2002-dane-b`, departamento: "Cundinamarca", codigo_dane: "99004" },
      })
    })

    expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError)
    const known = error as Prisma.PrismaClientKnownRequestError
    expect(known.code).toBe("P2002")
    expect(uniqueViolationFields(known)).toEqual(["codigo_dane"])
    expect(originalMessage(known)).toContain("municipios_codigo_dane_key")
  })
})
