// Live-DB coverage for the S8 baseline approval (E-25): v0, estado and the audit rows commit or roll
// back together, a second approval is refused, and the project row lock serializes the writers.
// Every path rolls back except the race fixture, which only commits a BORRADOR project it deletes
// afterwards (`auditoria_cambios` and `versiones_proyecto` are append-only, so nothing that approves
// may ever be committed).
//
// `./require-local-db` must stay the FIRST import.
import "./require-local-db"

import { randomUUID } from "node:crypto"

import { describe, expect, it } from "vitest"

import { db } from "@/lib/db"
import { RespuestaAbortada } from "@/lib/api/errors"
import { lockProyecto, lockProyectoBorrador } from "@/lib/api/presupuesto"
import { aprobarLineaBase } from "@/lib/api/versiones"

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

const MARKER = "sdd-invariant-linea-base"

/** A project that satisfies every REQ-VER-01 item: 100 over two months, one objective, activity, deliverable. */
async function fixture(tx: Tx, over: { sinObjetivos?: boolean } = {}) {
  const suffix = randomUUID()
  const usuario = await tx.usuario.create({ data: { email: `${MARKER}-${suffix}@example.test`, nombre: MARKER } })
  const cliente = await tx.cliente.create({
    data: { nombre: `${MARKER}-cliente-${suffix}`, tipo_cliente: "OTRO", responsable_id: usuario.id },
  })
  const proyecto = await tx.proyecto.create({
    data: {
      codigo: `PRY-SDD-B-${suffix}`,
      nombre: `${MARKER}-${suffix}`,
      cliente_id: cliente.id,
      valor_total: 100,
      fecha_inicio: new Date("2026-10-05T00:00:00.000Z"),
      fecha_fin: new Date("2026-11-27T00:00:00.000Z"),
      beneficiarios_meta: 50,
    },
  })
  const rubro = await tx.rubro.create({ data: { codigo: `B-${suffix.slice(0, 8)}`, nombre: `${MARKER}-rubro` } })
  const linea = await tx.lineaPresupuestal.create({
    data: { proyecto_id: proyecto.id, rubro_id: rubro.id, monto_proyectado_cop: 100 },
  })
  for (const periodo of ["2026-10", "2026-11"]) {
    await tx.programacionPeriodo.create({ data: { proyecto_id: proyecto.id, linea_id: linea.id, periodo, valor: 50 } })
  }
  if (!over.sinObjetivos) {
    const objetivo = await tx.objetivo.create({
      data: { proyecto_id: proyecto.id, codigo: "OE1", descripcion: "Objetivo", orden: 1 },
    })
    const actividad = await tx.actividad.create({
      data: {
        proyecto_id: proyecto.id,
        objetivo_id: objetivo.id,
        codigo: "1.1",
        nombre: "Actividad",
        semana_inicio: 1,
        semana_fin: 2,
        peso: 2,
      },
    })
    await tx.entregable.create({
      data: {
        proyecto_id: proyecto.id,
        actividad_id: actividad.id,
        codigo: "1.1-E1",
        descripcion: "Entregable",
        cantidad_meta: 1,
        unidad: "Informe",
        tipo_medio_exigido: "Documento",
      },
    })
    await tx.indicador.create({
      data: { proyecto_id: proyecto.id, objetivo_id: objetivo.id, codigo: "IND-01", nombre: "I", meta: 10, unidad: "u" },
    })
  }
  return { usuario, proyecto, rubro, linea }
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

describe("aprobarLineaBase (live DB)", () => {
  it("creates v0, sets EN_EJECUCION and audits APROBAR in one transaction", async () => {
    const resultado = await runAndRollback(async (tx) => {
      const { usuario, proyecto } = await fixture(tx)
      const salida = await aprobarLineaBase(tx, { proyectoId: proyecto.id, usuarioId: usuario.id })
      const versiones = await tx.versionProyecto.findMany({ where: { proyecto_id: proyecto.id } })
      const estado = (await tx.proyecto.findUniqueOrThrow({ where: { id: proyecto.id } })).estado
      const auditoria = await tx.auditoriaCambio.findMany({ where: { proyecto_id: proyecto.id } })
      return { salida, versiones, estado, auditoria, usuarioId: usuario.id }
    })

    expect(resultado.salida.version.numero).toBe(0)
    expect(resultado.salida.proyecto).toMatchObject({ estado: "EN_EJECUCION" })
    expect(resultado.estado).toBe("EN_EJECUCION")
    expect(resultado.versiones).toHaveLength(1)
    expect(resultado.versiones[0]).toMatchObject({ numero: 0, tipo: "LINEA_BASE", solicitud_id: null })
    expect(resultado.versiones[0]!.aprobado_por_id).toBe(resultado.usuarioId)

    const snapshot = resultado.versiones[0]!.snapshot as { schema: number; presupuesto: unknown[]; programacion: unknown[] }
    expect(snapshot.schema).toBe(1)
    expect(snapshot.presupuesto).toHaveLength(1)
    expect(snapshot.programacion).toHaveLength(2)

    const acciones = resultado.auditoria.map((fila) => `${fila.accion}:${fila.entidad}:${fila.campo ?? ""}`).sort()
    expect(acciones).toEqual(["APROBAR:version:", "EDITAR:proyecto:estado"])
    expect(new Set(resultado.auditoria.map((fila) => fila.lote_id)).size).toBe(1)
  })

  it("rolls back v0, the estado and the audit when the write fails after the version insert", async () => {
    const resultado = await runAndRollback(async (tx) => {
      const { usuario, proyecto } = await fixture(tx)
      await tx.$executeRawUnsafe("SAVEPOINT aprobar_linea_base")
      const roto = new Proxy(tx, {
        get(target, prop, receiver) {
          if (prop === "proyecto") {
            return new Proxy(target.proyecto, {
              get(modelo, accion, r) {
                if (accion === "update") {
                  return async () => {
                    throw new Error("injected failure after the version insert")
                  }
                }
                return Reflect.get(modelo, accion, r)
              },
            })
          }
          return Reflect.get(target, prop, receiver)
        },
      }) as Tx
      await expect(aprobarLineaBase(roto, { proyectoId: proyecto.id, usuarioId: usuario.id })).rejects.toThrow(
        /injected failure/,
      )
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT aprobar_linea_base")
      return {
        versiones: await tx.versionProyecto.count({ where: { proyecto_id: proyecto.id } }),
        estado: (await tx.proyecto.findUniqueOrThrow({ where: { id: proyecto.id } })).estado,
        auditoria: await tx.auditoriaCambio.count({ where: { proyecto_id: proyecto.id } }),
      }
    })
    expect(resultado).toEqual({ versiones: 0, estado: "BORRADOR", auditoria: 0 })
  })

  it("refuses a second approval with 409", async () => {
    const respuesta = await runAndRollback(async (tx) => {
      const { usuario, proyecto } = await fixture(tx)
      await aprobarLineaBase(tx, { proyectoId: proyecto.id, usuarioId: usuario.id })
      return aborto(aprobarLineaBase(tx, { proyectoId: proyecto.id, usuarioId: usuario.id }))
    })
    expect(respuesta.status).toBe(409)
    expect((await respuesta.json()).error).toBe("El proyecto ya tiene línea base aprobada.")
  })

  it("refuses an incomplete project with every failed precondition and writes nothing", async () => {
    const resultado = await runAndRollback(async (tx) => {
      const { usuario, proyecto } = await fixture(tx, { sinObjetivos: true })
      const respuesta = await aborto(aprobarLineaBase(tx, { proyectoId: proyecto.id, usuarioId: usuario.id }))
      return {
        respuesta,
        versiones: await tx.versionProyecto.count({ where: { proyecto_id: proyecto.id } }),
        estado: (await tx.proyecto.findUniqueOrThrow({ where: { id: proyecto.id } })).estado,
      }
    })
    expect(resultado.respuesta.status).toBe(409)
    const json = await resultado.respuesta.json()
    expect(json.precondiciones.map((p: { codigo: string }) => p.codigo)).toEqual(["SIN_OBJETIVOS"])
    expect(resultado.versiones).toBe(0)
    expect(resultado.estado).toBe("BORRADOR")
  })

  it("closes every structure/budget writer after the approval: the lock answers 409", async () => {
    const respuesta = await runAndRollback(async (tx) => {
      const { usuario, proyecto } = await fixture(tx)
      await aprobarLineaBase(tx, { proyectoId: proyecto.id, usuarioId: usuario.id })
      return aborto(lockProyectoBorrador(tx, proyecto.id, "Solo en Borrador."))
    })
    expect(respuesta.status).toBe(409)
  })
})

/**
 * The fixture is committed (a BORRADOR project, deleted below) so a second connection can see it.
 * `sostener` runs in transaction A, which then waits; a structure writer (`lockProyectoBorrador`) is
 * started on connection B and must stay blocked until A rolls back.
 */
async function carrera(sostener: (tx: Tx, ids: { proyectoId: string; usuarioId: string }) => Promise<unknown>) {
  const creado = await db.$transaction(async (tx) => {
    const f = await fixture(tx)
    return {
      proyectoId: f.proyecto.id,
      usuarioId: f.usuario.id,
      rubroId: f.rubro.id,
      clienteId: f.proyecto.cliente_id,
    }
  }, TX_OPTIONS)

  try {
    let liberar!: () => void
    const liberada = new Promise<void>((resolve) => (liberar = resolve))
    let sosteniendo!: () => void
    const listo = new Promise<void>((resolve) => (sosteniendo = resolve))

    const holder = db
      .$transaction(async (tx) => {
        await sostener(tx, creado)
        sosteniendo()
        await liberada
        throw new IntentionalRollback()
      }, TX_OPTIONS)
      .catch((error) => {
        if (!(error instanceof IntentionalRollback)) throw error
      })

    await listo
    let escritorTermino = false
    const escritor = db
      .$transaction((tx) => lockProyectoBorrador(tx, creado.proyectoId, "Solo en Borrador."), TX_OPTIONS)
      .then(() => {
        escritorTermino = true
      })

    await new Promise((resolve) => setTimeout(resolve, 500))
    const bloqueado = !escritorTermino

    liberar()
    await holder
    await escritor // A rolled back: the project is BORRADOR again and the lock is granted
    return { bloqueado, termino: escritorTermino }
  } finally {
    await db.programacionPeriodo.deleteMany({ where: { proyecto_id: creado.proyectoId } })
    await db.lineaPresupuestal.deleteMany({ where: { proyecto_id: creado.proyectoId } })
    await db.indicador.deleteMany({ where: { proyecto_id: creado.proyectoId } })
    await db.entregable.deleteMany({ where: { proyecto_id: creado.proyectoId } })
    await db.actividad.deleteMany({ where: { proyecto_id: creado.proyectoId } })
    await db.objetivo.deleteMany({ where: { proyecto_id: creado.proyectoId } })
    await db.proyecto.delete({ where: { id: creado.proyectoId } })
    await db.rubro.delete({ where: { id: creado.rubroId } })
    await db.cliente.delete({ where: { id: creado.clienteId } })
    await db.usuario.delete({ where: { id: creado.usuarioId } })
  }
}

describe("project row lock (live DB, two connections)", () => {
  it("lockProyecto alone makes a structure writer wait (FOR UPDATE), until it is released", async () => {
    const r = await carrera((tx, ids) => lockProyecto(tx, ids.proyectoId))
    expect(r).toEqual({ bloqueado: true, termino: true })
  })

  it("an approval in flight makes a structure writer wait, and the writer proceeds once it is released", async () => {
    const r = await carrera((tx, ids) => aprobarLineaBase(tx, { proyectoId: ids.proyectoId, usuarioId: ids.usuarioId }))
    expect(r).toEqual({ bloqueado: true, termino: true })
  })
})
