// V8 automation rules (odd/tasks/producto-pendientes-2026-11.md, S4), run by the daily cron:
//
//   1. «Recordar compromisos N días antes» (`recordar_compromisos`, default on, 2): open tasks
//      whose fecha_entrega falls exactly N calendar days from today (the alert engine's local day,
//      same boundaries as its buckets). Recipient: the task's responsable.
//   2. «Alertar N días sin contacto» (`alertar_sin_contacto`, default on, 30): active clients
//      (estado not INACTIVO / CERRADO, the user's «Solo activos») with N or more Bogotá days since
//      their last bitácora entry, or since their creation when they have none, so a new client
//      alerts only after N days. The day count reuses `diasSinGestion`; the clients list keeps
//      its own definition (no entry = without management). Recipient: the client's responsable.
//
// Each event notifies through three channels: (a) a section of the daily digest (the cron passes
// the items to `sendDailySummary`), (b) its own e-mail queued in the outbox and (c) an in-app
// `Notificacion`. Reruns are idempotent:
//   - rule 1: outbox key `recordatorio/<tareaId>/<due date>`; the POR_VENCER row goes through
//     `reconcileAlertas`, the bell's own one-row-per-(usuario, tarea) reconciliation.
//   - rule 2: outbox key `sin-contacto/<clienteId>/<last contact date | creation date>`, so a client
//     alerts once per stretch without contact, not every day; a new (or first) contact starts a new
//     stretch.
//     The SIN_CONTACTO row (one per usuario + cliente) is written or re-armed as unread in the same
//     transaction, only when the e-mail was newly queued.
// Inactive and ADMINISTRADOR responsables get no e-mail or notification (the digest already
// excludes ADMINISTRADOR, PRD §4.4.1).

import type { EstadoCliente, OrigenTarea, RolUsuario } from "@prisma/client";
import { db } from "@/lib/db";
import { addLocalDays, reconcileAlertas, startOfLocalDay, type AlertItem } from "@/lib/alerts";
import { OPEN_TASK_STATES } from "@/lib/api/crm";
import { diasSinGestion, ultimoContactoPorCliente } from "@/lib/api/sin-gestion";
import { buildRecordatorioEmail, buildSinContactoEmail, fechaCorta } from "@/lib/email";
import { enqueueEmail } from "@/lib/email/outbox";
import { todayInBogota } from "@/lib/proyectos/weeks";
import type { Automatizaciones } from "@/lib/settings";

type Responsable = { nombre: string; email: string; activo: boolean; rol: RolUsuario };

export type RecordatorioItem = AlertItem & { responsable: Responsable };

export type SinContactoItem = {
  id: string;
  nombre: string;
  responsable_id: string;
  responsable_nombre: string;
  /** Latest bitácora entry; null when the client was never contacted. */
  ultimo_contacto: Date | null;
  /** Days since that entry, or since the client's creation when there is none. */
  dias_sin_gestion: number | null;
};

/** `desde` starts the stretch: the last contact, or the creation date without any. */
type SinContactoCandidato = SinContactoItem & { responsable: Responsable; desde: Date };

/** «Solo activos»: rule 2 never alerts these client states. */
export const ESTADOS_SIN_ALERTA: EstadoCliente[] = ["INACTIVO", "CERRADO"];

const TIPO_CORREO_RECORDATORIO = "RECORDATORIO_COMPROMISO";
const TIPO_CORREO_SIN_CONTACTO = "SIN_CONTACTO";

function recibeAvisos(responsable: Responsable): boolean {
  return responsable.activo && responsable.rol !== "ADMINISTRADOR";
}

/** Open, non-deleted tasks due in [desde, hasta), optionally only one responsable's. */
export async function findTareasAbiertasEntre(
  desde: Date,
  hasta: Date,
  responsableId?: string,
): Promise<RecordatorioItem[]> {
  const rows = await db.tarea.findMany({
    where: {
      deleted_at: null,
      estado: OPEN_TASK_STATES,
      fecha_entrega: { gte: desde, lt: hasta },
      ...(responsableId ? { responsable_id: responsableId } : {}),
    },
    select: {
      id: true,
      titulo: true,
      estado: true,
      fecha_entrega: true,
      origen: true,
      responsable_id: true,
      responsable: { select: { nombre: true, email: true, activo: true, rol: true } },
      cliente_id: true,
      cliente: { select: { nombre: true } },
    },
    orderBy: { fecha_entrega: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    titulo: row.titulo,
    estado: row.estado,
    fecha_entrega: row.fecha_entrega!,
    origen: row.origen as OrigenTarea,
    responsable_id: row.responsable_id,
    responsable_nombre: row.responsable.nombre,
    responsable: row.responsable,
    cliente_id: row.cliente_id,
    cliente_nombre: row.cliente?.nombre ?? null,
  }));
}

/** Rule 1: open, non-deleted tasks due on the local day `dias` days from today. */
async function findRecordatorios(dias: number): Promise<RecordatorioItem[]> {
  const start = startOfLocalDay();
  return findTareasAbiertasEntre(addLocalDays(start, dias), addLocalDays(start, dias + 1));
}

/** Rule 2: active, non-deleted clients with `dias` or more days since their last contact or creation. */
async function findSinContacto(dias: number): Promise<SinContactoCandidato[]> {
  const clientes = await db.cliente.findMany({
    where: { deleted_at: null, estado: { notIn: ESTADOS_SIN_ALERTA } },
    select: {
      id: true,
      nombre: true,
      created_at: true,
      responsable_id: true,
      responsable: { select: { nombre: true, email: true, activo: true, rol: true } },
    },
    orderBy: { nombre: "asc" },
  });
  const ultimos = await ultimoContactoPorCliente(clientes.map((c) => c.id));
  const hoy = todayInBogota();

  const result: SinContactoCandidato[] = [];
  for (const cliente of clientes) {
    const ultimo = ultimos.get(cliente.id) ?? null;
    const desde = ultimo ?? cliente.created_at;
    const diasSin = diasSinGestion(desde, hoy)!;
    if (diasSin < dias) continue;
    result.push({
      id: cliente.id,
      nombre: cliente.nombre,
      responsable_id: cliente.responsable_id,
      responsable_nombre: cliente.responsable.nombre,
      responsable: cliente.responsable,
      ultimo_contacto: ultimo,
      dias_sin_gestion: diasSin,
      desde,
    });
  }
  return result;
}

/** Rule 1, channels (b) and (c). Returns whether the e-mail was newly queued. */
async function notificarRecordatorio(item: RecordatorioItem, dias: number): Promise<boolean> {
  const correo = buildRecordatorioEmail(item, dias);
  const { enqueued } = await enqueueEmail(db, {
    to: item.responsable.email,
    subject: correo.subject,
    html: correo.html,
    tipo: TIPO_CORREO_RECORDATORIO,
    idempotencyKey: `recordatorio/${item.id}/${fechaCorta(item.fecha_entrega)}`,
    usuarioId: item.responsable_id,
  });
  await reconcileAlertas({ id: item.responsable_id }, [{ tarea_id: item.id, tipo: "POR_VENCER" }]);
  return enqueued;
}

/** Rule 2, channels (b) and (c), atomically. Returns whether the e-mail was newly queued. */
async function notificarSinContacto(item: SinContactoCandidato, dias: number): Promise<boolean> {
  const correo = buildSinContactoEmail(item, dias);
  const tramo = todayInBogota(item.desde);
  return db.$transaction(async (tx) => {
    const { enqueued } = await enqueueEmail(tx, {
      to: item.responsable.email,
      subject: correo.subject,
      html: correo.html,
      tipo: TIPO_CORREO_SIN_CONTACTO,
      idempotencyKey: `sin-contacto/${item.id}/${tramo}`,
      usuarioId: item.responsable_id,
    });
    if (enqueued) {
      await tx.notificacion.upsert({
        where: {
          usuario_id_tipo_cliente_id: {
            usuario_id: item.responsable_id,
            tipo: "SIN_CONTACTO",
            cliente_id: item.id,
          },
        },
        create: { usuario_id: item.responsable_id, tipo: "SIN_CONTACTO", cliente_id: item.id },
        update: { leida: false, created_at: new Date() },
      });
    }
    return enqueued;
  });
}

export type ReglasRun = {
  /** null when the rule is off. */
  recordatorios: { dias: number; items: RecordatorioItem[] } | null;
  sinContacto: { dias: number; items: SinContactoItem[] } | null;
  /** E-mails newly queued in this run (a same-day rerun queues 0). */
  enqueued: number;
};

/** Runs the active rules: finds their events and fires channels (b) and (c) for each. */
export async function runReglas(
  automatizaciones: Pick<Automatizaciones, "recordar_compromisos" | "alertar_sin_contacto">,
): Promise<ReglasRun> {
  const run: ReglasRun = { recordatorios: null, sinContacto: null, enqueued: 0 };

  const recordar = automatizaciones.recordar_compromisos;
  if (recordar.activo) {
    const items = await findRecordatorios(recordar.dias);
    for (const item of items) {
      if (recibeAvisos(item.responsable) && (await notificarRecordatorio(item, recordar.dias))) run.enqueued += 1;
    }
    run.recordatorios = { dias: recordar.dias, items };
  }

  const sinContacto = automatizaciones.alertar_sin_contacto;
  if (sinContacto.activo) {
    const items = await findSinContacto(sinContacto.dias);
    for (const item of items) {
      if (recibeAvisos(item.responsable) && (await notificarSinContacto(item, sinContacto.dias))) run.enqueued += 1;
    }
    run.sinContacto = { dias: sinContacto.dias, items };
  }

  return run;
}
