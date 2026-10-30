// POST /api/v1/projects/:id/activities/:activityId/progress/:reportId/attachments/sign
// (AJ-01, S11).
//
// ADR-13 signed direct-to-storage upload for a medio of an activity progress report: the
// bytes go from the browser to Supabase Storage, never through this function. The server
// authorises like any report write (S9.5: responsable-only + ADMIN/GERENCIA override, 404 ->
// 403 -> 409 -> 404 -> 403), validates the shared upload policy, chooses the KEY
// (`proyectos/{id}/soportes/{uuid}_{name}`; a key from the client is never read) and returns
// a signed upload URL. The browser then confirms with metadata through POST
// .../attachments. Objects are never deleted. Mirrors the AJ-06 mediciones sign route; the
// policy itself lives in `lib/api/soportes.ts` (shared with the avance/medición/expense
// routes).

import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { gateReporteActividadWrite, loadReporteParaMedio } from "@/lib/api/ejecucion";
import { signarSubidaSoporte } from "@/lib/api/soportes";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; activityId: string; reportId: string }> };

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos preparar la subida. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, activityId, reportId } = await ctx.params;

    const gate = await gateReporteActividadWrite(auth.usuario, id, activityId);
    if (!gate.ok) return gate.response;
    const reporte = await loadReporteParaMedio(id, activityId, reportId);
    if (!reporte.ok) return reporte.response;

    return signarSubidaSoporte(request, id);
  },
);
