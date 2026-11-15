// GET /api/v1/projects/:id/expense-changes?periodo=AAAA-MM — T7 (S2, AJ-08 «Propuesto»): the expenses edited and
// annulled during the period, with their detail and motives, for the Gerente. 404 for a missing project first, then
// 403 for a role without project authority (`canManageProjects`: the same ADMINISTRADOR + GERENCIA set that corrects
// and annuls), then 400 for a missing or malformed period. The reader lives in `@/lib/api/cambios-gastos`.

import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { loadProjectScoped } from "@/lib/api/projects";
import { listCambiosGastos, PERIODO_CAMBIOS_INVALIDO, PERIODO_CAMBIOS_RE } from "@/lib/api/cambios-gastos";
import { canManageProjects } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos cargar los cambios del periodo. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const scoped = await loadProjectScoped(auth.usuario, id, { id: true });
    if (!scoped) return apiError("El proyecto no existe.", 404, "NOT_FOUND");
    if (!canManageProjects(auth.usuario)) {
      return apiError("Solo la Gerencia revisa los cambios de gastos del periodo.", 403, "FORBIDDEN");
    }

    const periodo = new URL(request.url).searchParams.get("periodo") ?? "";
    if (!PERIODO_CAMBIOS_RE.test(periodo)) return apiError(PERIODO_CAMBIOS_INVALIDO, 400, "VALIDATION_ERROR");

    const cambios = await listCambiosGastos(id, periodo);
    return NextResponse.json({ periodo, cambios });
  },
);
