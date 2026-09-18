// GET/PATCH/DELETE /api/v1/projects/:id/activities/:activityId — Actividad
// detail, edit and soft delete. Same access axis as
// goals/[goalId]/route.ts. When `meta_id` is patched, it is re-validated
// against this project the same way creation does (3a.3/3a.4) — the API
// friendly check; the DB composite FK (Unit 1) is the real backstop either
// way.

import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { parseDate, zodError } from "@/lib/api/crm";
import { getProjectForWrite, loadProjectScoped } from "@/lib/api/projects";
import { ACTIVITY_SELECT } from "../route";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; activityId: string }> };

export const ACTIVITY_PATCH_SCHEMA = z
  .object({
    meta_id: z.string().min(1, "La meta es obligatoria."),
    nombre: z
      .string()
      .trim()
      .min(1, "El nombre de la actividad no puede estar vacío.")
      .max(200, "El nombre es muy largo."),
    descripcion: z.string().trim().max(2000, "La descripción es muy larga."),
    peso: z.number().int().min(1, "El peso debe ser mayor a cero."),
    fecha_planificada: z.string().refine((v) => parseDate(v) !== null, "Fecha planificada no válida."),
    fecha_real: z.string().refine((v) => parseDate(v) !== null, "Fecha real no válida."),
    porcentaje_avance: z
      .number()
      .int()
      .min(0, "El porcentaje de avance debe estar entre 0 y 100.")
      .max(100, "El porcentaje de avance debe estar entre 0 y 100."),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, "Envía al menos un campo para actualizar.");

async function loadActivity(proyectoId: string, activityId: string) {
  return db.actividad.findFirst({
    where: { id: activityId, proyecto_id: proyectoId, deleted_at: null },
    select: ACTIVITY_SELECT,
  });
}

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos cargar la actividad. Inténtalo de nuevo.",
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

    const actividad = await loadActivity(id, activityId);
    if (!actividad) {
      return apiError("La actividad no existe.", 404, "NOT_FOUND");
    }

    return NextResponse.json({ actividad });
  },
);

export const PATCH = withApiErrorHandling(
  "projects",
  "No pudimos actualizar la actividad. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, activityId } = await ctx.params;

    const body = await parseJsonBody<unknown>(request);
    if (body === null) {
      return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
    }
    const parsed = ACTIVITY_PATCH_SCHEMA.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const access = await getProjectForWrite(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND"
          ? "El proyecto no existe."
          : "No tienes permisos para actualizar actividades de este proyecto.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    const actividad = await loadActivity(id, activityId);
    if (!actividad) {
      return apiError("La actividad no existe.", 404, "NOT_FOUND");
    }

    if (parsed.data.meta_id !== undefined) {
      const meta = await db.meta.findFirst({
        where: { id: parsed.data.meta_id, proyecto_id: id, deleted_at: null },
        select: { id: true },
      });
      if (!meta) {
        return apiError("La meta no existe o no pertenece a este proyecto.", 400, "VALIDATION_ERROR");
      }
    }

    const data: Prisma.ActividadUncheckedUpdateInput = {};
    if (parsed.data.meta_id !== undefined) data.meta_id = parsed.data.meta_id;
    if (parsed.data.nombre !== undefined) data.nombre = parsed.data.nombre;
    if (parsed.data.descripcion !== undefined) data.descripcion = parsed.data.descripcion.trim() || null;
    if (parsed.data.peso !== undefined) data.peso = parsed.data.peso;
    if (parsed.data.fecha_planificada !== undefined) {
      data.fecha_planificada = parseDate(parsed.data.fecha_planificada)!;
    }
    if (parsed.data.fecha_real !== undefined) data.fecha_real = parseDate(parsed.data.fecha_real)!;
    if (parsed.data.porcentaje_avance !== undefined) data.porcentaje_avance = parsed.data.porcentaje_avance;

    const updated = await db.actividad.update({
      where: { id: activityId },
      data,
      select: ACTIVITY_SELECT,
    });

    return NextResponse.json({ actividad: updated });
  },
);

export const DELETE = withApiErrorHandling(
  "projects",
  "No pudimos eliminar la actividad. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, activityId } = await ctx.params;

    const access = await getProjectForWrite(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND"
          ? "El proyecto no existe."
          : "No tienes permisos para eliminar actividades de este proyecto.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    const actividad = await loadActivity(id, activityId);
    if (!actividad) {
      return apiError("La actividad no existe.", 404, "NOT_FOUND");
    }

    await db.actividad.update({
      where: { id: activityId },
      data: { deleted_at: new Date() },
    });

    return new NextResponse(null, { status: 204 });
  },
);
