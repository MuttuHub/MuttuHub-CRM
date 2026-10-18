// POST /api/v1/projects/:id/supports/sign — ADR-13 signed direct-to-storage upload for a
// project-origin document (DOC1): the bytes go from the browser to Supabase Storage, never
// through this function. The server authorises like the document create (404 -> 403 -> 409),
// validates the shared upload policy, chooses the KEY
// (`proyectos/{id}/soportes/{uuid}_{name}`; a key from the client is never read) and returns a
// signed upload URL. The browser then confirms with metadata through POST .../supports. Objects
// are never deleted. The policy itself lives in `lib/api/soportes.ts`.

import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { gateSoporteProyectoWrite, signarSubidaSoporte } from "@/lib/api/soportes";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos preparar la subida. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const gate = await gateSoporteProyectoWrite(auth.usuario, id);
    if (!gate.ok) return gate.response;

    return signarSubidaSoporte(request, id);
  },
);
