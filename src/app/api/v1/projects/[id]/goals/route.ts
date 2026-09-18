// GET/POST /api/v1/projects/:id/goals — Meta list/create (RF-02, design.md
// Fase 3a). `proyecto_id` is always forced from the URL — never accepted in
// the body, same invariant as opportunity-task-linking's tasks/route.ts.
// Access follows the same axis as the rest of the Proyecto aggregate:
// `canViewProject` (read) / `canManageProject` (write, T9's responsable_id
// axis included).

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { zodError } from "@/lib/api/crm";
import { getProjectForWrite, loadProjectScoped } from "@/lib/api/projects";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** Projection shared by the Meta list/detail/create/update responses. */
export const GOAL_SELECT = {
  id: true,
  proyecto_id: true,
  nombre: true,
  descripcion: true,
  created_at: true,
  updated_at: true,
} as const;

export const GOAL_SCHEMA = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, "El nombre de la meta es obligatorio.")
    .max(200, "El nombre es muy largo."),
  descripcion: z.string().trim().max(2000, "La descripción es muy larga.").optional(),
});

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos cargar las metas del proyecto. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const access = await loadProjectScoped(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND" ? "El proyecto no existe." : "No tienes permisos sobre este proyecto.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    const metas = await db.meta.findMany({
      where: { proyecto_id: id, deleted_at: null },
      select: GOAL_SELECT,
      orderBy: { created_at: "desc" },
    });

    return NextResponse.json({ metas });
  },
);

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos crear la meta. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const body = await parseJsonBody<unknown>(request);
    if (body === null) {
      return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
    }
    // `proyecto_id` is never read from the body: `GOAL_SCHEMA` does not
    // declare it, so zod strips any value sent there — the only source of
    // truth is the URL param used below.
    const parsed = GOAL_SCHEMA.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const access = await getProjectForWrite(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND"
          ? "El proyecto no existe."
          : "No tienes permisos para crear metas en este proyecto.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    const meta = await db.meta.create({
      data: {
        proyecto_id: id,
        nombre: parsed.data.nombre,
        descripcion: parsed.data.descripcion?.trim() || null,
      },
      select: GOAL_SELECT,
    });

    return NextResponse.json({ meta }, { status: 201 });
  },
);
