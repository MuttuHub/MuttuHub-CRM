// GET /api/v1/projects/:id/activities/:activityId/attachments — RF-04:
// soportes listados en la ficha de la actividad correspondiente. Read-only
// (canViewProject, mismo eje que el listado general); la creación de
// soportes vive en el único endpoint de escritura (`../../attachments`,
// campo opcional `actividad_id`) — mismo criterio que `activities/route.ts`
// no duplicando el POST de `Meta`.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { loadProjectScoped } from "@/lib/api/projects";
import { SUPPORT_SELECT, resolveDownloadUrls } from "../../../attachments/route";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; activityId: string }> };

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos cargar los soportes de la actividad. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, activityId } = await ctx.params;

    const access = await loadProjectScoped(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND" ? "El proyecto no existe." : "No tienes permisos sobre este proyecto.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    const actividad = await db.actividad.findFirst({
      where: { id: activityId, proyecto_id: id, deleted_at: null },
      select: { id: true },
    });
    if (!actividad) {
      return apiError("La actividad no existe.", 404, "NOT_FOUND");
    }

    const soportes = await db.soporteProyecto.findMany({
      where: { actividad_id: activityId, proyecto_id: id, deleted_at: null },
      select: SUPPORT_SELECT,
      orderBy: { created_at: "desc" },
    });

    return NextResponse.json({ soportes: await resolveDownloadUrls(soportes) });
  },
);
