// PATCH /api/v1/notifications/read-all — marca leidas todas las filas del
// snapshot actual del usuario (PRD §8.2). Recalcula el snapshot igual que
// GET (mismo motor, mismas reglas de alcance) y hace updateMany sobre las
// tarea_id incluidas. Documentado: las filas de alertas que ya salieron del
// snapshot (tarea completada/borrada) no se tocan — el "todas" es sobre lo
// visible ahora.

import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/supabase/server";
import { markSnapshotRead } from "@/lib/alerts";
import { buildSnapshot } from "@/app/api/v1/notifications/route";

export const dynamic = "force-dynamic";

export async function PATCH() {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  try {
    const scope = auth.usuario.rol === "COLABORADOR" ? "own" : "all";
    const snapshot = await buildSnapshot(auth.usuario, scope);
    const tareaIds = [
      ...snapshot.vencidos,
      ...snapshot.hoy,
      ...snapshot.proximos3,
    ].map((item) => item.id);

    const updated = await markSnapshotRead(auth.usuario, tareaIds);
    return NextResponse.json({ ok: true, updated });
  } catch (err) {
    console.error("[notifications] read-all failed:", err);
    return apiError("No pudimos marcar las notificaciones como leídas. Inténtalo de nuevo.", 500, "INTERNAL_ERROR");
  }
}