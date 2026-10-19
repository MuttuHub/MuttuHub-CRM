// Project notifications (S6 U4). There is no generic "create a notification" helper: task
// rows are created by `reconcileAlertas` at read time. Project rows are created here, inside
// the transaction that raises the condition, so the flag and the notification commit together.

import type { Prisma, TipoNotificacion } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Overspend: one SOBREGASTO_RUBRO row per active GERENCIA user. The unique key
 * (usuario_id, tipo, gasto_id) plus `skipDuplicates` keeps a repeated blocked attempt at a
 * single row per recipient. Returns the number of rows actually created.
 */
export async function notificarSobregasto(
  tx: Pick<Prisma.TransactionClient, "usuario" | "notificacion">,
  input: { gastoId: string; proyectoId: string },
): Promise<number> {
  const destinatarios = await tx.usuario.findMany({
    where: { rol: "GERENCIA", activo: true },
    select: { id: true },
  });
  if (destinatarios.length === 0) return 0;
  const { count } = await tx.notificacion.createMany({
    data: destinatarios.map((usuario) => ({
      usuario_id: usuario.id,
      tipo: "SOBREGASTO_RUBRO" as const,
      proyecto_id: input.proyectoId,
      gasto_id: input.gastoId,
    })),
    skipDuplicates: true,
  });
  return count;
}

/**
 * M7: a rejected expense notifies its author (`registrado_por_id`). One row per (author, expense):
 * a repeated rejection (after the author corrected the expense) re-arms the same row as unread
 * instead of colliding with the unique key. The rejecter never notifies themselves. The reason is
 * not copied: it is read from the expense when the notification is listed. Returns whether a row
 * was written.
 */
export async function notificarGastoRechazado(
  tx: Pick<Prisma.TransactionClient, "notificacion">,
  input: { gastoId: string; proyectoId: string; autorId: string; rechazadoPorId: string },
): Promise<boolean> {
  if (input.autorId === input.rechazadoPorId) return false;
  await tx.notificacion.upsert({
    where: {
      usuario_id_tipo_gasto_id: { usuario_id: input.autorId, tipo: "GASTO_RECHAZADO", gasto_id: input.gastoId },
    },
    create: {
      usuario_id: input.autorId,
      tipo: "GASTO_RECHAZADO",
      proyecto_id: input.proyectoId,
      gasto_id: input.gastoId,
    },
    update: { leida: false, proyecto_id: input.proyectoId, created_at: new Date() },
  });
  return true;
}

// ---------------------------------------------------------------------------
// Reads for the notifications snapshot (GET /api/v1/notifications, read-all)
// ---------------------------------------------------------------------------

export const SOBREGASTO_MENSAJE = "Gasto supera el asignado del rubro";

export const GASTO_RECHAZADO_TITULO = "Gasto rechazado";

/** Only GERENCIA receives overspend notifications (ADM sees the flag in the lists and the queue). */
export function recibeNotificacionesProyecto(usuario: { rol: string }): boolean {
  return usuario.rol === "GERENCIA";
}

/**
 * Types of project notification an actor can read. A rejected-expense notification is addressed to
 * its author whatever their role; overspend stays GERENCIA-only. Rows are always filtered by the
 * actor's own `usuario_id`, so widening the types never exposes another user's rows.
 */
export function tiposNotificacionProyecto(usuario: { rol: string }): TipoNotificacion[] {
  return recibeNotificacionesProyecto(usuario)
    ? ["SOBREGASTO_RUBRO", "GASTO_RECHAZADO"]
    : ["GASTO_RECHAZADO"];
}

const montoFormat = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

type GastoMensaje = {
  tercero_nombre: string;
  numero_documento: string;
  monto_cop: { toString(): string } | number;
  motivo_rechazo: string | null;
} | null;

/** "Proveedor SAS · FE-1 · $ 1.000.000. Motivo: ..." (just the title when the expense is gone or corrected). */
function mensajeGastoRechazado(gasto: GastoMensaje): string {
  if (!gasto) return GASTO_RECHAZADO_TITULO;
  const monto = `$ ${montoFormat.format(Number(gasto.monto_cop.toString()))}`;
  const identidad = [gasto.tercero_nombre, gasto.numero_documento, monto].filter(Boolean).join(" · ");
  return gasto.motivo_rechazo ? `${identidad}. Motivo: ${gasto.motivo_rechazo}` : identidad;
}

export type NotificacionProyectoItem = {
  notificacion_id: string;
  tipo: "SOBREGASTO_RUBRO" | "GASTO_RECHAZADO";
  mensaje: string;
  proyecto_id: string | null;
  proyecto_codigo: string | null;
  gasto_id: string | null;
  leida: boolean;
  created_at: string;
};

/** The actor's own project notifications, newest first (bounded: the bell is a snapshot). */
export async function listarNotificacionesProyecto(usuario: {
  id: string;
  rol: string;
}): Promise<NotificacionProyectoItem[]> {
  const rows = await db.notificacion.findMany({
    where: { usuario_id: usuario.id, tipo: { in: tiposNotificacionProyecto(usuario) } },
    select: {
      id: true,
      tipo: true,
      leida: true,
      proyecto_id: true,
      gasto_id: true,
      created_at: true,
      proyecto: { select: { codigo: true } },
      gasto: { select: { tercero_nombre: true, numero_documento: true, monto_cop: true, motivo_rechazo: true } },
    },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    take: 50,
  });
  return rows.map((row) => ({
    notificacion_id: row.id,
    tipo: row.tipo === "GASTO_RECHAZADO" ? ("GASTO_RECHAZADO" as const) : ("SOBREGASTO_RUBRO" as const),
    mensaje: row.tipo === "GASTO_RECHAZADO" ? mensajeGastoRechazado(row.gasto) : SOBREGASTO_MENSAJE,
    proyecto_id: row.proyecto_id,
    proyecto_codigo: row.proyecto?.codigo ?? null,
    gasto_id: row.gasto_id,
    leida: row.leida,
    created_at: row.created_at.toISOString(),
  }));
}

/** read-all: marks the actor's unread project rows. Returns how many changed. */
export async function marcarNotificacionesProyectoLeidas(usuario: { id: string; rol: string }): Promise<number> {
  const { count } = await db.notificacion.updateMany({
    where: { usuario_id: usuario.id, tipo: { in: tiposNotificacionProyecto(usuario) }, leida: false },
    data: { leida: true },
  });
  return count;
}
