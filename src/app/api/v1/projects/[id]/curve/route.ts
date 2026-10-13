// GET /api/v1/projects/:id/curve?base=vigente|original — the S-curve (S14 P7).
//
// TWO curves that never mix: the technical one (planned linear by days at month end, D1, and at the corte
// date for the corte month, D13; executed = real progress at each period) and the financial one (planned = cumulative
// programmed / assigned, executed = cumulative validated / assigned). `ejecutado` is null
// for every period after the corte. `base=vigente` (default) reads the live structure and
// budget; `base=original` the weeks, weights and A/P frozen in version 0 with the same live
// avances and expenses. Readable in any estado by whoever can read the project
// (404 -> 403 -> 409 -> 400).

import { NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { gateEjecucionRead } from "@/lib/api/ejecucion";
import { calcularCurva } from "@/lib/api/curva";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos calcular la curva. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const gate = await gateEjecucionRead(auth.usuario, id);
    if (!gate.ok) return gate.response;
    const { fecha_inicio, fecha_fin } = gate.value;

    const baseParam = new URL(request.url).searchParams.get("base");
    const result = await calcularCurva({ id, fecha_inicio, fecha_fin, baseParam });
    if (!result.ok) return result.response;
    return NextResponse.json(result.value);
  },
);
