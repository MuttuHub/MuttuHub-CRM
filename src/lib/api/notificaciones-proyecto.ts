// Project notifications (S6 U4). There is no generic "create a notification" helper: task
// rows are created by `reconcileAlertas` at read time. Project rows are created here, inside
// the transaction that raises the condition, so the flag and the notification commit together.

import type { Prisma } from "@prisma/client";
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

// ---------------------------------------------------------------------------
// Reads for the notifications snapshot (GET /api/v1/notifications, read-all)
// ---------------------------------------------------------------------------

export const SOBREGASTO_MENSAJE = "Gasto supera el asignado del rubro";

/** Only GERENCIA receives overspend notifications (ADM sees the flag in the lists and the queue). */
export function recibeNotificacionesProyecto(usuario: { rol: string }): boolean {
  return usuario.rol === "GERENCIA";
}

export type NotificacionProyectoItem = {
  notificacion_id: string;
  tipo: "SOBREGASTO_RUBRO";
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
  if (!recibeNotificacionesProyecto(usuario)) return [];
  const rows = await db.notificacion.findMany({
    where: { usuario_id: usuario.id, tipo: "SOBREGASTO_RUBRO" },
    select: {
      id: true,
      leida: true,
      proyecto_id: true,
      gasto_id: true,
      created_at: true,
      proyecto: { select: { codigo: true } },
    },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    take: 50,
  });
  return rows.map((row) => ({
    notificacion_id: row.id,
    tipo: "SOBREGASTO_RUBRO" as const,
    mensaje: SOBREGASTO_MENSAJE,
    proyecto_id: row.proyecto_id,
    proyecto_codigo: row.proyecto?.codigo ?? null,
    gasto_id: row.gasto_id,
    leida: row.leida,
    created_at: row.created_at.toISOString(),
  }));
}

/** read-all: marks the actor's unread project rows. Returns how many changed. */
export async function marcarNotificacionesProyectoLeidas(usuario: { id: string; rol: string }): Promise<number> {
  if (!recibeNotificacionesProyecto(usuario)) return 0;
  const { count } = await db.notificacion.updateMany({
    where: { usuario_id: usuario.id, tipo: "SOBREGASTO_RUBRO", leida: false },
    data: { leida: true },
  });
  return count;
}
