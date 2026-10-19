// POST /api/v1/projects/:id/progress/:progressId/attachments/sign (S4 U3).
//
// ADR-13 signed direct-to-storage upload for a medio of an avance: the bytes go
// from the browser to Supabase Storage, never through this function. The server
// authorises like any execution write (404 -> 403 -> 409), validates the shared
// upload policy, chooses the KEY (`proyectos/{id}/soportes/{uuid}_{name}`; a key
// from the client is never read) and returns a signed upload URL. The browser then
// confirms with metadata through POST .../attachments. Objects are never deleted.
// The policy itself lives in `lib/api/soportes.ts` (shared with the S6 expense routes).

import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { gateEjecucionWrite, loadAvanceParaMedio } from "@/lib/api/ejecucion";
import { signarSubidaSoporte } from "@/lib/api/soportes";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; progressId: string }> };

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos preparar la subida. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, progressId } = await ctx.params;

    const gate = await gateEjecucionWrite(auth.usuario, id);
    if (!gate.ok) return gate.response;
    const avance = await loadAvanceParaMedio(id, progressId);
    if (!avance.ok) return avance.response;

    return signarSubidaSoporte(request, id);
  },
);
