// GET/PATCH/DELETE /api/v1/projects/:id — Proyecto detail, edit and soft
// delete. `cliente_id` and `oportunidad_id` are NEVER patchable here: the
// client link is fixed at creation and `oportunidad_id` is written only by
// the dedicated conversion action (D1/T2) — this route excludes both from
// its schema, not just from a "no-op if sent" branch.

import { NextResponse } from "next/server";
import { z } from "zod";
import type { LineaEstrategica, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { ENUM_VALUES } from "@/lib/catalogs";
import { catalogEnum, parseDate, zodError } from "@/lib/api/crm";
import { logAudit } from "@/lib/api/audit";
import { getProjectForWrite, loadProjectScoped, PROJECT_SELECT, toProjectItem } from "@/lib/api/projects";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const PROJECT_PATCH_SCHEMA = z
  .object({
    codigo: z
      .string()
      .trim()
      .min(1, "El código de proyecto no puede estar vacío.")
      .max(60, "El código es muy largo."),
    nombre: z.string().trim().min(1, "El nombre no puede estar vacío.").max(200, "El nombre es muy largo."),
    territorio: z
      .string()
      .trim()
      .min(1, "El territorio no puede estar vacío.")
      .max(160, "El territorio es muy largo."),
    linea_estrategica: catalogEnum(
      ENUM_VALUES.LineaEstrategica as readonly LineaEstrategica[],
      "Línea estratégica no válida.",
    ),
    fecha_inicio: z.string().refine((v) => parseDate(v) !== null, "Fecha de inicio no válida."),
    fecha_fin: z.string().refine((v) => parseDate(v) !== null, "Fecha de fin no válida."),
    beneficiarios_meta: z.number().int().min(0, "Los beneficiarios meta no pueden ser negativos."),
    responsable_id: z.string().min(1, "El responsable es obligatorio."),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, "Envía al menos un campo para actualizar.");

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos cargar el proyecto. Inténtalo de nuevo.",
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

    const proyecto = await db.proyecto.findFirst({
      where: { id, deleted_at: null },
      select: PROJECT_SELECT,
    });
    if (!proyecto) {
      return apiError("El proyecto no existe.", 404, "NOT_FOUND");
    }

    return NextResponse.json({
      proyecto: toProjectItem(proyecto, { id: auth.usuario.id, rol: auth.usuario.rol }),
    });
  },
);

export const PATCH = withApiErrorHandling(
  "projects",
  "No pudimos actualizar el proyecto. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const body = await parseJsonBody<unknown>(request);
    if (body === null) {
      return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
    }
    const parsed = PROJECT_PATCH_SCHEMA.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const access = await getProjectForWrite(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND"
          ? "El proyecto no existe."
          : "No tienes permisos para actualizar este proyecto.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    if (parsed.data.responsable_id !== undefined) {
      const responsable = await db.usuario.findFirst({
        where: { id: parsed.data.responsable_id, activo: true },
        select: { id: true },
      });
      if (!responsable) {
        return apiError("El responsable no existe o está inactivo.", 400, "VALIDATION_ERROR");
      }
    }

    const data: Prisma.ProyectoUncheckedUpdateInput = {};
    if (parsed.data.codigo !== undefined) data.codigo = parsed.data.codigo;
    if (parsed.data.nombre !== undefined) data.nombre = parsed.data.nombre;
    if (parsed.data.territorio !== undefined) data.territorio = parsed.data.territorio;
    if (parsed.data.linea_estrategica !== undefined) data.linea_estrategica = parsed.data.linea_estrategica;
    if (parsed.data.fecha_inicio !== undefined) data.fecha_inicio = parseDate(parsed.data.fecha_inicio)!;
    if (parsed.data.fecha_fin !== undefined) data.fecha_fin = parseDate(parsed.data.fecha_fin)!;
    if (parsed.data.beneficiarios_meta !== undefined) data.beneficiarios_meta = parsed.data.beneficiarios_meta;
    if (parsed.data.responsable_id !== undefined) data.responsable_id = parsed.data.responsable_id;

    const proyecto = await db.proyecto.update({
      where: { id },
      data,
      select: PROJECT_SELECT,
    });

    await logAudit({
      entidad: "proyecto",
      entidad_id: id,
      accion: "editar",
      usuario_id: auth.usuario.id,
      cambios: parsed.data,
    });

    return NextResponse.json({
      proyecto: toProjectItem(proyecto, { id: auth.usuario.id, rol: auth.usuario.rol }),
    });
  },
);

export const DELETE = withApiErrorHandling(
  "projects",
  "No pudimos eliminar el proyecto. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const access = await getProjectForWrite(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND"
          ? "El proyecto no existe."
          : "No tienes permisos para eliminar este proyecto.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    await db.proyecto.update({
      where: { id },
      data: { deleted_at: new Date() },
    });

    await logAudit({
      entidad: "proyecto",
      entidad_id: id,
      accion: "eliminar",
      usuario_id: auth.usuario.id,
    });

    return new NextResponse(null, { status: 204 });
  },
);
