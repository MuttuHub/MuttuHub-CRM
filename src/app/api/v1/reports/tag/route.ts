// GET /api/v1/reports/tag?etiqueta=&desde=&hasta= — tag report (T2, S2–S5).
//
// Composes sources that already exist (see `lib/reportes/etiqueta.ts`): the portfolio of the projects that
// carry the tag, the tagged clients with their open opportunities and bitácora, and the tagged tasks. Each
// section keeps the access and scope of its source; the opportunities and the pipeline are `null` without
// commercial access. 400 without a tag or with an invalid period.

import { NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { cargarReporteEtiqueta } from "@/lib/reportes/etiqueta";

export const dynamic = "force-dynamic";

export const GET = withApiErrorHandling(
  "reports-tag",
  "No pudimos generar el reporte por etiqueta. Inténtalo de nuevo.",
  async (request: Request) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const result = await cargarReporteEtiqueta(auth.usuario, new URL(request.url));
    if (!result.ok) return result.response;
    return NextResponse.json(result.value);
  },
);
