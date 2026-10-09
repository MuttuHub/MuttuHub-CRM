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
import { loadKpisPortafolio } from "@/lib/api/kpis-portafolio";
import { parseCorteFecha, serializeKpis } from "@/lib/api/kpis-http";
import { resolverBase } from "@/lib/api/versiones";
import { getSemaforoParametrosV2 } from "@/lib/settings";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const SIN_FECHAS_MESSAGE = "El proyecto aún no tiene fechas de inicio y fin.";

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
    const proyecto = scoped.row;
    if (!proyecto.fecha_inicio || !proyecto.fecha_fin) return apiError(SIN_FECHAS_MESSAGE, 409, "INVALID_STATE");

    const url = new URL(request.url);
    const corteResult = parseCorteFecha(url.searchParams.get("corte"));
    if (!corteResult.ok) return corteResult.response;
    const base = await resolverBase(id, url.searchParams.get("base"));
    if (!base.ok) return base.response;

    const parametros = await getSemaforoParametrosV2();
    const kpis = await loadKpisPortafolio({
      proyectos: [proyecto],
      corte: corteResult.corte,
      parametros,
      original: base.value.base === "original" ? { proyectoId: id, snapshot: base.value.snapshot } : undefined,
    });
    return NextResponse.json({
      base: base.value.base,
      ...serializeKpis(kpis.get(id) as NonNullable<ReturnType<typeof kpis.get>>),
    });
  },
);
