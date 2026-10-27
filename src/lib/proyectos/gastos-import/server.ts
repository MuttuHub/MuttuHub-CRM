/**
 * Server side of the expenses import (touches the database; `parse.ts` and `template.ts` are pure).
 *
 * `aplicarGastosImport` runs inside the caller's transaction and writes each row exactly as
 * `POST /expenses` writes a single expense (same fields, same normalized keys, same early-overspend
 * flag, same `CREAR`/`gasto` audit shape with the id masked), minus the supports (S2: they come
 * separately) and with ONE shared `lote_id` for the whole import (S7). The single-expense route writes
 * inline and is deliberately not refactored from here: a change to its write must be mirrored in this
 * function (the route tests of both pin the same fields).
 */
import type { Prisma, Usuario } from "@prisma/client"
import { db } from "@/lib/db"
import { logChanges, type CambioInput } from "@/lib/api/audit-cambios"
import { decimalFromCents } from "@/lib/api/presupuesto"
import { normalizeProjectDate } from "@/lib/api/projects"
import {
  SOBREGASTO_ADVERTENCIA,
  buscarDuplicados,
  clavesNormalizadas,
  gastoAuditable,
  superaAsignado,
  tieneAsignado,
  type AlertaGasto,
  type LineaGasto,
} from "@/lib/api/gastos"
import { toCents } from "../money"
import type { ContextoImportGastos, DatosGastoImport, FilaGastoImport } from "./parse"

export type ContextoServidor = {
  contexto: ContextoImportGastos
  /** Budget line of each rubro of the project (only those with an assigned value take expenses). */
  lineas: Map<string, LineaGasto>
}

/**
 * The rubros a file may name (the ACTIVE catalog plus the project's own lines, so a line of a rubro
 * suspended later still matches) and, per rubro, the line that can take expenses.
 */
export async function cargarContextoImport(proyecto: {
  id: string
  fecha_inicio: Date | null
  fecha_fin: Date | null
}): Promise<ContextoServidor> {
  const [catalogo, lineasRows] = await Promise.all([
    db.rubro.findMany({ where: { activo: true }, select: { id: true, codigo: true, nombre: true } }),
    db.lineaPresupuestal.findMany({
      where: { proyecto_id: proyecto.id },
      select: { id: true, monto_proyectado_cop: true, rubro: { select: { id: true, codigo: true, nombre: true } } },
    }),
  ])

  const rubros = new Map(catalogo.map((r) => [r.id, r]))
  const lineas = new Map<string, LineaGasto>()
  for (const linea of lineasRows) {
    rubros.set(linea.rubro.id, linea.rubro)
    if (tieneAsignado(linea.monto_proyectado_cop)) {
      lineas.set(linea.rubro.id, { id: linea.id, asignado: toCents(linea.monto_proyectado_cop), rubro: linea.rubro })
    }
  }
  return {
    contexto: {
      proyecto,
      rubros: [...rubros.values()],
      rubrosConAsignado: new Set(lineas.keys()),
    },
    lineas,
  }
}

/** The alerts of one row: early overspend (when flagged) and live duplicates of any project. Never blocking. */
export async function alertasDeFila(
  usuario: Usuario,
  proyectoId: string,
  gasto: { id: string; datos: DatosGastoImport; sobregasto: boolean },
): Promise<AlertaGasto[]> {
  const alertas: AlertaGasto[] = []
  if (gasto.sobregasto) alertas.push({ tipo: "SOBREGASTO", mensaje: SOBREGASTO_ADVERTENCIA })
  const { datos } = gasto
  alertas.push(
    ...(await buscarDuplicados(usuario, {
      id: gasto.id,
      proyecto_id: proyectoId,
      estado: "REGISTRADO",
      ...clavesNormalizadas({
        tercero_tipo_id: datos.tercero_tipo_id,
        tercero_numero_id: datos.tercero_numero_id,
        numero_documento: datos.numero_documento,
      }),
    })),
  )
  return alertas
}

export type AplicarGastosInput = {
  proyectoId: string
  usuarioId: string
  /** The valid rows (with `datos`), in file order. */
  filas: readonly (FilaGastoImport & { datos: DatosGastoImport })[]
  lineas: ReadonlyMap<string, LineaGasto>
  loteId: string
}

export type GastoCreadoImport = { fila: number; id: string; datos: DatosGastoImport; sobregasto: boolean }

export async function aplicarGastosImport(tx: Prisma.TransactionClient, input: AplicarGastosInput): Promise<GastoCreadoImport[]> {
  const creados: GastoCreadoImport[] = []
  const auditoria: CambioInput[] = []

  for (const { fila, datos } of input.filas) {
    const linea = input.lineas.get(datos.rubro_id) as LineaGasto
    const sobregasto = await superaAsignado(tx, linea, datos.cents)
    const claves = clavesNormalizadas({
      tercero_tipo_id: datos.tercero_tipo_id,
      tercero_numero_id: datos.tercero_numero_id,
      numero_documento: datos.numero_documento,
    })
    const created = await tx.gasto.create({
      data: {
        proyecto_id: input.proyectoId,
        linea_id: linea.id,
        fecha_documento: normalizeProjectDate(datos.fecha_documento),
        periodo: datos.periodo,
        tipo_soporte: datos.tipo_soporte,
        tercero_nombre: datos.tercero_nombre,
        tercero_tipo_id: datos.tercero_tipo_id,
        tercero_numero_id: datos.tercero_numero_id,
        ...claves,
        numero_documento: datos.numero_documento,
        descripcion: datos.descripcion,
        monto_cop: decimalFromCents(datos.cents),
        alerta_sobregasto: sobregasto,
        registrado_por_id: input.usuarioId,
      },
    })
    auditoria.push({
      usuario_id: input.usuarioId,
      accion: "CREAR",
      entidad: "gasto",
      entidad_id: created.id,
      proyecto_id: input.proyectoId,
      lote_id: input.loteId,
      valor_nuevo: {
        ...gastoAuditable({ ...created, rubro_id: linea.rubro.id }),
        estado: created.estado,
        soportes: 0,
      },
    })
    creados.push({ fila, id: created.id, datos, sobregasto })
  }

  await logChanges(tx, auditoria)
  return creados
}
