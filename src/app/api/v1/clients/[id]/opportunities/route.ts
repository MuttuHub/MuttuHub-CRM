// GET/POST /api/v1/clients/:id/opportunities — opportunity list (flat array)
// and creation (PRD §4.2 "Oportunidades" tab). valor_estimado_cop feeds the
// dashboard financial module (PRD §7) and is stored as Decimal(15,2).
// Read/write are scoped to the client like the rest of the module.

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { ENUM_VALUES } from "@/lib/catalogs";
import { catalogEnum, getClientForWrite, loadClientScoped, parseDate, zodError } from "@/lib/api/crm";
import type { EstadoOportunidad } from "@prisma/client";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const OPORTUNIDAD_SCHEMA = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, "El nombre de la oportunidad es obligatorio.")
    .max(300, "El nombre es muy largo."),
  problema_detectado: z.string().nullable().optional(),
  solucion_propuesta: z.string().nullable().optional(),
  servicios_interes: z.string().nullable().optional(),
  valor_estimado_cop: z
    .number()
    .min(0, "El valor estimado no puede ser negativo.")
    .optional(),
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
});

export const GET = withApiErrorHandling(
  "opportunities",
  "No pudimos cargar las oportunidades. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const cliente = await loadClientScoped(id, auth.usuario);
    if (!cliente) {
      return apiError("El cliente no existe.", 404, "NOT_FOUND");
    }
    const oportunidades = await db.oportunidad.findMany({
      where: { cliente_id: id, deleted_at: null },
      orderBy: { created_at: "desc" },
    });
    return NextResponse.json({ oportunidades });
  },
);

export const POST = withApiErrorHandling(
  "opportunities",
  "No pudimos guardar la oportunidad. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const body = await parseJsonBody<unknown>(request);
    if (body === null) {
      return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
    }
    const parsed = OPORTUNIDAD_SCHEMA.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const access = await getClientForWrite(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND" ? "El cliente no existe." : "No tienes permisos sobre este cliente.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    const oportunidad = await db.oportunidad.create({
      data: {
        cliente_id: id,
        nombre: parsed.data.nombre,
        problema_detectado: parsed.data.problema_detectado,
        solucion_propuesta: parsed.data.solucion_propuesta,
        servicios_interes: parsed.data.servicios_interes,
        valor_estimado_cop: parsed.data.valor_estimado_cop,
        estado: parsed.data.estado ?? "DISENANDO_PROPUESTA",
        fecha_ultima_gestion: parsed.data.fecha_ultima_gestion
          ? parseDate(parsed.data.fecha_ultima_gestion)
          : undefined,
        proyectos_relacionados: parsed.data.proyectos_relacionados,
      },
    });
    return NextResponse.json({ oportunidad }, { status: 201 });
  },
);
