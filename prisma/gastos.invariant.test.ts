// Live-DB coverage for the S6 expense tables (`gastos`, `acceso_soportes`) and the
// `soportes_proyecto.gasto_id` parent: CHECKs, composite same-project foreign keys
// and the append-only access log. Prisma cannot express the CHECKs or the triggers,
// so a mocked client would prove nothing. Every path rolls back.
//
// `./require-local-db` must stay the FIRST import.
import "./require-local-db"

import { randomUUID } from "node:crypto"

import { Prisma } from "@prisma/client"
import { describe, expect, it } from "vitest"

import { db } from "@/lib/db"
import { loadGastosValidados } from "@/lib/api/financiera"
import { toCents } from "@/lib/proyectos/money"

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

const MARKER = "sdd-invariant-gastos"

function driverMessage(error: unknown): string {
  const meta = (error as { meta?: { driverAdapterError?: { cause?: { originalMessage?: string } } } }).meta
  return meta?.driverAdapterError?.cause?.originalMessage ?? String(error)
}

async function fixture(tx: Tx) {
  const suffix = randomUUID()
  const usuario = await tx.usuario.create({ data: { email: `${MARKER}-${suffix}@example.test`, nombre: MARKER } })
  const validador = await tx.usuario.create({ data: { email: `${MARKER}-v-${suffix}@example.test`, nombre: MARKER } })
  const cliente = await tx.cliente.create({
    data: { nombre: `${MARKER}-cliente-${suffix}`, tipo_cliente: "OTRO", responsable_id: usuario.id },
  })
  const proyecto = await tx.proyecto.create({
    data: { codigo: `PRY-SDD-G-${suffix}`, nombre: `${MARKER}-${suffix}`, cliente_id: cliente.id },
  })
  const otro = await tx.proyecto.create({
    data: { codigo: `PRY-SDD-G2-${suffix}`, nombre: `${MARKER}-otro-${suffix}`, cliente_id: cliente.id },
  })
  const rubro = await tx.rubro.create({ data: { codigo: `G-${suffix.slice(0, 8)}`, nombre: `${MARKER}-rubro` } })
  const linea = await tx.lineaPresupuestal.create({
    data: { proyecto_id: proyecto.id, rubro_id: rubro.id, monto_proyectado_cop: 1000 },
  })
  const lineaOtro = await tx.lineaPresupuestal.create({
    data: { proyecto_id: otro.id, rubro_id: rubro.id, monto_proyectado_cop: 1000 },
  })
  const datos = {
    proyecto_id: proyecto.id,
    linea_id: linea.id,
    fecha_documento: new Date("2026-10-15"),
    periodo: "2026-10",
    tipo_soporte: "FACTURA_PROVEEDOR" as const,
    tercero_nombre: "Proveedor SAS",
    tercero_tipo_id: "NIT" as const,
    tercero_numero_id: "900.123.456-7",
    tercero_id_norm: "900123456",
    numero_documento: "FE-0123",
    numero_documento_norm: "FE0123",
    descripcion: "Tiquetes",
    subtotal_cop: 100,
    iva_cop: 0,
    monto_cop: 100,
    registrado_por_id: usuario.id,
  }
  return { usuario, validador, proyecto, otro, rubro, linea, lineaOtro, datos }
}

describe("Gasto invariants (live DB)", () => {
  it("accepts a REGISTRADO expense with the default estado and flag", async () => {
    const row = await runAndRollback(async (tx) => {
      const { datos } = await fixture(tx)
      return tx.gasto.create({ data: datos })
    })
    expect(row.estado).toBe("REGISTRADO")
    expect(row.alerta_sobregasto).toBe(false)
  })

  it("rejects a non-positive amount (gastos_monto_positivo_ck)", async () => {
    const error = await captureError(async (tx) => {
      const { datos } = await fixture(tx)
      await tx.gasto.create({ data: { ...datos, subtotal_cop: 0, monto_cop: 0 } })
    })
    expect(driverMessage(error)).toContain("gastos_monto_positivo_ck")
  })

  // AJ-04: monto_cop is the Total and the database enforces Subtotal + IVA = Total.
  it("accepts Subtotal 1.000.000 + IVA 190.000 = Total 1.190.000 and IVA 0", async () => {
    const rows = await runAndRollback(async (tx) => {
      const { datos } = await fixture(tx)
      const conIva = await tx.gasto.create({
        data: { ...datos, subtotal_cop: 1_000_000, iva_cop: 190_000, monto_cop: 1_190_000 },
      })
      const sinIva = await tx.gasto.create({ data: { ...datos, subtotal_cop: 250, iva_cop: 0, monto_cop: 250 } })
      return { conIva, sinIva }
    })
    expect(rows.conIva.monto_cop.toString()).toBe("1190000")
    expect(rows.sinIva.iva_cop.toString()).toBe("0")
  })

  it("rejects a Total that is not Subtotal + IVA (gastos_total_cuadra_ck)", async () => {
    const error = await captureError(async (tx) => {
      const { datos } = await fixture(tx)
      await tx.gasto.create({ data: { ...datos, subtotal_cop: 500_000, iva_cop: 95_000, monto_cop: 600_000 } })
    })
    expect(driverMessage(error)).toContain("gastos_total_cuadra_ck")
  })

  it("rejects a negative IVA (gastos_iva_no_negativo_ck)", async () => {
    const error = await captureError(async (tx) => {
      const { datos } = await fixture(tx)
      await tx.gasto.create({ data: { ...datos, subtotal_cop: 110, iva_cop: -10, monto_cop: 100 } })
    })
    expect(driverMessage(error)).toContain("gastos_iva_no_negativo_ck")
  })

  it("rejects a non-positive Subtotal (gastos_subtotal_positivo_ck)", async () => {
    const error = await captureError(async (tx) => {
      const { datos } = await fixture(tx)
      await tx.gasto.create({ data: { ...datos, subtotal_cop: 0, iva_cop: 100, monto_cop: 100 } })
    })
    expect(driverMessage(error)).toContain("gastos_subtotal_positivo_ck")
  })

  it("rejects a malformed periodo (gastos_periodo_ck)", async () => {
    for (const periodo of ["2026-13", "26-10", "2026/10"]) {
      const error = await captureError(async (tx) => {
        const { datos } = await fixture(tx)
        await tx.gasto.create({ data: { ...datos, periodo } })
      })
      expect(driverMessage(error)).toContain("gastos_periodo_ck")
    }
  })

  it("rejects a validator equal to the registrant (gastos_validador_ck)", async () => {
    const error = await captureError(async (tx) => {
      const { datos, usuario } = await fixture(tx)
      await tx.gasto.create({
        data: { ...datos, estado: "VALIDADO", validado_por_id: usuario.id, validado_at: new Date() },
      })
    })
    expect(driverMessage(error)).toContain("gastos_validador_ck")
  })

  it("accepts a VALIDADO expense validated by someone else", async () => {
    const row = await runAndRollback(async (tx) => {
      const { datos, validador } = await fixture(tx)
      return tx.gasto.create({
        data: { ...datos, estado: "VALIDADO", validado_por_id: validador.id, validado_at: new Date() },
      })
    })
    expect(row.estado).toBe("VALIDADO")
  })

  it("rejects VALIDADO without the third-party identification (gastos_validado_ck)", async () => {
    for (const missing of [{ tercero_tipo_id: null }, { tercero_numero_id: null }]) {
      const error = await captureError(async (tx) => {
        const { datos, validador } = await fixture(tx)
        await tx.gasto.create({
          data: { ...datos, ...missing, estado: "VALIDADO", validado_por_id: validador.id, validado_at: new Date() },
        })
      })
      expect(driverMessage(error)).toContain("gastos_validado_ck")
    }
  })

  it("rejects RECHAZADO without motivo (gastos_rechazo_ck)", async () => {
    const error = await captureError(async (tx) => {
      const { datos, validador } = await fixture(tx)
      await tx.gasto.create({
        data: { ...datos, estado: "RECHAZADO", rechazado_por_id: validador.id, rechazado_at: new Date() },
      })
    })
    expect(driverMessage(error)).toContain("gastos_rechazo_ck")
  })

  it("rejects a rejector equal to the registrant (gastos_rechazador_ck)", async () => {
    const error = await captureError(async (tx) => {
      const { datos, usuario } = await fixture(tx)
      await tx.gasto.create({
        data: {
          ...datos,
          estado: "RECHAZADO",
          rechazado_por_id: usuario.id,
          rechazado_at: new Date(),
          motivo_rechazo: "No aplica",
        },
      })
    })
    expect(driverMessage(error)).toContain("gastos_rechazador_ck")
  })

  it("keeps ANULADO and the anulado_* columns together (gastos_anulado_ck)", async () => {
    const cases = [
      { estado: "ANULADO" as const },
      { anulado_at: new Date(), anulado_por_id: "u", motivo_anulacion: "x" },
      { estado: "ANULADO" as const, anulado_at: new Date(), anulado_por_id: "u" },
    ]
    for (const extra of cases) {
      const error = await captureError(async (tx) => {
        const { datos } = await fixture(tx)
        await tx.gasto.create({ data: { ...datos, ...extra } })
      })
      expect(driverMessage(error)).toContain("gastos_anulado_ck")
    }
  })

  it("accepts a fully voided expense", async () => {
    const row = await runAndRollback(async (tx) => {
      const { datos, validador } = await fixture(tx)
      return tx.gasto.create({
        data: {
          ...datos,
          estado: "ANULADO",
          anulado_at: new Date(),
          anulado_por_id: validador.id,
          motivo_anulacion: "Duplicado",
        },
      })
    })
    expect(row.estado).toBe("ANULADO")
  })

  it("makes a cross-project line impossible (composite foreign key)", async () => {
    const error = await captureError(async (tx) => {
      const { datos, lineaOtro } = await fixture(tx)
      await tx.gasto.create({ data: { ...datos, linea_id: lineaOtro.id } })
    })
    expect((error as Prisma.PrismaClientKnownRequestError).code).toBe("P2003")
  })
})

describe("SoporteProyecto gasto parent (live DB)", () => {
  async function soporteFixture(tx: Tx) {
    const base = await fixture(tx)
    const gasto = await tx.gasto.create({ data: base.datos })
    const gastoOtro = await tx.gasto.create({
      data: { ...base.datos, proyecto_id: base.otro.id, linea_id: base.lineaOtro.id },
    })
    const soporte = {
      proyecto_id: base.proyecto.id,
      nombre: "factura.pdf",
      storage_path: `proyectos/${base.proyecto.id}/soportes/${randomUUID()}_factura.pdf`,
      tipo_mime: "application/pdf",
      tamano_bytes: 1024,
      subido_por_id: base.usuario.id,
    }
    return { ...base, gasto, gastoOtro, soporte }
  }

  it("accepts a soporte whose only parent is a gasto", async () => {
    const row = await runAndRollback(async (tx) => {
      const { soporte, gasto } = await soporteFixture(tx)
      return tx.soporteProyecto.create({ data: { ...soporte, gasto_id: gasto.id } })
    })
    expect(row.gasto_id).not.toBeNull()
    expect(row.avance_id).toBeNull()
  })

  it("rejects a soporte with a gasto and another parent (soportes_proyecto_padre_check)", async () => {
    const error = await captureError(async (tx) => {
      const { soporte, gasto } = await soporteFixture(tx)
      await tx.soporteProyecto.create({ data: { ...soporte, gasto_id: gasto.id, medicion_id: randomUUID() } })
    })
    expect(driverMessage(error)).toContain("soportes_proyecto_padre_check")
  })

  it("accepts a soporte without any parent: a project-origin document (migration 26)", async () => {
    const row = await runAndRollback(async (tx) => {
      const { soporte } = await soporteFixture(tx)
      return tx.soporteProyecto.create({ data: soporte })
    })
    expect(row.avance_id).toBeNull()
    expect(row.medicion_id).toBeNull()
    expect(row.gasto_id).toBeNull()
  })

  it("makes a cross-project gasto impossible (composite foreign key)", async () => {
    const error = await captureError(async (tx) => {
      const { soporte, gastoOtro } = await soporteFixture(tx)
      await tx.soporteProyecto.create({ data: { ...soporte, gasto_id: gastoOtro.id } })
    })
    expect((error as Prisma.PrismaClientKnownRequestError).code).toBe("P2003")
  })
})

describe("AccesoSoporte log (live DB)", () => {
  async function accesoFixture(tx: Tx) {
    const base = await fixture(tx)
    const gasto = await tx.gasto.create({ data: base.datos })
    const soporte = await tx.soporteProyecto.create({
      data: {
        proyecto_id: base.proyecto.id,
        gasto_id: gasto.id,
        nombre: "factura.pdf",
        storage_path: `proyectos/${base.proyecto.id}/soportes/${randomUUID()}_factura.pdf`,
        tamano_bytes: 10,
        subido_por_id: base.usuario.id,
      },
    })
    const acceso = await tx.accesoSoporte.create({
      data: { soporte_id: soporte.id, proyecto_id: base.proyecto.id, usuario_id: base.usuario.id },
    })
    return { ...base, soporte, acceso }
  }

  it("appends rows", async () => {
    const row = await runAndRollback(async (tx) => (await accesoFixture(tx)).acceso)
    expect(row.created_at).toBeInstanceOf(Date)
  })

  it("rejects row changes and statement-level truncation (append-only)", async () => {
    const update = await captureError(async (tx) => {
      const { acceso } = await accesoFixture(tx)
      await tx.accesoSoporte.update({ where: { id: acceso.id }, data: { usuario_id: "otro" } })
    })
    expect(driverMessage(update)).toContain("acceso_soportes es de solo escritura")

    const removal = await captureError(async (tx) => {
      const { acceso } = await accesoFixture(tx)
      await tx.accesoSoporte.delete({ where: { id: acceso.id } })
    })
    expect(driverMessage(removal)).toContain("acceso_soportes es de solo escritura")

    const truncation = await captureError(async (tx) => {
      await accesoFixture(tx)
      await tx.$executeRawUnsafe('TRUNCATE TABLE "acceso_soportes"')
    })
    expect(driverMessage(truncation)).toContain("acceso_soportes es de solo escritura")
  })

  it("RESTRICTs removing a soporte that has access rows", async () => {
    const error = await captureError(async (tx) => {
      const { soporte } = await accesoFixture(tx)
      await tx.soporteProyecto.delete({ where: { id: soporte.id } })
    })
    expect((error as Prisma.PrismaClientKnownRequestError).code).toBe("P2003")
  })
})

describe("E seam (live DB)", () => {
  it("feeds E only with VALIDADO expenses, mapped to the rubro of their line", async () => {
    const fuente = await runAndRollback(async (tx) => {
      const { datos, validador, proyecto, rubro, usuario } = await fixture(tx)
      const validado = { validado_por_id: validador.id, validado_at: new Date() }
      await tx.gasto.create({ data: { ...datos, subtotal_cop: 100, monto_cop: 100, estado: "VALIDADO", ...validado } })
      await tx.gasto.create({ data: { ...datos, subtotal_cop: 40, monto_cop: 40 } })
      await tx.gasto.create({
        data: {
          ...datos,
          subtotal_cop: 30,
          monto_cop: 30,
          estado: "RECHAZADO",
          rechazado_por_id: validador.id,
          rechazado_at: new Date(),
          motivo_rechazo: "No aplica",
        },
      })
      await tx.gasto.create({
        data: {
          ...datos,
          subtotal_cop: 20,
          monto_cop: 20,
          estado: "ANULADO",
          ...validado,
          anulado_por_id: usuario.id,
          anulado_at: new Date(),
          motivo_anulacion: "Error",
        },
      })
      return { fuente: await loadGastosValidados(proyecto.id, tx), rubroId: rubro.id }
    })
    expect(fuente.fuente.disponible).toBe(true)
    expect(fuente.fuente.gastos).toEqual([
      { rubroId: fuente.rubroId, periodo: "2026-10", valor: toCents("100"), estado: "VALIDADO" },
    ])
  })
})
