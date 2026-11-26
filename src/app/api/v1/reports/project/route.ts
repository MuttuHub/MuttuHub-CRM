// GET /api/v1/reports/project?proyecto_id= — project report (T9a, S15–S17).
//
// Composes sources that already exist (see `lib/reportes/proyecto.ts`): the project with the ficha's read
// scope, its allies with their contributions, the opportunities of the project and its allies, the bitácora
// entries about the project and its tasks. Opportunities are `null` without commercial access. 400 without a
// project, 404 for a missing project and 403 for one the user cannot read, like the ficha.

import { NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { cargarReporteProyecto } from "@/lib/reportes/proyecto";

export const dynamic = "force-dynamic";

export const GET = withApiErrorHandling(
  "reports-project",
  "No pudimos generar el reporte del proyecto. Inténtalo de nuevo.",
  async (request: Request) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const result = await cargarReporteProyecto(auth.usuario, new URL(request.url));
    if (!result.ok) return result.response;
    return NextResponse.json(result.value);
  },
);
