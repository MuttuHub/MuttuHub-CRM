// GET /api/v1/catalogs/users — minimal user catalog for the "responsable"
// selects in the CRM/Kanban forms. The PRD never defines a dedicated user
// directory endpoint, so this minimal projection (id + nombre, only active
// usuarios) fills that gap without leaking emails or roles. Any authenticated
// user may read it.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  try {
    const users = await db.usuario.findMany({
      where: { activo: true },
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true },
    });
    return NextResponse.json({ users });
  } catch (err) {
    console.error("[catalogs/users] failed:", err);
    return apiError("No pudimos cargar los usuarios. Inténtalo de nuevo.", 500, "INTERNAL_ERROR");
  }
}