// GET /api/v1/rubros — catálogo único de rubros v2 (REQ-CAT-01).
// Cualquier usuario autenticado lee los 15 rubros activos ordenados por código.
// Las filas CON código son exactamente RUBROS_V2; las filas sin código (las v1
// "Material POP" y "Operación logística") quedan fuera porque la migración
// adoptiva las suspende y nunca se ofrecen a un proyecto.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const RUBRO_SELECT = {
  id: true,
  codigo: true,
  nombre: true,
  activo: true,
  orden: true,
  created_at: true,
  updated_at: true,
} as const;

export const GET = withApiErrorHandling(
  "rubros",
  "No pudimos cargar los rubros. Inténtalo de nuevo.",
  async () => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    const rubros = await db.rubro.findMany({
      where: { activo: true, codigo: { not: null } },
      orderBy: { codigo: "asc" },
      select: RUBRO_SELECT,
    });
    return NextResponse.json({ rubros });
  },
);
