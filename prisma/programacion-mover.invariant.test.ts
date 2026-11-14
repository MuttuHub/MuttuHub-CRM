// Live-DB coverage for T13 (S4): after the baseline the Gestor moves a value between months of ONE budget line
// without approval. «El Gestor puede mover valores entre meses de una misma línea sin aprobación, siempre que el
// total de la línea no cambie.» «Cada movimiento queda en auditoría (línea, mes de origen, mes de destino, valor,
// usuario, fecha).» «Solo se pueden mover valores del mes en curso hacia meses futuros, o entre meses futuros. Los
// meses ya cerrados no se modifican, para no cambiar los semáforos pasados.»
//
// Every path rolls back (`versiones_proyecto` and `auditoria_cambios` are append-only). The fixture lives in
// 2030 and the current month is passed in, so the real clock never decides which month is closed.
//
// `./require-local-db` must stay the FIRST import.
import "./require-local-db"

import { randomUUID } from "node:crypto"

import { describe, expect, it } from "vitest"

import { db } from "@/lib/db"
import { RespuestaAbortada } from "@/lib/api/errors"
import { moverProgramacion } from "@/lib/api/presupuesto"
import { aprobarLineaBase } from "@/lib/api/versiones"
import { toCents } from "@/lib/proyectos/money"

const TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 }

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

async function aborto(promesa: Promise<unknown>): Promise<Response> {
  try {
    await promesa
  } catch (error) {
    if (error instanceof RespuestaAbortada) return error.response
    throw error
  }
  throw new Error("expected the call to abort")
}

const MARKER = "sdd-invariant-programacion-mover"
/** «En noviembre ...»: October is closed, November is the current month, December is future. */
const NOVIEMBRE = "2030-11"

/**
 * A project from October to December 2030 with Transporte in two activities: 1.1 (10.000.000: 2M / 4M / 4M) and
 * 1.2 (6.000.000: 2M a month). With `aprobada`, the baseline is approved and the project is EN_EJECUCION.
 */
async function proyecto(tx: Tx, aprobada = true) {
  const suffix = randomUUID()
  const usuario = await tx.usuario.create({ data: { email: `${MARKER}-${suffix}@example.test`, nombre: MARKER } })
  const cliente = await tx.cliente.create({
    data: { nombre: `${MARKER}-cliente-${suffix}`, tipo_cliente: "OTRO", responsable_id: usuario.id },
  })
  const p = await tx.proyecto.create({
    data: {
      codigo: `PRY-SDD-MV-${suffix}`,
      nombre: `${MARKER}-${suffix}`,
      cliente_id: cliente.id,
      valor_total: 16_000_000,
      fecha_inicio: new Date("2030-10-01T00:00:00.000Z"),
      fecha_fin: new Date("2030-12-20T00:00:00.000Z"),
      beneficiarios_meta: 10,
      programacion_confirmada_at: new Date(),
      programacion_confirmada_por_id: usuario.id,
    },
  })
  const rubro = await tx.rubro.create({ data: { codigo: `MV-${suffix.slice(0, 8)}`, nombre: `${MARKER}-Transporte` } })
  const objetivo = await tx.objetivo.create({ data: { proyecto_id: p.id, codigo: "OE1", descripcion: "Objetivo", orden: 1 } })
  const actividades = []
  for (const codigo of ["1.1", "1.2"]) {
    const actividad = await tx.actividad.create({
      data: { proyecto_id: p.id, objetivo_id: objetivo.id, codigo, nombre: `Actividad ${codigo}`, semana_inicio: 1, semana_fin: 2 },
    })
    await tx.entregable.create({
      data: { proyecto_id: p.id, actividad_id: actividad.id, codigo: `${codigo}-E1`, descripcion: "Entregable", cantidad_meta: 1, unidad: "Informe", tipo_medio_exigido: "Documento" },
    })
    actividades.push(actividad)
  }
  await tx.indicador.create({ data: { proyecto_id: p.id, objetivo_id: objetivo.id, codigo: "IND-01", nombre: "I", meta: 10, unidad: "u" } })
  const linea11 = await tx.lineaPresupuestal.create({
    data: { proyecto_id: p.id, rubro_id: rubro.id, actividad_id: actividades[0]!.id, monto_proyectado_cop: 10_000_000 },
  })
  const linea12 = await tx.lineaPresupuestal.create({
    data: { proyecto_id: p.id, rubro_id: rubro.id, actividad_id: actividades[1]!.id, monto_proyectado_cop: 6_000_000 },
  })
  const celdas: [string, string, number][] = [
    [linea11.id, "2030-10", 2_000_000],
    [linea11.id, "2030-11", 4_000_000],
    [linea11.id, "2030-12", 4_000_000],
    [linea12.id, "2030-10", 2_000_000],
    [linea12.id, "2030-11", 2_000_000],
    [linea12.id, "2030-12", 2_000_000],
  ]
  for (const [linea_id, periodo, valor] of celdas) {
    await tx.programacionPeriodo.create({ data: { proyecto_id: p.id, linea_id, periodo, valor } })
  }
  if (aprobada) await aprobarLineaBase(tx, { proyectoId: p.id, usuarioId: usuario.id })
  return { usuario, proyecto: p, linea11, linea12 }
}

type Fixture = Awaited<ReturnType<typeof proyecto>>

const mover = (tx: Tx, f: Fixture, over: Partial<{ lineaId: string; origen: string; destino: string; valor: string; periodoActual: string }> = {}) =>
  moverProgramacion(tx, {
    proyectoId: f.proyecto.id,
    usuarioId: f.usuario.id,
    lineaId: over.lineaId ?? f.linea11.id,
    origen: over.origen ?? "2030-11",
    destino: over.destino ?? "2030-12",
    valor: toCents(over.valor ?? "2000000"),
    periodoActual: over.periodoActual ?? NOVIEMBRE,
  })

/** Every cell of the project as `linea:periodo -> valor`, the line totals and the line amounts. */
async function estado(tx: Tx, f: Fixture) {
  const celdas = await tx.programacionPeriodo.findMany({ where: { proyecto_id: f.proyecto.id } })
  const lineas = await tx.lineaPresupuestal.findMany({ where: { proyecto_id: f.proyecto.id } })
  const nombre = (id: string) => (id === f.linea11.id ? "1.1" : "1.2")
  return {
    celdas: Object.fromEntries(celdas.map((c) => [`${nombre(c.linea_id)}:${c.periodo}`, c.valor.toString()])),
    asignado: Object.fromEntries(lineas.map((l) => [nombre(l.id), l.monto_proyectado_cop.toString()])),
  }
}

const ANTES = {
  celdas: {
    "1.1:2030-10": "2000000",
    "1.1:2030-11": "4000000",
    "1.1:2030-12": "4000000",
    "1.2:2030-10": "2000000",
    "1.2:2030-11": "2000000",
    "1.2:2030-12": "2000000",
  },
  asignado: { "1.1": "10000000", "1.2": "6000000" },
}

describe("moverProgramacion (T13 S4, live DB)", () => {
  it("«El Gestor pasa $2.000.000 de Transporte de noviembre a diciembre en una actividad, sin aprobación, y el total de la línea no cambia»", async () => {
    const r = await runAndRollback(async (tx) => {
      const f = await proyecto(tx)
      const v0 = await tx.versionProyecto.findFirstOrThrow({ where: { proyecto_id: f.proyecto.id, numero: 0 } })
      const vista = await mover(tx, f)
      return {
        vista,
        despues: await estado(tx, f),
        versiones: await tx.versionProyecto.findMany({ where: { proyecto_id: f.proyecto.id } }),
        v0: v0.snapshot,
        solicitudes: await tx.solicitudModificacion.count({ where: { proyecto_id: f.proyecto.id } }),
        auditoria: await tx.auditoriaCambio.findMany({ where: { proyecto_id: f.proyecto.id, entidad: "programacion" } }),
        f: { linea11: f.linea11.id, usuario: f.usuario.id },
      }
    })

    expect(r.despues).toEqual({
      celdas: { ...ANTES.celdas, "1.1:2030-11": "2000000", "1.1:2030-12": "6000000" },
      asignado: ANTES.asignado,
    })
    // The line still adds up to its amount; the other activity's line of the same rubro is untouched.
    expect(r.vista.estado).toBe("EN_EJECUCION")
    const linea = r.vista.control_por_linea.find((l) => l.linea_id === r.f.linea11)!
    expect(linea).toMatchObject({ asignado: "10000000.00", programado: "10000000.00", control: "0.00" })
    // Without approval: no request, no new version, and the baseline snapshot stays as it was.
    expect(r.solicitudes).toBe(0)
    expect(r.versiones).toHaveLength(1)
    expect(r.versiones[0]!.snapshot).toEqual(r.v0)
    // «Cada movimiento queda en auditoría (línea, mes de origen, mes de destino, valor, usuario, fecha).»
    expect(r.auditoria).toHaveLength(1)
    const fila = r.auditoria[0]!
    expect(fila).toMatchObject({ accion: "EDITAR", entidad: "programacion", entidad_id: r.f.linea11, usuario_id: r.f.usuario, campo: "mover" })
    expect(fila.lote_id).not.toBeNull()
    expect(fila.created_at).toBeInstanceOf(Date)
    expect(fila.valor_anterior).toEqual({ linea_id: r.f.linea11, origen: { periodo: "2030-11", valor: "4000000.00" }, destino: { periodo: "2030-12", valor: "4000000.00" } })
    expect(fila.valor_nuevo).toEqual({
      linea_id: r.f.linea11,
      valor: "2000000.00",
      origen: { periodo: "2030-11", valor: "2000000.00" },
      destino: { periodo: "2030-12", valor: "6000000.00" },
    })
  })

  it("moves between future months, and the whole value of a month (its cell goes away)", async () => {
    const r = await runAndRollback(async (tx) => {
      const f = await proyecto(tx)
      await mover(tx, f, { origen: "2030-12", destino: "2030-11", valor: "4000000", periodoActual: "2030-10" })
      return estado(tx, f)
    })
    expect(r.celdas).toEqual({ ...ANTES.celdas, "1.1:2030-11": "8000000", "1.1:2030-12": undefined })
    expect(Object.keys(r.celdas)).not.toContain("1.1:2030-12")
  })

  it("«En noviembre no se puede mover valor desde octubre»: a closed month is neither origin nor destination, and nothing changes", async () => {
    const r = await runAndRollback(async (tx) => {
      const f = await proyecto(tx)
      const desde = await aborto(mover(tx, f, { origen: "2030-10", destino: "2030-12" }))
      const hacia = await aborto(mover(tx, f, { origen: "2030-12", destino: "2030-10" }))
      return {
        desde: { status: desde.status, json: await desde.json() },
        hacia: { status: hacia.status, json: await hacia.json() },
        despues: await estado(tx, f),
        auditoria: await tx.auditoriaCambio.count({ where: { proyecto_id: f.proyecto.id, entidad: "programacion" } }),
      }
    })
    expect(r.desde).toEqual({
      status: 400,
      json: { error: "El mes 2030-10 ya cerró: no se pueden mover valores desde ni hacia un mes cerrado.", code: "VALIDATION_ERROR" },
    })
    expect(r.hacia.status).toBe(400)
    expect(r.hacia.json.error).toBe("El mes 2030-10 ya cerró: no se pueden mover valores desde ni hacia un mes cerrado.")
    expect(r.despues).toEqual(ANTES)
    expect(r.auditoria).toBe(0)
  })

  it("refuses the same month, a value above what the origin month has, a zero value, a month outside the project and a line of another project", async () => {
    const r = await runAndRollback(async (tx) => {
      const f = await proyecto(tx)
      const otro = await proyecto(tx, false)
      const casos = {
        mismo: await aborto(mover(tx, f, { destino: "2030-11" })),
        excede: await aborto(mover(tx, f, { valor: "4000000.01" })),
        cero: await aborto(mover(tx, f, { valor: "0" })),
        fuera: await aborto(mover(tx, f, { destino: "2031-01" })),
        ajena: await aborto(mover(tx, f, { lineaId: otro.linea11.id })),
      }
      const salida: Record<string, { status: number; error: string }> = {}
      for (const [k, res] of Object.entries(casos)) salida[k] = { status: res.status, error: (await res.json()).error }
      return { salida, despues: await estado(tx, f) }
    })
    expect(r.salida).toEqual({
      mismo: { status: 400, error: "El mes de destino debe ser distinto del mes de origen." },
      excede: { status: 400, error: "El mes 2030-11 solo tiene $ 4.000.000 programados en esta línea: no se pueden mover $ 4.000.000,01." },
      cero: { status: 400, error: "El valor a mover debe ser mayor que cero." },
      fuera: { status: 400, error: "El periodo 2031-01 está fuera del rango del proyecto." },
      ajena: { status: 400, error: "La línea no está en el presupuesto del proyecto." },
    })
    expect(r.despues).toEqual(ANTES)
  })

  it("answers 409 outside EN_EJECUCION: in BORRADOR the full programming PUT is the way", async () => {
    const r = await runAndRollback(async (tx) => {
      const f = await proyecto(tx, false)
      const res = await aborto(mover(tx, f))
      return { status: res.status, json: await res.json(), despues: await estado(tx, f) }
    })
    expect(r.status).toBe(409)
    expect(r.json).toEqual({ error: "Solo se pueden mover valores entre meses de un proyecto en ejecución.", code: "INVALID_STATE" })
    expect(r.despues).toEqual(ANTES)
  })
})
