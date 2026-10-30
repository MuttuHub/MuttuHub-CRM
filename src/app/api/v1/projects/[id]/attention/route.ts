// GET /api/v1/projects/:id/attention?corte=AAAA-MM-DD — server-derived attention list (S14 P5).
//
// The server owns the whole reading: which budget lines overspent (E > A), which activities are due
// and still below the tope (AJ-03), which avances lack a support, which indicators are below their target, the
// financial delay alert and the D5 "observed" expenses. Copy and reference ids come from the server;
// the client only renders (D11). Whoever can read the project reads it, in any estado
// (404 -> 403 -> 409 -> 400); a project outside the measurable states answers 200 with `medible: false`
// and an empty list.

import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { canReadProject, loadProjectScoped } from "@/lib/api/projects";
import { EJECUCION_FORBIDDEN_MESSAGE, PROYECTO_NO_EXISTE } from "@/lib/api/ejecucion";
import { cargarAtencion } from "@/lib/api/atencion";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const ATENCION_SELECT = { id: true, estado: true, fecha_inicio: true, fecha_fin: true, beneficiarios_meta: true } as const;

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos calcular lo que requiere atención. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const scoped = await loadProjectScoped(auth.usuario, id, ATENCION_SELECT);
    if (!scoped) return apiError(PROYECTO_NO_EXISTE, 404, "NOT_FOUND");
    if (!canReadProject(auth.usuario, scoped.es_miembro)) return apiError(EJECUCION_FORBIDDEN_MESSAGE, 403, "FORBIDDEN");

    const params = new URL(request.url).searchParams;
    const result = await cargarAtencion({ proyecto: scoped.row, corteParam: params.get("corte") });
    if (!result.ok) return result.response;
    return NextResponse.json(result.value);
  },
);
