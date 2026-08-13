// PATCH/DELETE /api/v1/clients/:id/opportunities/:opportunityId — opportunity
// edit and soft delete. The opportunity must belong to the client and the
// caller needs write access to that client.

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { ENUM_VALUES } from "@/lib/catalogs";
import { catalogEnum, getClientForWrite, parseDate, zodError } from "@/lib/api/crm";
import type { EstadoOportunidad } from "@prisma/client";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; opportunityId: string }> };

export const OPORTUNIDAD_PATCH_SCHEMA = z
  .object({
    nombre: z
      .string()
      .trim()
      .min(1, "El nombre de la oportunidad no puede estar vacío.")
      .max(300, "El nombre es muy largo."),
    problema_detectado: z.string().nullable().optional(),
    solucion_propuesta: z.string().nullable().optional(),
    servicios_interes: z.string().nullable().optional(),
    valor_estimado_cop: z.number().min(0, "El valor estimado no puede ser negativo.").nullable().optional(),
    estado: catalogEnum(
      ENUM_VALUES.EstadoOportunidad as readonly EstadoOportunidad[],
      "Estado de oportunidad no válido.",
    ).optional(),
    fecha_ultima_gestion: z
      .string()
      .refine((v) => parseDate(v) !== null, "Fecha de última gestión no válida.")
      .nullable()
      .optional(),
    proyectos_relacionados: z.string().nullable().optional(),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, "Envía al menos un campo para actualizar.");

export const PATCH = withApiErrorHandling(
  "opportunities",
  "No pudimos actualizar la oportunidad. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, opportunityId } = await ctx.params;

    const body = await parseJsonBody<unknown>(request);
    if (body === null) {
      return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
    }
    const parsed = OPORTUNIDAD_PATCH_SCHEMA.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const access = await getClientForWrite(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND" ? "El cliente no existe." : "No tienes permisos sobre este cliente.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    const existing = await db.oportunidad.findFirst({
      where: { id: opportunityId, cliente_id: id, deleted_at: null },
    });
    if (!existing) {
      return apiError("La oportunidad no existe.", 404, "NOT_FOUND");
    }

    const oportunidad = await db.oportunidad.update({
      where: { id: opportunityId },
      data: {
        nombre: parsed.data.nombre,
        problema_detectado: parsed.data.problema_detectado,
        solucion_propuesta: parsed.data.solucion_propuesta,
        servicios_interes: parsed.data.servicios_interes,
        valor_estimado_cop: parsed.data.valor_estimado_cop,
        estado: parsed.data.estado,
        fecha_ultima_gestion:
          parsed.data.fecha_ultima_gestion === undefined
            ? undefined
            : parsed.data.fecha_ultima_gestion === null
              ? null
              : parseDate(parsed.data.fecha_ultima_gestion),
        proyectos_relacionados: parsed.data.proyectos_relacionados,
      },
    });
    return NextResponse.json({ oportunidad });
  },
);

export const DELETE = withApiErrorHandling(
  "opportunities",
  "No pudimos eliminar la oportunidad. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, opportunityId } = await ctx.params;

    const access = await getClientForWrite(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND" ? "El cliente no existe." : "No tienes permisos sobre este cliente.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    const existing = await db.oportunidad.findFirst({
      where: { id: opportunityId, cliente_id: id, deleted_at: null },
    });
    if (!existing) {
      return apiError("La oportunidad no existe.", 404, "NOT_FOUND");
    }

    await db.oportunidad.update({
      where: { id: opportunityId },
      data: { deleted_at: new Date() },
    });
    return new NextResponse(null, { status: 204 });
  },
);
