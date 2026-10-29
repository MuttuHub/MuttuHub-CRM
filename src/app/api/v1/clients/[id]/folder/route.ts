// POST /api/v1/clients/:id/folder — find-or-create the client's folder in the
// Document Repository (S4, A5: one folder per client). 200 with the existing
// folder, 201 when this call created it (at the root, named after the client).
// Idempotent, including under concurrent first calls (see
// findOrCreateClientFolder). Folders are an ORGANIZATION axis, never a
// permission one: any authenticated user who can read the client may open or
// create its folder — the same rule as POST /api/v1/folders plus the shared
// client read scope (loadClientScoped).

import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { loadClientScoped } from "@/lib/api/crm";
import { requireApiUser } from "@/lib/supabase/server";
import { findOrCreateClientFolder } from "@/lib/documents/client-folder";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const CLIENT_NOT_FOUND = "El cliente no existe.";

export const POST = withApiErrorHandling(
  "clients",
  "No pudimos preparar la carpeta del cliente. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    if (!(await loadClientScoped(id))) {
      return apiError(CLIENT_NOT_FOUND, 404, "NOT_FOUND");
    }

    const result = await findOrCreateClientFolder(id, auth.usuario.id);
    if (!result) return apiError(CLIENT_NOT_FOUND, 404, "NOT_FOUND");

    return NextResponse.json(
      { carpeta: result.carpeta, creada: result.creada },
      { status: result.creada ? 201 : 200 },
    );
  },
);
