// Live-DB coverage for the T14 distributed invoice (`gastos_reparto`): one distribution row per
// activity+rubro, the sum of a gasto's rows equal to its total, the legacy `gastos.linea_id` kept
// whenever the invoice has a single row, and the composite foreign keys that keep every row inside
// its project. Prisma cannot express the CHECK or the cascade, so a mocked client would prove
// nothing. Every path rolls back.
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

const MARKER = "t14-reparto"

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
    data: { codigo: `PRY-T14-R-${suffix}`, nombre: `${MARKER}-${suffix}`, cliente_id: cliente.id },
  })
  const otro = await tx.proyecto.create({
    data: { codigo: `PRY-T14-R2-${suffix}`, nombre: `${MARKER}-otro-${suffix}`, cliente_id: cliente.id },
  })
  const rubro = await tx.rubro.create({ data: { codigo: `T14-${suffix.slice(0, 8)}`, nombre: `${MARKER}-rubro` } })
  // T12: a NORMAL activity always hangs from an objective (actividades_tipo_objetivo_check).
  const objetivo = await tx.objetivo.create({
    data: { proyecto_id: proyecto.id, codigo: "1", descripcion: "Objetivo 1", orden: 1 },
  })
  // T11: the same rubro can be budgeted in two activities (one line each).
  const actividad1 = await tx.actividad.create({
    data: {
      proyecto_id: proyecto.id,
      objetivo_id: objetivo.id,
      codigo: "1.2",
      nombre: "Actividad 1.2",
      semana_inicio: 1,
      semana_fin: 4,
    },
  })
  const actividad2 = await tx.actividad.create({
    data: {
      proyecto_id: proyecto.id,
      objetivo_id: objetivo.id,
      codigo: "1.3",
      nombre: "Actividad 1.3",
      semana_inicio: 5,
      semana_fin: 8,
    },
  })
  const linea1 = await tx.lineaPresupuestal.create({
    data: {
      proyecto_id: proyecto.id,
      rubro_id: rubro.id,
      actividad_id: actividad1.id,
      monto_proyectado_cop: 10_000_000,
    },
  })
  const linea2 = await tx.lineaPresupuestal.create({
    data: {
      proyecto_id: proyecto.id,
      rubro_id: rubro.id,
      actividad_id: actividad2.id,
      monto_proyectado_cop: 10_000_000,
    },
  })
  const lineaOtro = await tx.lineaPresupuestal.create({
    data: { proyecto_id: otro.id, rubro_id: rubro.id, monto_proyectado_cop: 1_000_000 },
  })
  const datos = {
    proyecto_id: proyecto.id,
    linea_id: linea1.id,
    fecha_documento: new Date("2026-10-15"),
    periodo: "2026-10",
    tipo_soporte: "FACTURA_PROVEEDOR" as const,
    tercero_nombre: "Proveedor SAS",
    tercero_tipo_id: "NIT" as const,
    tercero_numero_id: "900.123.456-7",
    tercero_id_norm: "900123456",
    numero_documento: "FE-1000",
    numero_documento_norm: "FE1000",
    descripcion: "Factura distribuida",
    subtotal_cop: 100,
    iva_cop: 0,
    monto_cop: 100,
    registrado_por_id: usuario.id,
  }
  return { usuario, proyecto, otro, rubro, objetivo, actividad1, actividad2, linea1, linea2, lineaOtro, datos }
}

/**
 * Cross-row rules of the distributed invoice, in one round trip per rule. They are audits: they
 * must always return zero violations for the whole table, including the rows the fixture inserts.
 */
async function violaciones(tx: Tx) {
  const [sinReparto] = await tx.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT count(*)::int AS n FROM gastos g
      WHERE NOT EXISTS (SELECT 1 FROM gastos_reparto r WHERE r.gasto_id = g.id)`,
  )
  const [sumaNoCuadra] = await tx.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT count(*)::int AS n FROM gastos g
      WHERE g.monto_cop <> COALESCE((SELECT sum(r.valor) FROM gastos_reparto r WHERE r.gasto_id = g.id), 0)`,
  )
  const [lineaHuerfana] = await tx.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT count(*)::int AS n FROM gastos g
       JOIN gastos_reparto r ON r.gasto_id = g.id
      WHERE (SELECT count(*) FROM gastos_reparto r2 WHERE r2.gasto_id = g.id) = 1
        AND r.linea_id <> g.linea_id`,
  )
  const [fueraDelProyecto] = await tx.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT count(*)::int AS n FROM gastos_reparto r
       JOIN gastos g ON g.id = r.gasto_id
       JOIN lineas_presupuestales l ON l.id = r.linea_id
      WHERE r.proyecto_id <> g.proyecto_id OR l.proyecto_id <> g.proyecto_id`,
  )
  const [huerfanas] = await tx.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT count(*)::int AS n FROM gastos_reparto r
      WHERE NOT EXISTS (SELECT 1 FROM gastos g WHERE g.id = r.gasto_id)
         OR NOT EXISTS (SELECT 1 FROM lineas_presupuestales l WHERE l.id = r.linea_id)`,
  )
  return {
    sinReparto: sinReparto.n,
    sumaNoCuadra: sumaNoCuadra.n,
    lineaHuerfana: lineaHuerfana.n,
    fueraDelProyecto: fueraDelProyecto.n,
    huerfanas: huerfanas.n,
  }
}

describe("GastoReparto invariants (live DB)", () => {
  it("splits one factura across two activities (S9: 350.000 + 650.000 = 1.000.000)", async () => {
    const result = await runAndRollback(async (tx) => {
      const { datos, linea1, linea2 } = await fixture(tx)
      const gasto = await tx.gasto.create({
        data: { ...datos, subtotal_cop: 1_000_000, iva_cop: 0, monto_cop: 1_000_000 },
      })
      const primera = await tx.gastoReparto.create({
        data: { proyecto_id: gasto.proyecto_id, gasto_id: gasto.id, linea_id: linea1.id, valor: 350_000 },
      })
      const segunda = await tx.gastoReparto.create({
        data: { proyecto_id: gasto.proyecto_id, gasto_id: gasto.id, linea_id: linea2.id, valor: 650_000 },
      })
      const [cuadra] = await tx.$queryRawUnsafe<Array<{ ok: boolean }>>(
        `SELECT g.monto_cop = (SELECT sum(r.valor) FROM gastos_reparto r WHERE r.gasto_id = g.id) AS ok
           FROM gastos g WHERE g.id = $1`,
        gasto.id,
      )
      return {
        valores: [primera.valor.toString(), segunda.valor.toString()],
        filas: await tx.gastoReparto.count({ where: { gasto_id: gasto.id } }),
        cuadra: cuadra.ok,
      }
    })
    expect(result.filas).toBe(2)
    expect(result.valores).toEqual(["350000", "650000"])
    expect(result.cuadra).toBe(true)
  })

  it("gives every gasto at least one distribution row", async () => {
    const result = await runAndRollback(async (tx) => {
      const { datos } = await fixture(tx)
      const gasto = await tx.gasto.create({ data: datos })
      await tx.gastoReparto.create({
        data: { proyecto_id: gasto.proyecto_id, gasto_id: gasto.id, linea_id: gasto.linea_id, valor: gasto.monto_cop },
      })
      return violaciones(tx)
    })
    expect(result.sinReparto).toBe(0)
  })

  it("keeps the sum of a gasto's distribution rows equal to its monto_cop", async () => {
    const result = await runAndRollback(async (tx) => {
      const { datos, linea2 } = await fixture(tx)
      const gasto = await tx.gasto.create({
        data: { ...datos, subtotal_cop: 1_000_000, iva_cop: 190_000, monto_cop: 1_190_000 },
      })
      await tx.gastoReparto.create({
        data: { proyecto_id: gasto.proyecto_id, gasto_id: gasto.id, linea_id: gasto.linea_id, valor: 1_090_000 },
      })
      await tx.gastoReparto.create({
        data: { proyecto_id: gasto.proyecto_id, gasto_id: gasto.id, linea_id: linea2.id, valor: 100_000 },
      })
      return violaciones(tx)
    })
    expect(result.sumaNoCuadra).toBe(0)
  })

  it("keeps Gasto.linea_id on a single-row invoice, so the legacy readers still resolve the line", async () => {
    const result = await runAndRollback(async (tx) => {
      const { datos, linea1 } = await fixture(tx)
      const gasto = await tx.gasto.create({ data: datos })
      const fila = await tx.gastoReparto.create({
        data: { proyecto_id: gasto.proyecto_id, gasto_id: gasto.id, linea_id: linea1.id, valor: gasto.monto_cop },
      })
      return { gastoLinea: gasto.linea_id, filaLinea: fila.linea_id, ...(await violaciones(tx)) }
    })
    expect(result.filaLinea).toBe(result.gastoLinea)
    expect(result.lineaHuerfana).toBe(0)
  })

  it("rejects a distribution row whose line or invoice belongs to another project", async () => {
    const lineaAjena = await captureError(async (tx) => {
      const { datos, lineaOtro } = await fixture(tx)
      const gasto = await tx.gasto.create({ data: datos })
      await tx.gastoReparto.create({
        data: { proyecto_id: gasto.proyecto_id, gasto_id: gasto.id, linea_id: lineaOtro.id, valor: 100 },
      })
    })
    expect((lineaAjena as Prisma.PrismaClientKnownRequestError).code).toBe("P2003")

    const gastoAjeno = await captureError(async (tx) => {
      const { datos, otro, lineaOtro } = await fixture(tx)
      const gasto = await tx.gasto.create({ data: datos })
      await tx.gastoReparto.create({
        data: { proyecto_id: otro.id, gasto_id: gasto.id, linea_id: lineaOtro.id, valor: 100 },
      })
    })
    expect((gastoAjeno as Prisma.PrismaClientKnownRequestError).code).toBe("P2003")
  })

  it("rejects a non-positive distribution value (gastos_reparto_valor_positivo_ck)", async () => {
    const error = await captureError(async (tx) => {
      const { datos } = await fixture(tx)
      const gasto = await tx.gasto.create({ data: datos })
      await tx.gastoReparto.create({
        data: { proyecto_id: gasto.proyecto_id, gasto_id: gasto.id, linea_id: gasto.linea_id, valor: 0 },
      })
    })
    expect(driverMessage(error)).toContain("gastos_reparto_valor_positivo_ck")
  })

  it("deletes the distribution rows with their gasto and never leaves an orphan", async () => {
    const result = await runAndRollback(async (tx) => {
      const { datos, linea2 } = await fixture(tx)
      const gasto = await tx.gasto.create({ data: datos })
      await tx.gastoReparto.create({
        data: { proyecto_id: gasto.proyecto_id, gasto_id: gasto.id, linea_id: gasto.linea_id, valor: 50 },
      })
      await tx.gastoReparto.create({
        data: { proyecto_id: gasto.proyecto_id, gasto_id: gasto.id, linea_id: linea2.id, valor: 50 },
      })
      await tx.gasto.delete({ where: { id: gasto.id } })
      const quedan = await tx.gastoReparto.count({ where: { gasto_id: gasto.id } })
      return { quedan, ...(await violaciones(tx)) }
    })
    expect(result.quedan).toBe(0)
    expect(result.huerfanas).toBe(0)
  })
})
