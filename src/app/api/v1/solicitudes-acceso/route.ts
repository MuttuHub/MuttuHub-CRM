// GET /api/v1/solicitudes-acceso — admin queue of public access requests
// (PRD §3.1). ADMINISTRADOR only (requireApiRole answers 401/403 JSON).
// Ordered newest-first; the UI splits PENDIENTE vs history locally.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiRole } from "@/lib/supabase/server";

const SOLICITUD_SELECT = {
  id: true,
  nombre: true,
  email: true,
  cargo: true,
  origen: true,
  estado: true,
  revisado_por: true,
  revisado_at: true,
  created_at: true,
} as const;

export const GET = withApiErrorHandling(
  "solicitudes-acceso",
  "No pudimos cargar las solicitudes. Inténtalo de nuevo.",
  async () => {
    const auth = await requireApiRole(["ADMINISTRADOR"]);
    if (!auth.ok) return auth.response;

    const solicitudes = await db.solicitudAcceso.findMany({
      select: SOLICITUD_SELECT,
      orderBy: { created_at: "desc" },
    });
    return NextResponse.json({ solicitudes });
  },
);
