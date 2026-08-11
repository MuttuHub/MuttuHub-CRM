// GET /api/v1/solicitudes-acceso — admin queue of public access requests
// (PRD §3.1). ADMINISTRADOR only (requireApiRole answers 401/403 JSON).
// Ordered newest-first; the UI splits PENDIENTE vs history locally.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
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

export async function GET() {
  const auth = await requireApiRole(["ADMINISTRADOR"]);
  if (!auth.ok) return auth.response;

  try {
    const solicitudes = await db.solicitudAcceso.findMany({
      select: SOLICITUD_SELECT,
      orderBy: { created_at: "desc" },
    });
    return NextResponse.json({ solicitudes });
  } catch (err) {
    console.error("[solicitudes-acceso] list failed:", err);
    return apiError(
      "No pudimos cargar las solicitudes. Inténtalo de nuevo.",
      500,
      "INTERNAL_ERROR",
    );
  }
}