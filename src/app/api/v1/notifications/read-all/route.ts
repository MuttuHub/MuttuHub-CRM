// PATCH /api/v1/notifications/read-all — marca leidas todas las filas del
// snapshot actual del usuario (PRD §8.2). Recalcula el snapshot igual que
// GET (mismo motor, mismas reglas de alcance) y hace updateMany sobre las
// tarea_id incluidas. Documentado: las filas de alertas que ya salieron del
// snapshot (tarea completada/borrada) no se tocan — el "todas" es sobre lo
// visible ahora. V8: incluye los recordatorios y las alertas «sin contacto» visibles.

import { NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { markSnapshotRead } from "@/lib/alerts";
import { marcarNotificacionesProyectoLeidas } from "@/lib/api/notificaciones-proyecto";
import { marcarSinContactoLeidas } from "@/lib/automatizaciones/notificaciones";
import { buildSnapshot } from "@/app/api/v1/notifications/route";

export const dynamic = "force-dynamic";

export const PATCH = withApiErrorHandling(
  "notifications",
  "No pudimos marcar las notificaciones como leídas. Inténtalo de nuevo.",
  async () => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    const scope = auth.usuario.rol === "COLABORADOR" ? "own" : "all";
    const snapshot = await buildSnapshot(auth.usuario, scope);
    const tareaIds = [
      ...snapshot.vencidos,
      ...snapshot.hoy,
      ...snapshot.proximos3,
      ...snapshot.recordatorios,
    ].map((item) => item.id);
    const sinContactoIds = snapshot.sin_contacto.map((item) => item.notificacion_id);

    const updated =
      (await markSnapshotRead(auth.usuario, tareaIds)) +
      (await marcarNotificacionesProyectoLeidas(auth.usuario)) +
      (await marcarSinContactoLeidas(auth.usuario, sinContactoIds));
    return NextResponse.json({ ok: true, updated });
  },
);
