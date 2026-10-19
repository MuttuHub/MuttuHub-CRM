// GET /api/v1/notifications — panel de alertas (PRD §8.2 + §4.4).
// Computa el snapshot con el motor compartido (src/lib/alerts.ts) y
// reconcilia la tabla notificaciones: 1 fila por (usuario_id, tarea_id),
// leida = decisión del usuario (nunca se resetea en recomputes).
//
// Alcance (PRD §4.4.1): COLABORADOR → sus propias tareas; COORDINADOR /
// GERENCIA / ADMINISTRADOR → todas (el admin ve el panel pero no recibe
// correo). Params: ?leida=false filtra solo las alertas sin leer (badge de
// la campana). Respuesta:
//
//   { total, vencidos: AlertItemNotif[], hoy: [], proximos3: [],
//     leidas_ids: string[] }
//
// Cada item lleva `notificacion_id` (id de la fila Notificacion del snapshot,
// null si la reconciliación falló) para que el UI llame a
// PATCH /api/v1/notifications/:id/read.

import { NextResponse } from "next/server";
import type { Usuario } from "@prisma/client";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import {
  alertTipo,
  getAlertBuckets,
  reconcileAlertas,
  type AlertItem,
} from "@/lib/alerts";

export const dynamic = "force-dynamic";

/** AlertItem + su fila de la tabla notificaciones (nullable). */
export type AlertItemNotificacion = AlertItem & {
  notificacion_id: string | null;
};

/** Snapshot del panel: buckets ya decorados con notificacion_id. */
export type NotificationsSnapshot = {
  total: number;
  vencidos: AlertItemNotificacion[];
  hoy: AlertItemNotificacion[];
  proximos3: AlertItemNotificacion[];
  leidas_ids: string[];
};

/**
 * Snapshot compartido por GET y read-all: buckets del motor + reconciliación
 * de la tabla notificaciones (crea las filas faltantes, conserva leida).
 */
export async function buildSnapshot(usuario: Usuario, scope: "own" | "all"): Promise<NotificationsSnapshot> {
  const buckets = await getAlertBuckets(scope, usuario);

  const flat = (
    [
      ["vencidos", buckets.vencidos],
      ["hoy", buckets.hoy],
      ["proximos3", buckets.proximos3],
    ] as const
  ).flatMap(([key, items]) =>
    items.map((item) => ({ tarea_id: item.id, tipo: alertTipo(key, item.origen) })),
  );

  const rows = await reconcileAlertas(usuario, flat);

  const decorate = (items: AlertItem[]): AlertItemNotificacion[] =>
    items.map((item) => ({
      ...item,
      notificacion_id: rows.get(item.id)?.notificacion_id ?? null,
    }));

  const vencidos = decorate(buckets.vencidos);
  const hoy = decorate(buckets.hoy);
  const proximos3 = decorate(buckets.proximos3);

  return {
    total: vencidos.length + hoy.length + proximos3.length,
    vencidos,
    hoy,
    proximos3,
    leidas_ids: [...rows.values()].filter((r) => r.leida).map((r) => r.notificacion_id),
  };
}

export const GET = withApiErrorHandling(
  "notifications",
  "No pudimos cargar las notificaciones. Inténtalo de nuevo.",
  async (request: Request) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    const scope = auth.usuario.rol === "COLABORADOR" ? "own" : "all";
    const snapshot = await buildSnapshot(auth.usuario, scope);

    const soloNoLeidas = new URL(request.url).searchParams.get("leida") === "false";
    // ?leida=false → solo alertas cuya fila existe y está sin leer (las
    // recién creadas cuentan como sin leer); los items sin fila (reconcile
    // falló) quedan fuera por no poder garantizar el estado.
    const filter = (items: AlertItemNotificacion[]) =>
      soloNoLeidas
        ? items.filter((i) => i.notificacion_id !== null && !snapshot.leidas_ids.includes(i.notificacion_id!))
        : items;

    const vencidos = filter(snapshot.vencidos);
    const hoy = filter(snapshot.hoy);
    const proximos3 = filter(snapshot.proximos3);

    return NextResponse.json({
      total: vencidos.length + hoy.length + proximos3.length,
      vencidos,
      hoy,
      proximos3,
      leidas_ids: snapshot.leidas_ids,
    });
  },
);