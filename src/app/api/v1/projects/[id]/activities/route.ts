// GET/POST /api/v1/projects/:id/activities — Actividad list/create (RF-02,
// design.md Fase 3a). `proyecto_id` is always forced from the URL, same
// invariant as goals/route.ts. `meta_id` IS accepted in the body (an
// activity must declare its meta, RF-02) but is re-validated here against
// THIS project before the write: the composite FK from Unit 1
// (`Actividad(meta_id, proyecto_id) -> Meta(id, proyecto_id)`) is the real
// backstop, this check only turns a cross-project meta_id into a clean 400
// instead of a raw Prisma error.

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { parseDate, zodError } from "@/lib/api/crm";
import { getProjectForWrite, loadProjectScoped } from "@/lib/api/projects";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** Projection shared by the Actividad list/detail/create/update responses. */
export const ACTIVITY_SELECT = {
  id: true,
  proyecto_id: true,
  meta_id: true,
  nombre: true,
  descripcion: true,
  peso: true,
  fecha_planificada: true,
  fecha_real: true,
  porcentaje_avance: true,
  created_at: true,
  updated_at: true,
} as const;

export const ACTIVITY_SCHEMA = z.object({
  meta_id: z.string().min(1, "La meta es obligatoria."),
  nombre: z
    .string()
    .trim()
    .min(1, "El nombre de la actividad es obligatorio.")
    .max(200, "El nombre es muy largo."),
  descripcion: z.string().trim().max(2000, "La descripción es muy larga.").optional(),
  peso: z.number().int().min(1, "El peso debe ser mayor a cero.").optional(),
  fecha_planificada: z.string().refine((v) => parseDate(v) !== null, "Fecha planificada no válida."),
  fecha_real: z.string().refine((v) => parseDate(v) !== null, "Fecha real no válida.").optional(),
  porcentaje_avance: z
    .number()
    .int()
    .min(0, "El porcentaje de avance debe estar entre 0 y 100.")
    .max(100, "El porcentaje de avance debe estar entre 0 y 100.")
    .optional(),
});

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos cargar las actividades del proyecto. Inténtalo de nuevo.",
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

    const actividades = await db.actividad.findMany({
      where: { proyecto_id: id, deleted_at: null },
      select: ACTIVITY_SELECT,
      orderBy: { fecha_planificada: "asc" },
    });

    return NextResponse.json({ actividades });
  },
);

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos crear la actividad. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const body = await parseJsonBody<unknown>(request);
    if (body === null) {
      return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
    }
    const parsed = ACTIVITY_SCHEMA.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const access = await getProjectForWrite(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND"
          ? "El proyecto no existe."
          : "No tienes permisos para crear actividades en este proyecto.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    // 3a.3: friendly API-layer rejection of a cross-project meta_id. The
    // composite FK (Unit 1) is the real backstop with or without this check.
    const meta = await db.meta.findFirst({
      where: { id: parsed.data.meta_id, proyecto_id: id, deleted_at: null },
      select: { id: true },
    });
    if (!meta) {
      return apiError("La meta no existe o no pertenece a este proyecto.", 400, "VALIDATION_ERROR");
    }

    const actividad = await db.actividad.create({
      data: {
        proyecto_id: id,
        meta_id: parsed.data.meta_id,
        nombre: parsed.data.nombre,
        descripcion: parsed.data.descripcion?.trim() || null,
        peso: parsed.data.peso ?? 1,
        fecha_planificada: parseDate(parsed.data.fecha_planificada)!,
        fecha_real: parsed.data.fecha_real ? parseDate(parsed.data.fecha_real) : null,
        porcentaje_avance: parsed.data.porcentaje_avance ?? 0,
      },
      select: ACTIVITY_SELECT,
    });

    return NextResponse.json({ actividad }, { status: 201 });
  },
);
