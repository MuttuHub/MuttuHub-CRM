// Live-DB coverage for the S8 modification approval (E-26): version N, the applied changes, the audit
// lote and REQ-GAS-06 commit or roll back together. Every path rolls back: `versiones_proyecto` and
// `auditoria_cambios` are append-only, so nothing that approves may ever be committed. The race test
// commits only a project WITHOUT a baseline (the v0 of that one is created inside the transaction that
// holds the locks and is rolled back with it) and deletes everything afterwards.
//
// The fixture lives in 2030 so the real clock never freezes one of its periods.
//
// `./require-local-db` must stay the FIRST import.
import "./require-local-db"

import { randomUUID } from "node:crypto"

import type { Prisma } from "@prisma/client"
import { describe, expect, it } from "vitest"

import { db } from "@/lib/db"
import { RespuestaAbortada } from "@/lib/api/errors"
import { GASTO_INCLUDE } from "@/lib/api/gastos"
import { aplicarModificacion, rechazarModificacion } from "@/lib/api/modificaciones"
import { validarEnTransaccion } from "@/lib/api/validacion-gastos"
import { aprobarLineaBase, loadLiveProyecto } from "@/lib/api/versiones"
import { applyModificacion, type DetalleItem, type TipoModificacion } from "@/lib/proyectos/modificaciones"
import { buildSnapshot } from "@/lib/proyectos/versiones"

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

const MARKER = "sdd-invariant-modificaciones"

type Fixture = Awaited<ReturnType<typeof borrador>>

/** A BORRADOR project in 2030: A 100 + B 50 (150 over two months), C in the catalog but not in the budget. */
async function borrador(tx: Tx) {
  const suffix = randomUUID()
  const corto = suffix.slice(0, 8)
  const usuario = await tx.usuario.create({ data: { email: `${MARKER}-${suffix}@example.test`, nombre: MARKER } })
  const validador = await tx.usuario.create({ data: { email: `${MARKER}-v-${suffix}@example.test`, nombre: MARKER } })
  const cliente = await tx.cliente.create({
    data: { nombre: `${MARKER}-cliente-${suffix}`, tipo_cliente: "OTRO", responsable_id: usuario.id },
  })
  const proyecto = await tx.proyecto.create({
    data: {
      codigo: `PRY-SDD-M-${suffix}`,
      nombre: `${MARKER}-${suffix}`,
      cliente_id: cliente.id,
      valor_total: 150,
      fecha_inicio: new Date("2030-01-07T00:00:00.000Z"),
      fecha_fin: new Date("2030-02-28T00:00:00.000Z"),
      beneficiarios_meta: 50,
    },
  })
  const rubroA = await tx.rubro.create({ data: { codigo: `MA-${corto}`, nombre: `${MARKER}-A` } })
  const rubroB = await tx.rubro.create({ data: { codigo: `MB-${corto}`, nombre: `${MARKER}-B` } })
  const rubroC = await tx.rubro.create({ data: { codigo: `MC-${corto}`, nombre: `${MARKER}-C` } })
  const lineaA = await tx.lineaPresupuestal.create({ data: { proyecto_id: proyecto.id, rubro_id: rubroA.id, monto_proyectado_cop: 100 } })
  const lineaB = await tx.lineaPresupuestal.create({ data: { proyecto_id: proyecto.id, rubro_id: rubroB.id, monto_proyectado_cop: 50 } })
  for (const [linea, valor] of [[lineaA, 50], [lineaB, 25]] as const) {
    for (const periodo of ["2030-01", "2030-02"]) {
      await tx.programacionPeriodo.create({ data: { proyecto_id: proyecto.id, linea_id: linea.id, periodo, valor } })
    }
  }
  const objetivo = await tx.objetivo.create({ data: { proyecto_id: proyecto.id, codigo: "OE1", descripcion: "Objetivo", orden: 1 } })
  const actividad = await tx.actividad.create({
    data: { proyecto_id: proyecto.id, objetivo_id: objetivo.id, codigo: "1.1", nombre: "Actividad", semana_inicio: 1, semana_fin: 2, peso: 2 },
  })
  await tx.entregable.create({
    data: { proyecto_id: proyecto.id, actividad_id: actividad.id, codigo: "1.1-E1", descripcion: "Entregable", cantidad_meta: 1, unidad: "Informe", tipo_medio_exigido: "Documento" },
  })
  await tx.indicador.create({
    data: { proyecto_id: proyecto.id, objetivo_id: objetivo.id, codigo: "IND-01", nombre: "I", meta: 10, unidad: "u" },
  })
  return {
    usuario,
    validador,
    cliente,
    proyecto,
    rubros: { A: rubroA, B: rubroB, C: rubroC },
    lineas: { A: lineaA, B: lineaB },
    ids: { proyectoId: proyecto.id, usuarioId: usuario.id },
  }
}

/** The same project with its baseline approved (v0) and EN_EJECUCION. */
async function enEjecucion(tx: Tx) {
  const f = await borrador(tx)
  await aprobarLineaBase(tx, f.ids)
  return f
}

const A = (f: Fixture) => f.rubros.A.codigo!
const B = (f: Fixture) => f.rubros.B.codigo!
const C = (f: Fixture) => f.rubros.C.codigo!

const presupuesto = (clave: string, antes: string, despues: string): DetalleItem => ({ elemento: "presupuesto", clave, campo: "asignado", antes, despues })
const celda = (clave: string, antes: string, despues: string): DetalleItem => ({ elemento: "programacion", clave, campo: "valor", antes, despues })

const trasladoAB = (f: Fixture): DetalleItem[] => [
  presupuesto(A(f), "100", "90"),
  presupuesto(B(f), "50", "60"),
  celda(`${A(f)}|2030-02`, "50", "40"),
  celda(`${B(f)}|2030-02`, "25", "35"),
]

async function solicitud(tx: Tx, f: Fixture, tipo: TipoModificacion, detalle: DetalleItem[], base = 0) {
  return tx.solicitudModificacion.create({
    data: {
      proyecto_id: f.proyecto.id,
      tipo,
      motivo: "Prueba",
      detalle: detalle as unknown as Prisma.InputJsonValue,
      version_base_numero: base,
      solicitado_por_id: f.usuario.id,
    },
  })
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

async function crearGasto(tx: Tx, f: Fixture, over: { monto: number; estado?: "REGISTRADO" | "VALIDADO"; periodo?: string }) {
  const suffix = randomUUID().slice(0, 8)
  const base = {
    proyecto_id: f.proyecto.id,
    linea_id: f.lineas.A.id,
    fecha_documento: new Date("2030-01-15"),
    periodo: over.periodo ?? "2030-01",
    tipo_soporte: "FACTURA_PROVEEDOR" as const,
    tercero_nombre: "Proveedor SAS",
    tercero_tipo_id: "NIT" as const,
    tercero_numero_id: "900.123.456-7",
    tercero_id_norm: "900123456",
    numero_documento: `FE-${suffix}`,
    numero_documento_norm: `FE${suffix}`,
    descripcion: "Gasto",
    monto_cop: over.monto,
    registrado_por_id: f.usuario.id,
  }
  const estado = over.estado ?? "REGISTRADO"
  return tx.gasto.create({
    data: estado === "VALIDADO" ? { ...base, estado, validado_por_id: f.validador.id, validado_at: new Date() } : base,
    include: GASTO_INCLUDE,
  })
}

describe("aplicarModificacion (live DB)", () => {
  it("creates version 1, applies the changes and audits the lote in one transaction", async () => {
    const r = await runAndRollback(async (tx) => {
      const f = await enEjecucion(tx)
      const sol = await solicitud(tx, f, "TRASLADO", trasladoAB(f))
      const salida = await aplicarModificacion(tx, { ...f.ids, solicitudId: sol.id })
      return {
        salida,
        versiones: await tx.versionProyecto.findMany({ where: { proyecto_id: f.proyecto.id }, orderBy: { numero: "asc" } }),
        lineas: await tx.lineaPresupuestal.findMany({ where: { proyecto_id: f.proyecto.id }, include: { rubro: true } }),
        celdas: await tx.programacionPeriodo.findMany({ where: { proyecto_id: f.proyecto.id, periodo: "2030-02" }, include: { linea: { include: { rubro: true } } } }),
        solicitud: await tx.solicitudModificacion.findUniqueOrThrow({ where: { id: sol.id } }),
        proyecto: await tx.proyecto.findUniqueOrThrow({ where: { id: f.proyecto.id } }),
        auditoria: await tx.auditoriaCambio.findMany({ where: { proyecto_id: f.proyecto.id, lote_id: { not: null } }, orderBy: { created_at: "asc" } }),
        f: { A: A(f), B: B(f), usuarioId: f.usuario.id, solicitudId: sol.id },
      }
    })

    expect(r.salida.version.numero).toBe(1)
    expect(r.versiones.map((v) => [v.numero, v.tipo, v.solicitud_id])).toEqual([
      [0, "LINEA_BASE", null],
      [1, "MODIFICACION", r.f.solicitudId],
    ])
    expect(r.versiones[1]!.aprobado_por_id).toBe(r.f.usuarioId)
    const montos = Object.fromEntries(r.lineas.map((l) => [l.rubro.codigo, l.monto_proyectado_cop.toString()]))
    expect(montos).toEqual({ [r.f.A]: "90", [r.f.B]: "60" })
    const celdas = Object.fromEntries(r.celdas.map((c) => [c.linea.rubro.codigo, c.valor.toString()]))
    expect(celdas).toEqual({ [r.f.A]: "40", [r.f.B]: "35" })
    expect(r.proyecto.valor_total?.toString()).toBe("150") // TRASLADO keeps the total
    expect(r.solicitud).toMatchObject({ estado: "APROBADA", decidido_por_id: r.f.usuarioId })
    expect(r.solicitud.decidido_at).not.toBeNull()

    // The lote of the modification (the baseline's lote is a different one).
    const loteMod = r.auditoria.find((a) => a.entidad === "solicitud")!.lote_id
    const lote = r.auditoria.filter((a) => a.lote_id === loteMod)
    expect(new Set(r.auditoria.map((a) => a.lote_id)).size).toBe(2) // the baseline's lote + this one
    expect(lote.map((a) => `${a.accion}:${a.entidad}:${a.campo ?? ""}`).sort()).toEqual([
      "APROBAR:solicitud:estado",
      "APROBAR:version:",
      "EDITAR:presupuesto:asignado",
      "EDITAR:presupuesto:asignado",
      "EDITAR:programacion:2030-02",
      "EDITAR:programacion:2030-02",
    ])
  })

  it("snapshot after apply equals buildSnapshot(applyModificacion(live)) for adición, cronograma and entregables", async () => {
    const r = await runAndRollback(async (tx) => {
      const f = await enEjecucion(tx)
      const nombreC = f.rubros.C.nombre
      const casos: { tipo: TipoModificacion; detalle: DetalleItem[] }[] = [
        { tipo: "ADICION", detalle: [presupuesto(C(f), "0", "20"), celda(`${C(f)}|2030-01`, "0", "20")] },
        { tipo: "CRONOGRAMA", detalle: [{ elemento: "actividad", clave: "1.1", campo: "semana_fin", antes: "2", despues: "4" }] },
        {
          tipo: "ENTREGABLES",
          detalle: [
            { elemento: "entregable", clave: "1.1-E1", campo: "cantidad_meta", antes: "1", despues: "3" },
            { elemento: "indicador", clave: "IND-01", campo: "meta", antes: "10", despues: "12" },
          ],
        },
      ]
      const comparaciones: { esperado: unknown; guardado: unknown }[] = []
      for (const [i, caso] of casos.entries()) {
        const antes = (await loadLiveProyecto(tx, f.proyecto.id)).live!
        const sol = await solicitud(tx, f, caso.tipo, caso.detalle, i)
        const salida = await aplicarModificacion(tx, { ...f.ids, solicitudId: sol.id })
        const version = await tx.versionProyecto.findUniqueOrThrow({ where: { id: salida.version.id } })
        comparaciones.push({
          esperado: buildSnapshot(applyModificacion(antes, caso, new Map([[C(f), nombreC]]))),
          guardado: version.snapshot,
        })
      }
      return {
        comparaciones,
        proyecto: await tx.proyecto.findUniqueOrThrow({ where: { id: f.proyecto.id } }),
        actividad: await tx.actividad.findFirstOrThrow({ where: { proyecto_id: f.proyecto.id, codigo: "1.1" } }),
        entregable: await tx.entregable.findFirstOrThrow({ where: { proyecto_id: f.proyecto.id } }),
        indicador: await tx.indicador.findFirstOrThrow({ where: { proyecto_id: f.proyecto.id } }),
        numeros: (await tx.versionProyecto.findMany({ where: { proyecto_id: f.proyecto.id }, orderBy: { numero: "asc" } })).map((v) => v.numero),
      }
    })
    for (const c of r.comparaciones) expect(c.guardado).toEqual(c.esperado)
    expect(r.numeros).toEqual([0, 1, 2, 3])
    expect(r.proyecto.valor_total?.toString()).toBe("170") // ADICION derives the total (D2)
    expect(r.actividad).toMatchObject({ semana_fin: 4, peso_manual: false })
    expect(r.actividad.peso.toString()).toBe("4")
    expect(r.entregable.cantidad_meta.toString()).toBe("3")
    expect(r.indicador.meta.toString()).toBe("12")
  })

  it("refuses a request based on an older version with 409", async () => {
    const respuesta = await runAndRollback(async (tx) => {
      const f = await enEjecucion(tx)
      const primera = await solicitud(tx, f, "TRASLADO", trasladoAB(f))
      const segunda = await solicitud(tx, f, "ENTREGABLES", [{ elemento: "entregable", clave: "1.1-E1", campo: "cantidad_meta", antes: "1", despues: "2" }])
      await aplicarModificacion(tx, { ...f.ids, solicitudId: primera.id })
      return aborto(aplicarModificacion(tx, { ...f.ids, solicitudId: segunda.id }))
    })
    expect(respuesta.status).toBe(409)
    expect((await respuesta.json()).error).toBe("La solicitud se basa en una versión anterior; vuelve a crearla.")
  })

  it("refuses an already decided request and a project that is not EN_EJECUCION", async () => {
    const r = await runAndRollback(async (tx) => {
      const f = await enEjecucion(tx)
      const sol = await solicitud(tx, f, "TRASLADO", trasladoAB(f))
      await rechazarModificacion(tx, { ...f.ids, solicitudId: sol.id, comentario: "No procede" })
      const decidida = await aborto(aplicarModificacion(tx, { ...f.ids, solicitudId: sol.id }))

      const g = await borrador(tx)
      const otra = await solicitud(tx, g, "TRASLADO", trasladoAB(g))
      const sinEjecucion = await aborto(aplicarModificacion(tx, { ...g.ids, solicitudId: otra.id }))
      const ajena = await aborto(aplicarModificacion(tx, { ...f.ids, solicitudId: otra.id }))
      return { decidida, sinEjecucion, ajena }
    })
    expect(r.decidida.status).toBe(409)
    expect((await r.decidida.json()).error).toBe("La solicitud ya fue decidida.")
    expect(r.sinEjecucion.status).toBe(409)
    expect((await r.sinEjecucion.json()).error).toBe("Solo se pueden aplicar modificaciones a un proyecto en ejecución.")
    expect(r.ajena.status).toBe(404) // a request of another project does not exist here
  })

  it("rejection records the comment and changes no data; a second decision is refused", async () => {
    const r = await runAndRollback(async (tx) => {
      const f = await enEjecucion(tx)
      const sol = await solicitud(tx, f, "TRASLADO", trasladoAB(f))
      await rechazarModificacion(tx, { ...f.ids, solicitudId: sol.id, comentario: "No hay presupuesto" })
      const segunda = await aborto(rechazarModificacion(tx, { ...f.ids, solicitudId: sol.id, comentario: "Otra vez" }))
      return {
        segunda,
        solicitud: await tx.solicitudModificacion.findUniqueOrThrow({ where: { id: sol.id } }),
        versiones: await tx.versionProyecto.count({ where: { proyecto_id: f.proyecto.id } }),
        lineas: (await tx.lineaPresupuestal.findMany({ where: { proyecto_id: f.proyecto.id } })).map((l) => l.monto_proyectado_cop.toString()).sort(),
        auditoria: await tx.auditoriaCambio.findMany({ where: { proyecto_id: f.proyecto.id, entidad: "solicitud" } }),
      }
    })
    expect(r.solicitud).toMatchObject({ estado: "RECHAZADA", comentario_decision: "No hay presupuesto" })
    expect(r.solicitud.decidido_por_id).not.toBeNull()
    expect(r.versiones).toBe(1)
    expect(r.lineas).toEqual(["100", "50"])
    expect(r.auditoria.map((a) => a.accion)).toEqual(["RECHAZAR"])
    expect(r.segunda.status).toBe(409)
  })

  it("never leaves A below the validated E: 400 with the rule and nothing written (REQ-GAS-06)", async () => {
    const r = await runAndRollback(async (tx) => {
      const f = await enEjecucion(tx)
      await crearGasto(tx, f, { monto: 95, estado: "VALIDADO" })
      const sol = await solicitud(tx, f, "REDUCCION", [presupuesto(A(f), "100", "90"), celda(`${A(f)}|2030-02`, "50", "40")])
      const respuesta = await aborto(aplicarModificacion(tx, { ...f.ids, solicitudId: sol.id }))
      return {
        respuesta,
        versiones: await tx.versionProyecto.count({ where: { proyecto_id: f.proyecto.id } }),
        linea: (await tx.lineaPresupuestal.findUniqueOrThrow({ where: { id: f.lineas.A.id } })).monto_proyectado_cop.toString(),
        estado: (await tx.solicitudModificacion.findUniqueOrThrow({ where: { id: sol.id } })).estado,
      }
    })
    expect(r.respuesta.status).toBe(400)
    const json = await r.respuesta.json()
    expect(json.reglas.map((x: { codigo: string }) => x.codigo)).toEqual(["A_MENOR_QUE_EJECUTADO"])
    expect(r.versiones).toBe(1)
    expect(r.linea).toBe("100")
    expect(r.estado).toBe("PENDIENTE")
  })

  it("unblocks a previously overspend-blocked expense once A is raised (REQ-GAS-05)", async () => {
    const r = await runAndRollback(async (tx) => {
      const f = await enEjecucion(tx)
      const gasto = await crearGasto(tx, f, { monto: 120 })
      const primero = await validarEnTransaccion(tx, { gasto, validadorId: f.validador.id })
      const sol = await solicitud(tx, f, "ADICION", [
        presupuesto(A(f), "100", "130"),
        celda(`${A(f)}|2030-01`, "50", "65"),
        celda(`${A(f)}|2030-02`, "50", "65"),
      ])
      await aplicarModificacion(tx, { ...f.ids, solicitudId: sol.id })
      const bloqueado = await tx.gasto.findUniqueOrThrow({ where: { id: gasto.id }, include: GASTO_INCLUDE })
      const segundo = await validarEnTransaccion(tx, { gasto: bloqueado, validadorId: f.validador.id })
      return { primero, segundo, final: await tx.gasto.findUniqueOrThrow({ where: { id: gasto.id } }), flagTrasBloqueo: bloqueado.alerta_sobregasto }
    })
    expect(r.primero).toEqual({ blocked: true })
    expect(r.flagTrasBloqueo).toBe(true)
    expect(r.segundo).toMatchObject({ blocked: false })
    expect(r.final).toMatchObject({ estado: "VALIDADO", alerta_sobregasto: false })
  })

  it("rolls back everything when the write fails after the version insert", async () => {
    const r = await runAndRollback(async (tx) => {
      const f = await enEjecucion(tx)
      const sol = await solicitud(tx, f, "TRASLADO", trasladoAB(f))
      await tx.$executeRawUnsafe("SAVEPOINT aplicar_modificacion")
      const roto = new Proxy(tx, {
        get(target, prop, receiver) {
          if (prop === "solicitudModificacion") {
            return new Proxy(target.solicitudModificacion, {
              get(modelo, accion, rr) {
                if (accion === "updateMany") {
                  return async () => {
                    throw new Error("injected failure after the version insert")
                  }
                }
                return Reflect.get(modelo, accion, rr)
              },
            })
          }
          return Reflect.get(target, prop, receiver)
        },
      }) as Tx
      await expect(aplicarModificacion(roto, { ...f.ids, solicitudId: sol.id })).rejects.toThrow(/injected failure/)
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT aplicar_modificacion")
      return {
        versiones: await tx.versionProyecto.count({ where: { proyecto_id: f.proyecto.id } }),
        lineas: (await tx.lineaPresupuestal.findMany({ where: { proyecto_id: f.proyecto.id } })).map((l) => l.monto_proyectado_cop.toString()).sort(),
        estado: (await tx.solicitudModificacion.findUniqueOrThrow({ where: { id: sol.id } })).estado,
        auditoria: await tx.auditoriaCambio.count({ where: { proyecto_id: f.proyecto.id, entidad: "solicitud" } }),
      }
    })
    expect(r).toEqual({ versiones: 1, lineas: ["100", "50"], estado: "PENDIENTE", auditoria: 0 })
  })
})

describe("approval vs a concurrent validation (live DB, two connections)", () => {
  it("an approval that has read E already holds the line locks: a validation waits and then sees the committed value", async () => {
    // Committed fixture WITHOUT a baseline (deletable); the v0 is created inside the approving transaction.
    const creado = await db.$transaction(async (tx) => {
      const f = await borrador(tx)
      await tx.proyecto.update({ where: { id: f.proyecto.id }, data: { estado: "EN_EJECUCION" } })
      const gasto = await crearGasto(tx, f, { monto: 95 })
      return { f, gastoId: gasto.id }
    }, TX_OPTIONS)

    try {
      let liberar!: () => void
      const liberada = new Promise<void>((resolve) => (liberar = resolve))
      let sosteniendo!: () => void
      const listo = new Promise<void>((resolve) => (sosteniendo = resolve))

      const aprobador = db
        .$transaction(async (tx) => {
          const { live } = await loadLiveProyecto(tx, creado.f.proyecto.id)
          await tx.versionProyecto.create({
            data: { proyecto_id: creado.f.proyecto.id, numero: 0, tipo: "LINEA_BASE", aprobado_por_id: creado.f.usuario.id, snapshot: buildSnapshot(live!) as unknown as Prisma.InputJsonValue },
          })
          const sol = await solicitud(tx, creado.f, "REDUCCION", [presupuesto(A(creado.f), "100", "90"), celda(`${A(creado.f)}|2030-02`, "50", "40")])
          // Pause the approval right after it read E (and before it writes anything): the line locks
          // must already be held, or a validation could slip in between and leave A below E.
          const pausado = new Proxy(tx, {
            get(target, prop, receiver) {
              if (prop === "gasto") {
                return new Proxy(target.gasto, {
                  get(modelo, accion, rr) {
                    if (accion !== "findMany") return Reflect.get(modelo, accion, rr)
                    return async (args: unknown) => {
                      const filas = await (modelo.findMany as (a: unknown) => Promise<unknown>)(args)
                      sosteniendo()
                      await liberada
                      return filas
                    }
                  },
                })
              }
              return Reflect.get(target, prop, receiver)
            },
          }) as Tx
          await aplicarModificacion(pausado, { ...creado.f.ids, solicitudId: sol.id })
          throw new IntentionalRollback()
        }, TX_OPTIONS)
        .catch((error) => {
          if (!(error instanceof IntentionalRollback)) throw error
        })

      await listo
      let terminado = false
      let resultado: unknown
      const gasto = await db.gasto.findUniqueOrThrow({ where: { id: creado.gastoId }, include: GASTO_INCLUDE })
      const validador = runAndRollback(async (tx) => {
        resultado = await validarEnTransaccion(tx, { gasto, validadorId: creado.f.validador.id })
        terminado = true
      })

      await new Promise((resolve) => setTimeout(resolve, 600))
      const bloqueada = !terminado

      liberar()
      await aprobador
      await validador // A rolled back: the line is back at 100 and the 95 validates
      expect(bloqueada).toBe(true)
      expect(resultado).toMatchObject({ blocked: false })
    } finally {
      const id = creado.f.proyecto.id
      await db.gasto.deleteMany({ where: { proyecto_id: id } })
      await db.programacionPeriodo.deleteMany({ where: { proyecto_id: id } })
      await db.lineaPresupuestal.deleteMany({ where: { proyecto_id: id } })
      await db.indicador.deleteMany({ where: { proyecto_id: id } })
      await db.entregable.deleteMany({ where: { proyecto_id: id } })
      await db.actividad.deleteMany({ where: { proyecto_id: id } })
      await db.objetivo.deleteMany({ where: { proyecto_id: id } })
      await db.proyecto.delete({ where: { id } })
      await db.rubro.deleteMany({ where: { id: { in: [creado.f.rubros.A.id, creado.f.rubros.B.id, creado.f.rubros.C.id] } } })
      await db.cliente.delete({ where: { id: creado.f.cliente.id } })
      await db.usuario.deleteMany({ where: { id: { in: [creado.f.usuario.id, creado.f.validador.id] } } })
    }
  })
})
