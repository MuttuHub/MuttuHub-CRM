// POST /api/v1/projects/:id/expenses/sign (S6 U3).
//
// ADR-13 signed direct-to-storage upload for an expense support. Unlike the avance medios route it
// exists BEFORE the expense does: the browser signs, PUTs the file, then confirms it inside
// POST /expenses (`soportes[]`). Authorisation is the registration gate (404 -> 403 -> 409
// EN_EJECUCION); the key is chosen by the server under `proyectos/{id}/soportes/`.

import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { gateEjecucionWrite } from "@/lib/api/ejecucion";
import { signarSubidaSoporte } from "@/lib/api/soportes";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos preparar la subida. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const gate = await gateEjecucionWrite(auth.usuario, id);
    if (!gate.ok) return gate.response;

    return signarSubidaSoporte(request, id);
  },
);
