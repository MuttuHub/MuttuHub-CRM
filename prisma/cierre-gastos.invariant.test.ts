// Live-DB coverage for the S11 closure of an activity's expenses (T14.5-A): the three nullable columns the
// migration adds, the two writers against the real schema, the ledger rows they leave (the nota of the closure
// and the motivo of the reopening) and the predicate the expense writers call — closed refuses the activity's
// lines, reopened lets them in again. Prisma cannot prove a migration is additive, so the columns are read from
// `information_schema`. Every path rolls back.
//
// `./require-local-db` must stay the FIRST import.
import "./require-local-db"

import { randomUUID } from "node:crypto"

import { describe, expect, it } from "vitest"

import { db } from "@/lib/db"
import {
  ACTIVIDAD_SIN_CIERRE_MESSAGE,
  ACTIVIDAD_YA_CERRADA_MESSAGE,
  GASTOS_CERRADOS_MESSAGE,
  cerrarGastosActividad,
  reabrirGastosActividad,
  rechazarGastosCerrados,
} from "@/lib/api/cierre-gastos"
import { RespuestaAbortada } from "@/lib/api/errors"

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

const MARKER = "t14-cierre"
const NOTA = "No se requirió transporte porque el taller fue en el mismo municipio."
const MOTIVO = "Llegó una factura de noviembre que faltaba."

/** The 409 a writer raises inside the transaction, read back from its envelope. */
async function rechazoDe(promise: Promise<unknown>): Promise<{ status: number; error: string }> {
  const error = await promise.then(
    () => null,
    (thrown: unknown) => thrown,
  )
  expect(error).toBeInstanceOf(RespuestaAbortada)
  const response = (error as RespuestaAbortada).response
  const json = (await response.json()) as { error: string }
  return { status: response.status, error: json.error }
}

async function fixture(tx: Tx) {
  const suffix = randomUUID()
  const usuario = await tx.usuario.create({ data: { email: `${MARKER}-${suffix}@example.test`, nombre: MARKER } })
  const cliente = await tx.cliente.create({
    data: { nombre: `${MARKER}-cliente-${suffix}`, tipo_cliente: "OTRO", responsable_id: usuario.id },
  })
  const proyecto = await tx.proyecto.create({
    data: { codigo: `PRY-T145-${suffix}`, nombre: `${MARKER}-${suffix}`, cliente_id: cliente.id },
  })
  const objetivo = await tx.objetivo.create({
    data: { proyecto_id: proyecto.id, codigo: "1", descripcion: "Objetivo 1", orden: 1 },
  })
  const actividad = await tx.actividad.create({
    data: {
      proyecto_id: proyecto.id,
      objetivo_id: objetivo.id,
      codigo: "1.2",
      nombre: "Actividad 1.2",
      semana_inicio: 1,
      semana_fin: 4,
    },
  })
  const rubro = await tx.rubro.create({ data: { codigo: `T145-${suffix.slice(0, 8)}`, nombre: `${MARKER}-rubro` } })
  const linea = await tx.lineaPresupuestal.create({
    data: { proyecto_id: proyecto.id, rubro_id: rubro.id, actividad_id: actividad.id, monto_proyectado_cop: 10_000_000 },
  })
  return { usuario, proyecto, actividad, linea }
}

describe("S11/T14.5 — the closure of an activity's expenses on the live schema", () => {
  it("adds the three closure columns nullable and with no default, so every activity starts open", async () => {
    const columnas = await db.$queryRawUnsafe<Array<{ column_name: string; is_nullable: string; column_default: string | null }>>(
      `SELECT column_name, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'actividades'
          AND column_name LIKE 'gastos_cerrados%'
        ORDER BY column_name`,
    )

    expect(columnas.map((columna) => columna.column_name)).toEqual([
      "gastos_cerrados_at",
      "gastos_cerrados_nota",
      "gastos_cerrados_por",
    ])
    for (const columna of columnas) {
      expect(columna.is_nullable).toBe("YES")
      expect(columna.column_default).toBeNull()
    }

    await runAndRollback(async (tx) => {
      const { actividad } = await fixture(tx)
      const creada = await tx.actividad.findFirstOrThrow({ where: { id: actividad.id } })
      expect(creada.gastos_cerrados_at).toBeNull()
      expect(creada.gastos_cerrados_nota).toBeNull()
      expect(creada.gastos_cerrados_por).toBeNull()
    })
  })

  it("closes with the nota, refuses the line while closed and lets it in again after the reopening (S11)", async () => {
    await runAndRollback(async (tx) => {
      const { usuario, proyecto, actividad, linea } = await fixture(tx)

      const cerrada = await cerrarGastosActividad(tx, {
        actividad: {
          id: actividad.id,
          gastos_cerrados_at: null,
          gastos_cerrados_nota: null,
          gastos_cerrados_por: null,
        },
        proyectoId: proyecto.id,
        usuarioId: usuario.id,
        nota: NOTA,
      })
      expect(cerrada.gastos_cerrados).toBe(true)
      expect(cerrada.gastos_cerrados_nota).toBe(NOTA)
      expect(cerrada.gastos_cerrados_por).toBe(usuario.id)

      const fila = await tx.actividad.findFirstOrThrow({ where: { id: actividad.id } })
      expect(fila.gastos_cerrados_at).toBeInstanceOf(Date)
      expect(fila.gastos_cerrados_nota).toBe(NOTA)
      expect(fila.gastos_cerrados_por).toBe(usuario.id)

      const auditoria = await tx.auditoriaCambio.findMany({
        where: { entidad: "actividad", entidad_id: actividad.id },
        orderBy: { campo: "asc" },
      })
      expect(auditoria.map((row) => row.campo)).toEqual([
        "gastos_cerrados_at",
        "gastos_cerrados_nota",
        "gastos_cerrados_por",
      ])
      const nota = auditoria.find((row) => row.campo === "gastos_cerrados_nota")
      expect(nota?.valor_anterior).toBeNull()
      expect(nota?.valor_nuevo).toBe(NOTA)
      expect(nota?.accion).toBe("EDITAR")

      // What the three expense writers call: the line of a closed activity is refused, and nothing is written.
      const rechazo = await rechazarGastosCerrados([linea.id], tx)
      expect(rechazo?.status).toBe(409)
      expect(await rechazo?.json()).toEqual({ error: GASTOS_CERRADOS_MESSAGE, code: "INVALID_STATE" })
      expect(await tx.gasto.count({ where: { proyecto_id: proyecto.id } })).toBe(0)

      const abierta = await reabrirGastosActividad(tx, {
        actividad: {
          id: actividad.id,
          gastos_cerrados_at: fila.gastos_cerrados_at,
          gastos_cerrados_nota: fila.gastos_cerrados_nota,
          gastos_cerrados_por: fila.gastos_cerrados_por,
        },
        proyectoId: proyecto.id,
        usuarioId: usuario.id,
        motivo: MOTIVO,
      })
      expect(abierta.gastos_cerrados).toBe(false)
      expect(abierta.gastos_cerrados_at).toBeNull()

      const reabierta = await tx.actividad.findFirstOrThrow({ where: { id: actividad.id } })
      expect(reabierta.gastos_cerrados_at).toBeNull()
      expect(reabierta.gastos_cerrados_nota).toBeNull()
      expect(reabierta.gastos_cerrados_por).toBeNull()

      const ledger = await tx.auditoriaCambio.findMany({
        where: { entidad: "actividad", entidad_id: actividad.id, campo: "motivo_reapertura" },
      })
      expect(ledger).toHaveLength(1)
      expect(ledger[0].valor_nuevo).toBe(MOTIVO)

      // The reopening is what lets a new expense in again.
      expect(await rechazarGastosCerrados([linea.id], tx)).toBeNull()
    })
  })

  it("refuses to close twice and to reopen an open activity, leaving the ledger untouched (S11)", async () => {
    await runAndRollback(async (tx) => {
      const { usuario, proyecto, actividad } = await fixture(tx)
      const antes = { id: actividad.id, gastos_cerrados_at: null, gastos_cerrados_nota: null, gastos_cerrados_por: null }
      const comun = { actividad: antes, proyectoId: proyecto.id, usuarioId: usuario.id }

      expect(await rechazoDe(reabrirGastosActividad(tx, { ...comun, motivo: MOTIVO }))).toEqual({
        status: 409,
        error: ACTIVIDAD_SIN_CIERRE_MESSAGE,
      })

      const yaCerrada = await cerrarGastosActividad(tx, { ...comun, nota: NOTA })
      expect(yaCerrada.gastos_cerrados_nota).toBe(NOTA)
      expect(await rechazoDe(cerrarGastosActividad(tx, { ...comun, nota: NOTA }))).toEqual({
        status: 409,
        error: ACTIVIDAD_YA_CERRADA_MESSAGE,
      })

      const auditoria = await tx.auditoriaCambio.findMany({
        where: { entidad: "actividad", entidad_id: actividad.id },
      })
      expect(auditoria).toHaveLength(3)

      expect((await reabrirGastosActividad(tx, { ...comun, motivo: MOTIVO })).gastos_cerrados).toBe(false)
      expect(await rechazoDe(reabrirGastosActividad(tx, { ...comun, motivo: MOTIVO }))).toEqual({
        status: 409,
        error: ACTIVIDAD_SIN_CIERRE_MESSAGE,
      })
    })
  })
})
