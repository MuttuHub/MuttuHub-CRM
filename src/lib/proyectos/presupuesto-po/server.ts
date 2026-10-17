/**
 * Server writer of the PO budget import (touches the database; everything else
 * in this folder is pure).
 *
 * `aplicarPresupuestoPO` runs inside the caller's transaction and mirrors the
 * write of `PUT /api/v1/projects/:id/budget` line by line: the same BORRADOR
 * re-check under the row lock, the same line fields (`monto_proyectado_cop`),
 * lines created only above $0 and never deleted, one `presupuesto/asignado`
 * audit entry per changed line, and the same N-17 rule (a null `valor_total`
 * takes the sum). The PUT route writes inline; it is deliberately not refactored
 * from here, so a change to its write must be mirrored in this function (the
 * route tests of both pin the same fields and audit entries).
 */
import { Prisma } from "@prisma/client"
import { apiError } from "@/lib/api/errors"
import { logChanges, type CambioInput } from "@/lib/api/audit-cambios"
import {
  MONTO_MAXIMO_CENTS,
  RespuestaAbortada,
  decimalFromCents,
  loadBudgetView,
  lockProyectoBorrador,
  type BudgetView,
} from "@/lib/api/presupuesto"
import { diferenciaValor } from "../proyecto-general"
import { fromCents, sumCents, toCents, type Cents } from "../money"

export const CATALOGO_CAMBIO_MESSAGE =
  "El catálogo de rubros cambió mientras importabas. Vuelve a validar el archivo."

export type AplicarPresupuestoInput = {
  proyectoId: string
  usuarioId: string
  /** Amount per ACTIVE rubro read from the file; an active rubro missing here goes to $0. */
  montos: ReadonlyMap<string, Cents>
  oportunidad: { valor_estimado_cop: Prisma.Decimal | null } | null
}

export async function aplicarPresupuestoPO(
  tx: Prisma.TransactionClient,
  input: AplicarPresupuestoInput,
): Promise<{ cambios: number; presupuesto: BudgetView }> {
  const { proyectoId: id, usuarioId } = input
  const locked = await lockProyectoBorrador(tx, id)

  const [rubros, lineas] = await Promise.all([
    tx.rubro.findMany({
      where: { OR: [{ activo: true }, { lineas: { some: { proyecto_id: id } } }] },
      select: { id: true, codigo: true, nombre: true, activo: true, orden: true },
    }),
    tx.lineaPresupuestal.findMany({
      where: { proyecto_id: id },
      select: { id: true, rubro_id: true, monto_proyectado_cop: true },
    }),
  ])
  const activos = new Set(rubros.filter((r) => r.activo).map((r) => r.id))
  for (const rubroId of input.montos.keys()) {
    if (!activos.has(rubroId)) throw new RespuestaAbortada(apiError(CATALOGO_CAMBIO_MESSAGE, 409, "CONFLICT"))
  }

  // Every active rubro, as the PUT body must carry them.
  const montos = new Map<string, Cents>()
  for (const rubro of rubros) if (rubro.activo) montos.set(rubro.id, input.montos.get(rubro.id) ?? toCents("0"))

  const lineaPorRubro = new Map(lineas.map((l) => [l.rubro_id, l]))
  const cambios: CambioInput[] = []
  const base = { usuario_id: usuarioId, entidad: "presupuesto", proyecto_id: id, campo: "asignado" } as const

  for (const [rubroId, cents] of montos) {
    const existente = lineaPorRubro.get(rubroId)
    if (existente) {
      const anterior = toCents(existente.monto_proyectado_cop)
      if (anterior === cents) continue
      await tx.lineaPresupuestal.update({
        where: { id: existente.id },
        data: { monto_proyectado_cop: decimalFromCents(cents) },
      })
      cambios.push({
        ...base,
        accion: "EDITAR",
        entidad_id: existente.id,
        valor_anterior: fromCents(anterior),
        valor_nuevo: fromCents(cents),
      })
    } else if (cents > toCents("0")) {
      const creada = await tx.lineaPresupuestal.create({
        data: { proyecto_id: id, rubro_id: rubroId, monto_proyectado_cop: decimalFromCents(cents) },
        select: { id: true },
      })
      cambios.push({ ...base, accion: "CREAR", entidad_id: creada.id, valor_anterior: null, valor_nuevo: fromCents(cents) })
    }
  }
  const lineasCambiadas = cambios.length

  // The sum of ALL lines after the write (a suspended line keeps counting).
  const finales = new Map<string, bigint>(lineas.map((l) => [l.rubro_id, toCents(l.monto_proyectado_cop)]))
  for (const [rubroId, cents] of montos) if (finales.has(rubroId) || cents > toCents("0")) finales.set(rubroId, cents)
  const suma = sumCents([...finales.values()])

  let valorTotal: string | null = locked.valor_total
  if (locked.valor_total === null && suma > toCents("0") && suma <= MONTO_MAXIMO_CENTS) {
    const diferencia = input.oportunidad ? diferenciaValor(fromCents(suma), input.oportunidad.valor_estimado_cop) : null
    await tx.proyecto.update({
      where: { id },
      data: {
        valor_total: decimalFromCents(suma),
        ...(input.oportunidad
          ? { diferencia_valor_oportunidad: diferencia === null ? null : new Prisma.Decimal(diferencia) }
          : {}),
      },
    })
    cambios.push({
      usuario_id: usuarioId,
      accion: "EDITAR",
      entidad: "proyecto",
      entidad_id: id,
      proyecto_id: id,
      campo: "valor_total",
      valor_anterior: null,
      valor_nuevo: fromCents(suma),
    })
    valorTotal = fromCents(suma)
  }

  if (cambios.length > 0) await logChanges(tx, cambios)

  return { cambios: lineasCambiadas, presupuesto: await loadBudgetView(tx, id, "BORRADOR", valorTotal) }
}
