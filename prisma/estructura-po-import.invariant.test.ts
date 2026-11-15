// Live-DB coverage for the simple PO structure import (`importarEstructuraPO`), T13 S6/S8:
// - D-A: «modo "solo estructura" que conserva el presupuesto existente»: a re-import re-points each budget line to
//   the new activity with the same code, keeping its value and its programming.
// - S8 (user, 2026-11-14): «si tiene un presupuesto asignado se borra junto con la actividad, le toca hacerlo de
//   cero»: a line whose activity code the new file drops goes, with its programming; valor_total is recomputed.
// Every path rolls back.
//
// `./require-local-db` must stay the FIRST import.
import "./require-local-db"

import { randomUUID } from "node:crypto"

import { describe, expect, it } from "vitest"

import { db } from "@/lib/db"
import { importarEstructuraPO } from "@/lib/api/estructura-po-import"
import type { PlanEstructuraPO } from "@/lib/proyectos/estructura-po/parse"

const TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 }
const MARKER = "sdd-invariant-estructura-po"

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

const plan = (actividades: string[]): PlanEstructuraPO => ({
  objetivos: [{ codigo: "O1", descripcion: "Objetivo" }],
  indicadores: [],
  actividades: actividades.map((codigo, i) => ({
    codigo,
    objetivoCodigo: "O1",
    nombre: `Actividad ${codigo}`,
    semanaInicio: i + 1,
    semanaFin: i + 2,
  })),
  entregables: actividades.map((codigo) => ({
    codigo: `${codigo}-E1`,
    actividadCodigo: codigo,
    descripcion: "Entregable",
    cantidadMeta: "1",
    unidad: "Informe",
  })),
})

/** A BORRADOR project, imported once with A1.1 and A1.2, and a confirmed programming on two activity lines. */
async function fixture(tx: Tx) {
  const suffix = randomUUID()
  const usuario = await tx.usuario.create({ data: { email: `${MARKER}-${suffix}@example.test`, nombre: MARKER } })
  const cliente = await tx.cliente.create({
    data: { nombre: `${MARKER}-cliente-${suffix}`, tipo_cliente: "OTRO", responsable_id: usuario.id },
  })
  const proyecto = await tx.proyecto.create({
    data: {
      codigo: `PRY-SDD-EP-${suffix}`,
      nombre: `${MARKER}-${suffix}`,
      cliente_id: cliente.id,
      valor_total: 300,
      fecha_inicio: new Date("2026-10-05T00:00:00.000Z"),
      fecha_fin: new Date("2026-11-27T00:00:00.000Z"),
    },
  })
  const importar = (codigos: string[]) =>
    importarEstructuraPO(tx, {
      proyectoId: proyecto.id,
      usuarioId: usuario.id,
      plan: plan(codigos),
      loteId: randomUUID(),
      stateMessage: "Solo en Borrador.",
    })
  await importar(["A1.1", "A1.2"])

  const actividad = (codigo: string) =>
    tx.actividad.findFirstOrThrow({ where: { proyecto_id: proyecto.id, codigo, deleted_at: null } })
  const rubro = await tx.rubro.create({ data: { codigo: `EP-${suffix.slice(0, 8)}`, nombre: `${MARKER}-rubro` } })
  const linea11 = await tx.lineaPresupuestal.create({
    data: { proyecto_id: proyecto.id, actividad_id: (await actividad("A1.1")).id, rubro_id: rubro.id, monto_proyectado_cop: 200 },
  })
  const linea12 = await tx.lineaPresupuestal.create({
    data: { proyecto_id: proyecto.id, actividad_id: (await actividad("A1.2")).id, rubro_id: rubro.id, monto_proyectado_cop: 100 },
  })
  for (const [linea, valor] of [[linea11, 200], [linea12, 100]] as const) {
    await tx.programacionPeriodo.create({ data: { proyecto_id: proyecto.id, linea_id: linea.id, periodo: "2026-10", valor } })
  }
  await tx.proyecto.update({
    where: { id: proyecto.id },
    data: { programacion_confirmada_at: new Date(), programacion_confirmada_por_id: usuario.id },
  })
  return { proyecto, importar, actividad, linea11, linea12 }
}

describe("importarEstructuraPO keeps the budget (T13 S6, live DB)", () => {
  it("re-points each line to the new activity with the same code, keeping its value and programming", async () => {
    const r = await runAndRollback(async (tx) => {
      const { proyecto, importar, actividad, linea11, linea12 } = await fixture(tx)
      await importar(["A1.1", "A1.2"])
      const lineas = await tx.lineaPresupuestal.findMany({
        where: { proyecto_id: proyecto.id },
        include: { actividad: true },
        orderBy: { monto_proyectado_cop: "desc" },
      })
      return {
        lineas,
        ids: [linea11.id, linea12.id],
        vivas: [(await actividad("A1.1")).id, (await actividad("A1.2")).id],
        celdas: await tx.programacionPeriodo.count({ where: { proyecto_id: proyecto.id } }),
        proyecto: await tx.proyecto.findUniqueOrThrow({ where: { id: proyecto.id } }),
      }
    })
    expect(r.lineas.map((l) => l.id)).toEqual(r.ids)
    expect(r.lineas.map((l) => l.actividad_id)).toEqual(r.vivas)
    expect(r.lineas.every((l) => l.actividad?.deleted_at === null)).toBe(true)
    expect(r.celdas).toBe(2)
    expect(r.proyecto.valor_total?.toString()).toBe("300")
    // Nothing in the budget changed, so the Gestor's confirmation stands.
    expect(r.proyecto.programacion_confirmada_at).not.toBeNull()
  })

  it("deletes the line of an activity the new file drops, with its programming, and recomputes valor_total", async () => {
    const r = await runAndRollback(async (tx) => {
      const { proyecto, importar, linea11 } = await fixture(tx)
      await importar(["A1.1"])
      return {
        lineas: await tx.lineaPresupuestal.findMany({ where: { proyecto_id: proyecto.id }, select: { id: true } }),
        celdas: await tx.programacionPeriodo.count({ where: { proyecto_id: proyecto.id } }),
        proyecto: await tx.proyecto.findUniqueOrThrow({ where: { id: proyecto.id } }),
        auditoria: await tx.auditoriaCambio.findMany({
          where: { proyecto_id: proyecto.id, campo: { in: ["asignado", "valor_total", "programacion_confirmada_at"] } },
          orderBy: { campo: "asc" },
        }),
        linea11: linea11.id,
      }
    })
    expect(r.lineas.map((l) => l.id)).toEqual([r.linea11])
    expect(r.celdas).toBe(1)
    expect(r.proyecto.valor_total?.toString()).toBe("200")
    expect(r.proyecto.programacion_confirmada_at).toBeNull()
    expect(r.auditoria.map((a) => [a.accion, a.campo, a.valor_anterior, a.valor_nuevo])).toEqual([
      ["IMPORTAR", "asignado", "100.00", "0.00"],
      ["IMPORTAR", "programacion_confirmada_at", expect.any(String), null],
      ["IMPORTAR", "valor_total", "300.00", "200.00"],
    ])
  })
})
