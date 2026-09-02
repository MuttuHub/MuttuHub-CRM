// GET /api/v1/nav/counts — contadores reales de la barra lateral (reemplazan
// los demo counts). Alcance idéntico al del dashboard (src/lib/dashboard.ts):
// COLABORADOR → "own" (clientes/tareas donde es responsable); el resto de
// roles → "all" (plataforma completa). Documentos: cuenta plana de filas no
// borradas (el repositorio no tiene scope por usuario).

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { OPEN_TASK_STATES } from "@/lib/api/crm";
import { clienteScopeWhere, tareaScopeWhere } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

export const GET = withApiErrorHandling(
  "nav/counts",
  "No pudimos cargar los contadores. Inténtalo de nuevo.",
  async () => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    // PR 3 (close-phase-1): nav/counts is platform-wide for every role
    // (including COLABORADOR). Documentos ya era conteo plano global.
    const scope = "all" as const;
    const [clientes, tablero, documentos] = await Promise.all([
      db.cliente.count({ where: clienteScopeWhere(scope, auth.usuario, {}) }),
      db.tarea.count({
        where: tareaScopeWhere(scope, auth.usuario, {}, { estado: OPEN_TASK_STATES }),
      }),
      db.documento.count({ where: { deleted_at: null } }),
    ]);

    return NextResponse.json({ clientes, tablero, documentos });
  },
);
