// GET /api/v1/nav/counts — contadores reales de la barra lateral (reemplazan
// los demo counts). Alcance idéntico al del dashboard (src/lib/dashboard.ts):
// COLABORADOR → "own" (clientes/tareas donde es responsable); el resto de
// roles → "all" (plataforma completa). Documentos: cuenta plana de filas no
// borradas (el repositorio no tiene scope por usuario).

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/supabase/server";
import { OPEN_TASK_STATES } from "@/lib/api/crm";
import { clienteScopeWhere, resolveScope, tareaScopeWhere } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  try {
    const scope = resolveScope(auth.usuario);
    const [clientes, tablero, documentos] = await Promise.all([
      db.cliente.count({ where: clienteScopeWhere(scope, auth.usuario, {}) }),
      db.tarea.count({
        where: tareaScopeWhere(scope, auth.usuario, {}, { estado: OPEN_TASK_STATES }),
      }),
      db.documento.count({ where: { deleted_at: null } }),
    ]);

    return NextResponse.json({ clientes, tablero, documentos });
  } catch (err) {
    console.error("[nav/counts] failed:", err);
    return apiError(
      "No pudimos cargar los contadores. Inténtalo de nuevo.",
      500,
      "INTERNAL_ERROR",
    );
  }
}