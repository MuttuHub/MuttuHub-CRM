/**
 * Server side of the expenses import (touches the database; `parse.ts` and `template.ts` are pure).
 *
 * `aplicarGastosImport` runs inside the caller's transaction and writes each row exactly as
 * `POST /expenses` writes a single expense (same fields, same normalized keys, same early-overspend
 * flag, same `CREAR`/`gasto` audit shape with the id masked), with ONE shared `lote_id` for the whole
 * import (S7). The single-expense route writes inline and is deliberately not refactored from here: a
 * change to its write must be mirrored in this function (the route tests of both pin the same fields).
 *
 * AJ-06 (S2, S3): a row's «Enlace del soporte» links (already split and http(s)-validated by
 * `parse.ts`) become one `SoporteProyecto` per link, created in the SAME transaction right after the
 * gasto it belongs to — so a row with two links creates a gasto with exactly two soportes atomically.
 * A row with no links keeps the previous behaviour: the gasto is created with zero soportes and still
 * needs one attached by hand (B8, unaffected).
 */
import type { Prisma, Usuario } from "@prisma/client"
import { db } from "@/lib/db"
import { logChanges, type CambioInput } from "@/lib/api/audit-cambios"
import { decimalFromCents } from "@/lib/api/presupuesto"
import { normalizeProjectDate } from "@/lib/api/projects"
import {
  alertaSobregasto,
  buscarDuplicados,
  cargarSobregastos,
  clavesNormalizadas,
  gastoAuditable,
  tieneAsignado,
  type AlertaGasto,
  type LineaGasto,
  type NivelSobregasto,
} from "@/lib/api/gastos"
import { notificarSobregasto } from "@/lib/api/notificaciones-proyecto"
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

/** The alerts of one row: the overspend level (critical or programmed) and live duplicates of any project. Never blocking. */
export async function alertasDeFila(
  usuario: Usuario,
  proyectoId: string,
  gasto: { id: string; datos: DatosGastoImport; nivel: NivelSobregasto },
): Promise<AlertaGasto[]> {
  const alertas: AlertaGasto[] = []
  const alerta = alertaSobregasto(gasto.nivel)
  if (alerta) alertas.push(alerta)
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

export type GastoCreadoImport = { fila: number; id: string; datos: DatosGastoImport; nivel: NivelSobregasto }

export async function aplicarGastosImport(tx: Prisma.TransactionClient, input: AplicarGastosInput): Promise<GastoCreadoImport[]> {
  const creados: GastoCreadoImport[] = []
  const auditoria: CambioInput[] = []
  // One grouped load for the whole batch; every row after this reads the same memory.
  const lote = await cargarSobregastos(tx, [...input.lineas.values()])

  for (const { fila, datos } of input.filas) {
    const linea = input.lineas.get(datos.rubro_id) as LineaGasto
    const sobregasto = lote.critico(linea, datos.cents)
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
        subtotal_cop: decimalFromCents(datos.subtotal),
        iva_cop: decimalFromCents(datos.iva),
        monto_cop: decimalFromCents(datos.cents),
        alerta_sobregasto: sobregasto,
        registrado_por_id: input.usuarioId,
      },
    })
    for (let i = 0; i < datos.enlaces.length; i++) {
      await tx.soporteProyecto.create({
        data: {
          proyecto_id: input.proyectoId,
          gasto_id: created.id,
          subido_por_id: input.usuarioId,
          nombre: `Enlace ${i + 1}`,
          storage_path: null,
          url_externa: datos.enlaces[i],
          tipo_mime: null,
          tamano_bytes: null,
        },
      })
    }

    // S2/L16: after saving, the line tells its level; the critical one also rings the Gerencia bell.
    const nivel = lote.nivel(linea, { periodo: datos.periodo, monto: datos.cents })
    lote.registrar(linea.id, datos.periodo, datos.cents)
    if (sobregasto) await notificarSobregasto(tx, { gastoId: created.id, proyectoId: input.proyectoId })

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
        soportes: datos.enlaces.length,
      },
    })
    creados.push({ fila, id: created.id, datos, nivel })
  }

  await logChanges(tx, auditoria)
  return creados
}
