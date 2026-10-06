// GET /api/v1/projects/:id/audit — history of one project (P02, REQ-AUD-04).
//
// Gated exactly like the detail route (GET /api/v1/projects/:id): existence is
// settled first (404 for a missing or soft-deleted project) and visibility is a
// read-scope decision (403 for a project the actor may not read, never a 404 —
// REQ-ACC-02). The rows, their deterministic order, the bounded limit and the
// actor-name fallback are the reader's concern (`@/lib/api/project-audit`); this
// file only gates and wraps.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { canReadProject } from "@/lib/api/projects";
import { listProjectAudit } from "@/lib/api/project-audit";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos cargar el historial del proyecto. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    // Existence first: only the id is read, the history query runs afterwards.
    const proyecto = await db.proyecto.findFirst({
      where: { id, deleted_at: null },
      select: { id: true },
    });
    if (!proyecto) {
      return apiError("El proyecto no existe.", 404, "NOT_FOUND");
    }

    // Existence is settled; visibility is a read-scope decision. Same 403 copy
    // as the detail route (REQ-ACC-02).
    if (!canReadProject(auth.usuario)) {
      return apiError("No tienes permisos sobre este proyecto.", 403, "FORBIDDEN");
    }

    const historial = await listProjectAudit(id);
    return NextResponse.json({ historial });
  },
);
