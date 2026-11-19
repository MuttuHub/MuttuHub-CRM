// GET /api/v1/departamentos — V5 (odd/tasks/producto-pendientes-2026-11.md, S3, decision L8): the
// official departamentos a client can carry, read from the municipios catalogue (one entry per
// distinct `municipios.departamento`). Any signed-in user reads it; the catalogue itself is
// administered through /api/v1/municipalities.

import { NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { listarDepartamentos } from "@/lib/api/mapa-aliados";

export const dynamic = "force-dynamic";

export const GET = withApiErrorHandling(
  "departamentos",
  "No pudimos cargar los departamentos. Inténtalo de nuevo.",
  async () => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    return NextResponse.json({ departamentos: await listarDepartamentos() });
  },
);
