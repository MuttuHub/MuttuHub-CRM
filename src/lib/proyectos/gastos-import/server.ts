/**
 * Server side of the expenses import (touches the database; `parse.ts` and `template.ts` are pure).
 *
 * `aplicarGastosImport` runs inside the caller's transaction and writes each DOCUMENT of the file exactly as
 * `POST /expenses` writes an invoice: one `Gasto` header — SUM of the subtotals, SUM of the IVA and the total of
 * its rows — plus its rows in `gastos_reparto`, created in the SAME transaction, with the header on the line of
 * the first row (S9/T14.2-B1). One row per document has one distribution row with its whole total, so a
 * single-row file imports exactly as before. Every imported invoice carries the same early-overspend flag, the
 * same `CREAR`/`gasto` audit shape with the id masked, and ONE shared `lote_id` for the whole import (S7).
 *
 * S9/T14.3: before this, the import was the writer that left `gastos_reparto` empty; with the header and its
 * rows written together, the strict audit of `prisma/gasto-reparto.invariant.test.ts` (`sinReparto = 0`) has no
 * exception left. The single-expense route writes inline and is deliberately not refactored from here: a change
 * to its write must be mirrored in this function (the route tests of both pin the same fields).
 *
 * AJ-06 (S2, S3): the «Enlace del soporte» links of every row of the document (already split and http(s)-validated
 * by `parse.ts`, joined and deduplicated there) become one `SoporteProyecto` per link, created in the SAME
 * transaction right after the gasto it belongs to — so a document with two links creates a gasto with exactly two
 * soportes atomically. A document with no links keeps the previous behaviour: the gasto is created with zero
 * soportes and still needs one attached by hand (B8, unaffected).
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
import type { ContextoImportGastos, DatosFacturaImport, FacturaGastoImport, LineaPresupuestoImport } from "./parse"

export type ContextoServidor = {
  contexto: ContextoImportGastos
  /** The budget line of each line id of the project: the row of the file resolves by its activity and rubro. */
  lineas: Map<string, LineaGasto>
}

/**
 * The rubros a file may name (the ACTIVE catalog plus the project's own lines, so a line of a rubro suspended
 * later still matches) and, per budget line, the line with its assigned amount.
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
      select: {
        id: true,
        monto_proyectado_cop: true,
        rubro: { select: { id: true, codigo: true, nombre: true } },
        actividad: { select: { codigo: true, nombre: true } },
      },
    }),
  ])

  const rubros = new Map(catalogo.map((r) => [r.id, r]))
  const lineas = new Map<string, LineaGasto>()
  const delProyecto: LineaPresupuestoImport[] = []
  for (const linea of lineasRows) {
    rubros.set(linea.rubro.id, linea.rubro)
    const asignado = tieneAsignado(linea.monto_proyectado_cop)
    delProyecto.push({
      id: linea.id,
      rubro_id: linea.rubro.id,
      actividad_codigo: linea.actividad?.codigo ?? null,
      actividad_nombre: linea.actividad?.nombre ?? null,
      asignado,
    })
    if (asignado) lineas.set(linea.id, { id: linea.id, asignado: toCents(linea.monto_proyectado_cop), rubro: linea.rubro })
  }
  return {
    contexto: {
      proyecto,
      rubros: [...rubros.values()],
      lineas: delProyecto,
    },
    lineas,
  }
}

/** The third-party identity of a document: the key of the duplicate lookup, shared by every row of it. */
type TerceroDeFactura = Pick<DatosFacturaImport, "tercero_tipo_id" | "tercero_numero_id" | "numero_documento">

/**
 * RF-21 on the whole invoice (S9: «El control de duplicados … se aplica a la factura completa»): one lookup per
 * document, never one per distribution row. The id is the invoice (`Gasto`) — the parser grouped its rows, so
 * the same document written twice in one file is one invoice and cannot be reported as its own duplicate.
 */
export async function duplicadosDeFactura(
  usuario: Usuario,
  proyectoId: string,
  factura: { id: string; datos: TerceroDeFactura },
): Promise<AlertaGasto[]> {
  const { datos } = factura
  return buscarDuplicados(usuario, {
    id: factura.id,
    proyecto_id: proyectoId,
    estado: "REGISTRADO",
    ...clavesNormalizadas({
      tercero_tipo_id: datos.tercero_tipo_id,
      tercero_numero_id: datos.tercero_numero_id,
      numero_documento: datos.numero_documento,
    }),
  })
}

/** The alerts of one written invoice: the overspend level of its rows and the live duplicates of the document. */
export async function alertasDeFactura(
  usuario: Usuario,
  proyectoId: string,
  factura: { id: string; datos: DatosFacturaImport; nivel: NivelSobregasto },
): Promise<AlertaGasto[]> {
  const alertas: AlertaGasto[] = []
  const alerta = alertaSobregasto(factura.nivel)
  if (alerta) alertas.push(alerta)
  alertas.push(...(await duplicadosDeFactura(usuario, proyectoId, factura)))
  return alertas
}

export type AplicarGastosInput = {
  proyectoId: string
  usuarioId: string
  /** The valid documents of the file (with `datos`), in file order. */
  facturas: readonly (FacturaGastoImport & { datos: DatosFacturaImport })[]
  /** The budget line of each line id of the project, with its assigned amount. */
  lineas: ReadonlyMap<string, LineaGasto>
  loteId: string
}

export type GastoCreadoImport = { fila: number; id: string; datos: DatosFacturaImport; nivel: NivelSobregasto }

/** The level of the invoice as a whole, read row by row: the critical one wins, as `nivelSobregastoDeFactura`. */
function nivelDeFactura(niveles: readonly NivelSobregasto[]): NivelSobregasto {
  if (niveles.includes("ASIGNADO")) return "ASIGNADO"
  if (niveles.includes("PROGRAMADO")) return "PROGRAMADO"
  return null
}

export async function aplicarGastosImport(tx: Prisma.TransactionClient, input: AplicarGastosInput): Promise<GastoCreadoImport[]> {
  const creados: GastoCreadoImport[] = []
  const auditoria: CambioInput[] = []
  // One grouped load for the whole batch; every document after this reads the same memory.
  const lote = await cargarSobregastos(tx, [...input.lineas.values()])

  for (const factura of input.facturas) {
    const { datos } = factura
    const repartos = datos.repartos.map((fila) => ({
      linea: input.lineas.get(fila.linea_id) as LineaGasto,
      valor: fila.valor,
    }))
    // The overspend is checked against each row's own line and assigned amount, never the header's (S9).
    const criticos = repartos.map((reparto) => lote.critico(reparto.linea, reparto.valor))
    const sobregasto = criticos.some(Boolean)
    const cabecera = repartos[0].linea
    const primeraFila = factura.filas[0]
    const claves = clavesNormalizadas({
      tercero_tipo_id: datos.tercero_tipo_id,
      tercero_numero_id: datos.tercero_numero_id,
      numero_documento: datos.numero_documento,
    })
    const created = await tx.gasto.create({
      data: {
        proyecto_id: input.proyectoId,
        linea_id: cabecera.id,
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

    // The header and its distribution land in the same transaction: a failure leaves nothing written.
    await tx.gastoReparto.createMany({
      data: repartos.map((reparto) => ({
        proyecto_id: input.proyectoId,
        gasto_id: created.id,
        linea_id: reparto.linea.id,
        valor: decimalFromCents(reparto.valor),
      })),
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

    // S2/L16: after saving, each line tells its level; the critical one also rings the Gerencia bell.
    const nivel = nivelDeFactura(repartos.map((reparto) => lote.nivel(reparto.linea, { periodo: datos.periodo, monto: reparto.valor })))
    for (const reparto of repartos) lote.registrar(reparto.linea.id, datos.periodo, reparto.valor)
    if (sobregasto) await notificarSobregasto(tx, { gastoId: created.id, proyectoId: input.proyectoId })

    auditoria.push({
      usuario_id: input.usuarioId,
      accion: "CREAR",
      entidad: "gasto",
      entidad_id: created.id,
      proyecto_id: input.proyectoId,
      lote_id: input.loteId,
      valor_nuevo: {
        ...gastoAuditable({ ...created, rubro_id: cabecera.rubro.id }),
        estado: created.estado,
        soportes: datos.enlaces.length,
      },
    })
    creados.push({ fila: primeraFila, id: created.id, datos, nivel })
  }

  await logChanges(tx, auditoria)
  return creados
}
