// V8 channel (c), read side: what the notification bell (GET /api/v1/notifications) shows for the
// two automation rules.
//
//   - «Sin contacto»: the actor's own SIN_CONTACTO rows (written by the daily cron, see reglas.ts)
//     whose stretch is still open: the client exists, is still active («Solo activos») and has had
//     no contact since the row was raised. The message counts the days like the rule does (since
//     the last contact, or since the client's creation without any).
//   - Reminders: the actor's own open tasks due within `recordar_compromisos.dias` days that the
//     bell's fixed «próximos 3 días» bucket does not already show. They reuse the bucket rows'
//     reconciliation (one POR_VENCER row per usuario + tarea), so read/unread behaves the same.

import { db } from "@/lib/db";
import { addLocalDays, proximosEnd, startOfLocalDay } from "@/lib/alerts";
import { diasSinGestion, ultimoContactoPorCliente } from "@/lib/api/sin-gestion";
import { todayInBogota } from "@/lib/proyectos/weeks";
import type { ReglaAutomatizacion } from "@/lib/settings";
import { ESTADOS_SIN_ALERTA, findTareasAbiertasEntre, type RecordatorioItem } from "./reglas";

/** Window of the bell's «próximos» bucket (GET /api/v1/notifications uses the engine default). */
const BELL_DIAS_POR_VENCER = 3;

export type NotificacionSinContactoItem = {
  notificacion_id: string;
  tipo: "SIN_CONTACTO";
  cliente_id: string;
  cliente_nombre: string;
  dias_sin_contacto: number;
  mensaje: string;
  leida: boolean;
  created_at: string;
};

function mensajeSinContacto(nombre: string, dias: number): string {
  return `${nombre} lleva ${dias === 1 ? "1 día" : `${dias} días`} sin contacto`;
}

/** The actor's open «sin contacto» notifications, newest first (bounded, like the project rows). */
export async function listarSinContacto(usuario: { id: string }): Promise<NotificacionSinContactoItem[]> {
  const rows = await db.notificacion.findMany({
    where: {
      usuario_id: usuario.id,
      tipo: "SIN_CONTACTO",
      cliente: { is: { deleted_at: null, estado: { notIn: ESTADOS_SIN_ALERTA } } },
    },
    select: {
      id: true,
      leida: true,
      created_at: true,
      cliente_id: true,
      cliente: { select: { nombre: true, created_at: true } },
    },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    take: 50,
  });
  const conCliente = rows.filter((row) => Boolean(row.cliente_id && row.cliente));
  const ultimos = await ultimoContactoPorCliente([...new Set(conCliente.map((row) => row.cliente_id!))]);
  const hoy = todayInBogota();

  const items: NotificacionSinContactoItem[] = [];
  for (const row of conCliente) {
    const ultimo = ultimos.get(row.cliente_id!) ?? null;
    // A contact logged after the alert closes its stretch: the row stays as history, unlisted.
    if (ultimo !== null && ultimo.getTime() > row.created_at.getTime()) continue;
    const dias = diasSinGestion(ultimo ?? row.cliente!.created_at, hoy)!;
    items.push({
      notificacion_id: row.id,
      tipo: "SIN_CONTACTO",
      cliente_id: row.cliente_id!,
      cliente_nombre: row.cliente!.nombre,
      dias_sin_contacto: dias,
      mensaje: mensajeSinContacto(row.cliente!.nombre, dias),
      leida: row.leida,
      created_at: row.created_at.toISOString(),
    });
  }
  return items;
}

/** read-all: marks the given (visible) SIN_CONTACTO rows of the actor. Returns how many changed. */
export async function marcarSinContactoLeidas(usuario: { id: string }, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const { count } = await db.notificacion.updateMany({
    where: { usuario_id: usuario.id, tipo: "SIN_CONTACTO", id: { in: ids }, leida: false },
    data: { leida: true },
  });
  return count;
}

/**
 * Rule-1 reminders the bell must add: the actor's own open tasks due from tomorrow through
 * `regla.dias` days, minus those already in a bucket. Empty when the rule is off or its window
 * fits inside the bell's «próximos» bucket.
 */
export async function recordatoriosParaCampana(
  usuario: { id: string },
  regla: ReglaAutomatizacion,
  yaVisibles: ReadonlySet<string>,
): Promise<RecordatorioItem[]> {
  if (!regla.activo || regla.dias <= BELL_DIAS_POR_VENCER) return [];
  const start = startOfLocalDay();
  const tareas = await findTareasAbiertasEntre(
    proximosEnd(start, BELL_DIAS_POR_VENCER),
    addLocalDays(start, regla.dias + 1),
    usuario.id,
  );
  return tareas.filter((tarea) => !yaVisibles.has(tarea.id));
}
