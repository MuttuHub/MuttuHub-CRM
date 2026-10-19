// GET /api/v1/projects/:id/kpis?corte=AAAA-MM-DD&base=vigente|original — per-project KPI block (S9 U4).
//
// The same `kpisProyecto` blocks the portfolio shows, computed through the same batched loader with a
// single project (one code path, so the numbers cannot drift from the dashboard). Whoever can read the
// project reads it, in any estado (404 -> 403 -> 409 -> 400); a project outside D5 (BORRADOR, ...)
// answers 200 with `medible: false` and null blocks. `base=original` replaces the structure, A and P
// with the frozen version 0 (avances, mediciones and E stay live), like the technical and financial sheets.

import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { canReadProject, loadProjectScoped } from "@/lib/api/projects";
import { EJECUCION_FORBIDDEN_MESSAGE, PROYECTO_NO_EXISTE } from "@/lib/api/ejecucion";
import { SIN_FECHAS_MESSAGE, calcularKpisProyecto } from "@/lib/api/kpis-proyecto";
import { serializeKpis } from "@/lib/api/kpis-http";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export { SIN_FECHAS_MESSAGE };

const KPI_SELECT = { id: true, estado: true, fecha_inicio: true, fecha_fin: true, beneficiarios_meta: true } as const;

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos calcular los indicadores del proyecto. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const scoped = await loadProjectScoped(auth.usuario, id, KPI_SELECT);
    if (!scoped) return apiError(PROYECTO_NO_EXISTE, 404, "NOT_FOUND");
    if (!canReadProject(auth.usuario, scoped.es_miembro)) return apiError(EJECUCION_FORBIDDEN_MESSAGE, 403, "FORBIDDEN");

    const params = new URL(request.url).searchParams;
    const result = await calcularKpisProyecto({
      proyecto: scoped.row,
      corteParam: params.get("corte"),
      baseParam: params.get("base"),
    });
    if (!result.ok) return result.response;
    return NextResponse.json({ base: result.value.base, ...serializeKpis(result.value.kpis) });
  },
);
