// Shared overdue-alert engine (Hito 5, PRD §4.4 / §5.3): one source of truth
// for the in-app notifications panel, the dashboard summary and the daily
// cron email (src/app/api/cron/daily). Every caller uses getAlertBuckets with
// the same rule:
//
//   tareas no borradas (deleted_at null), sin fecha_entrega, en estado abierto
//   (OPEN_TASK_STATES) → bucket según su fecha_entrega:
//     vencidos  = fecha < inicio de hoy (local)
//     hoy       = [inicio de hoy, inicio de mañana)
//     proximos3 = [inicio de mañana, +diasPorVencer días) (default 3; el cron
//                 lo toma del setting `automatizaciones`)
//
// Timezone: los límites de día se calculan con el reloj local del servidor
// (deploy Vercel = UTC). El cron de PRD §4.4.1 corre '0 13 * * *' (UTC) que
// es 8:00am hora Colombia (UTC-5); si el host cambia de TZ, ajustar los
// límites en startOfLocalDay.

import type { OrigenTarea, Prisma, TipoNotificacion, Usuario } from "@prisma/client";
import { db } from "@/lib/db";
import { OPEN_TASK_STATES } from "@/lib/api/crm";

/** Inicio del día local del servidor (00:00:00.000). */
export function startOfLocalDay(now = new Date()): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start;
}

/** now + days, en hora local (para las ventanas de proximos3). */
export function addLocalDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export type AlertItem = {
  id: string;
  titulo: string;
  estado: string;
  fecha_entrega: Date;
  origen: OrigenTarea;
  responsable_id: string;
  responsable_nombre: string;
  cliente_id: string | null;
  cliente_nombre: string | null;
};

export type BucketKey = "vencidos" | "hoy" | "proximos3";

export type AlertBuckets = {
  vencidos: AlertItem[];
  hoy: AlertItem[];
  proximos3: AlertItem[];
};

/** Toggles del setting `automatizaciones` aplicados a los buckets. */
export type CategoriasAlerta = {
  vencidos: boolean;
  hoy: boolean;
  proximos: boolean;
};

/** Empty snapshot (no touches the DB) — útil para respuestas "vacías". */
export function emptyAlertBuckets(): AlertBuckets {
  return { vencidos: [], hoy: [], proximos3: [] };
}

/**
 * Aplica los toggles del setting `automatizaciones`: una categoría desactivada
 * se vacía (no se cuenta ni entra al resumen) sin tocar las demás. Devuelve un
 * objeto nuevo; no muta el snapshot de entrada.
 */
export function filterBucketsByCategorias(
  buckets: AlertBuckets,
  categorias: CategoriasAlerta,
): AlertBuckets {
  return {
    vencidos: categorias.vencidos ? buckets.vencidos : [],
    hoy: categorias.hoy ? buckets.hoy : [],
    proximos3: categorias.proximos ? buckets.proximos3 : [],
  };
}

/**
 * Fin del bucket "próximos": inicio de mañana + `diasPorVencer` días. Antes
 * fijo en 3; ahora lo aporta el setting `automatizaciones` (dias_por_vencer).
 */
export function proximosEnd(start: Date, diasPorVencer: number): Date {
  return addLocalDays(start, 1 + diasPorVencer);
}

function bucketDeFecha(fecha: Date, start: Date, endToday: Date, end3: Date): BucketKey | null {
  const t = fecha.getTime();
  if (t < start.getTime()) return "vencidos";
  if (t < endToday.getTime()) return "hoy";
  if (t < end3.getTime()) return "proximos3";
  return null;
}

/**
 * Query para la regla de alertas: tareas abiertas sin borrar con fecha_entrega.
 * scope "own" = responsable_id del usuario; "all" = sin filtro de equipo.
 */
/** Solo necesitamos el id para el filtro de scope y la reconciliación. */
export type AlertUsuario = Pick<Usuario, "id">;

export function alertWhere(scope: "own" | "all", usuario: AlertUsuario): Prisma.TareaWhereInput {
  return {
    deleted_at: null,
    fecha_entrega: { not: null },
    estado: OPEN_TASK_STATES,
    ...(scope === "own" ? { responsable_id: usuario.id } : {}),
  };
}

/**
 * Corazón del motormie de alertas (compartido por panel, dashboard y cron):
 * devuelve las tareas alertables ordenadas por fecha asc repartidas en
 * vencidos / hoy / proximos3. Un solo query + bucket en JS (los límites son
 * locales del servidor y no se pueden expresar en el WHERE de forma estable).
 * `diasPorVencer` es la ventana del bucket "próximos" (default 3; el cron la
 * toma del setting `automatizaciones`).
 */
export async function getAlertBuckets(
  scope: "own" | "all",
  usuario: AlertUsuario,
  diasPorVencer = 3,
): Promise<AlertBuckets> {
  const start = startOfLocalDay();
  const todayEnd = addLocalDays(start, 1);
  const endProximos = proximosEnd(start, diasPorVencer);

  const rows = await db.tarea.findMany({
    where: alertWhere(scope, usuario),
    select: {
      id: true,
      titulo: true,
      estado: true,
      fecha_entrega: true,
      origen: true,
      responsable_id: true,
      responsable: { select: { nombre: true } },
      cliente_id: true,
      cliente: { select: { nombre: true } },
    },
    orderBy: { fecha_entrega: "asc" },
  });

  const buckets: AlertBuckets = { vencidos: [], hoy: [], proximos3: [] };
  for (const row of rows) {
    const fecha = row.fecha_entrega!;
    const key = bucketDeFecha(fecha, start, todayEnd, endProximos);
    if (!key) continue;
    buckets[key].push({
      id: row.id,
      titulo: row.titulo,
      estado: row.estado,
      fecha_entrega: fecha,
      origen: row.origen,
      responsable_id: row.responsable_id,
      responsable_nombre: row.responsable.nombre,
      cliente_id: row.cliente_id,
      cliente_nombre: row.cliente?.nombre ?? null,
    });
  }
  return buckets;
}

/** Tipo de la alerta según bucket y origen (PRD §8.3). */
export function alertTipo(key: BucketKey, origen: OrigenTarea): TipoNotificacion {
  if (key === "vencidos") {
    return origen === "KANBAN" ? "TAREA_VENCIDA" : "COMPROMISO_VENCIDO";
  }
  return "POR_VENCER";
}

/**
 * Reconciliación de los items del snapshot con la tabla notificaciones:
 * 1 fila por (usuario_id, tarea_id), sin borrar nunca las filas previas (las
 * alertas ya leídas que salieron del snapshot quedan como historial).
 * - Fila existente → se actualiza el tipo si cambió (p.ej. POR_VENCER →
 *   COMPROMISO_VENCIDO al vencer) y se CONSERVA leida (decisión del usuario).
 * - Fila faltante → se crea con leida = false (nueva alerta sin leer).
 * Devuelve por tarea_id { notificacion_id, leida } para montar respuestas.
 */
export async function reconcileAlertas(
  usuario: AlertUsuario,
  items: { tarea_id: string; tipo: TipoNotificacion }[],
): Promise<Map<string, { notificacion_id: string; leida: boolean }>> {
  const tareaIds = [...new Set(items.map((i) => i.tarea_id))];
  if (tareaIds.length === 0) return new Map();

  const existing = await db.notificacion.findMany({
    where: { usuario_id: usuario.id, tarea_id: { in: tareaIds } },
    select: { id: true, tarea_id: true, tipo: true, leida: true },
  });
  const byTarea = new Map(existing.map((n) => [n.tarea_id, n]));

  const result = new Map<string, { notificacion_id: string; leida: boolean }>();
  // Upserts en serie: el volumen por snapshot es pequeño (≤ decenas de filas).
  for (const { tarea_id, tipo } of items) {
    const row = byTarea.get(tarea_id);
    if (row) {
      if (row.tipo !== tipo) {
        await db.notificacion.update({ where: { id: row.id }, data: { tipo } });
      }
      result.set(tarea_id, { notificacion_id: row.id, leida: row.leida });
      continue;
    }
    const created = await db.notificacion.create({
      data: { usuario_id: usuario.id, tarea_id, tipo },
      select: { id: true },
    });
    result.set(tarea_id, { notificacion_id: created.id, leida: false });
  }
  return result;
}

/** Marca como leídas las notificaciones del snapshot del usuario; devuelve cuántas cambió. */
export async function markSnapshotRead(
  usuario: AlertUsuario,
  tareaIds: string[],
): Promise<number> {
  const unique = [...new Set(tareaIds)];
  if (unique.length === 0) return 0;
  const res = await db.notificacion.updateMany({
    where: { usuario_id: usuario.id, tarea_id: { in: unique } },
    data: { leida: true },
  });
  return res.count;
}