// POST /api/v1/clients/:id/opportunities/:opportunityId/project — "Crear
// proyecto desde una oportunidad ganada" (D1/T2, design.md). Structural
// sibling of `../convert/route.ts`, NOT a modification of it (D1-bis):
// `convert/route.ts` stays diff-zero, this is a brand-new file with its own
// suite. This is the ONLY path that ever writes `Proyecto.oportunidad_id` —
// `POST /api/v1/projects` never accepts it in its body.
//
// Gate order mirrors the design.md flow exactly: client commercial write
// access first (`getClientForOpportunityWrite`), THEN `canCreateProject`
// (T9 — a COLABORADOR can pass the first gate via `gestiona_oportunidades`
// and still lack authority to create a Proyecto), THEN the opportunity's
// own existence/fase/uniqueness checks, and the request body is validated
// last, right before the write.

import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma, type LineaEstrategica } from "@prisma/client";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { ENUM_VALUES } from "@/lib/catalogs";
import { catalogEnum, getClientForOpportunityWrite, parseDate, zodError } from "@/lib/api/crm";
import { logAudit } from "@/lib/api/audit";
import { canCreateProject } from "@/lib/permissions";
import { PROJECT_SELECT, toProjectItem } from "@/lib/api/projects";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; opportunityId: string }> };

// `cliente_id` y `oportunidad_id` NO se aceptan del cliente (design.md T2):
// se derivan de la ruta y de la oportunidad cargada.
export const PROYECTO_DESDE_OPORTUNIDAD_SCHEMA = z.object({
  codigo: z
    .string()
    .trim()
    .min(1, "El código de proyecto es obligatorio.")
    .max(60, "El código es muy largo."),
  nombre: z.string().trim().min(1, "El nombre es obligatorio.").max(200, "El nombre es muy largo."),
  territorio: z.string().trim().min(1, "El territorio es obligatorio.").max(160, "El territorio es muy largo."),
  linea_estrategica: catalogEnum(
    ENUM_VALUES.LineaEstrategica as readonly LineaEstrategica[],
    "Línea estratégica no válida.",
  ),
  fecha_inicio: z.string().refine((v) => parseDate(v) !== null, "Fecha de inicio no válida."),
  fecha_fin: z.string().refine((v) => parseDate(v) !== null, "Fecha de fin no válida."),
  beneficiarios_meta: z.number().int().min(0, "Los beneficiarios meta no pueden ser negativos.").optional(),
  responsable_id: z.string().uuid("Responsable no válido.").optional(),
});

export const POST = withApiErrorHandling(
  "opportunities",
  "No pudimos crear el proyecto. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, opportunityId } = await ctx.params;

    const access = await getClientForOpportunityWrite(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND" ? "El cliente no existe." : "No tienes permisos sobre las oportunidades de este cliente.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    if (!canCreateProject({ id: auth.usuario.id, rol: auth.usuario.rol })) {
      return apiError("No tienes permisos para crear proyectos.", 403, "FORBIDDEN");
    }

    const oportunidad = await db.oportunidad.findFirst({
      where: { id: opportunityId, cliente_id: id, deleted_at: null },
    });
    if (!oportunidad) {
      return apiError("La oportunidad no existe.", 404, "NOT_FOUND");
    }
    if (oportunidad.fase !== "EJECUCION") {
      return apiError("Solo se crea un proyecto desde una oportunidad adjudicada.", 409, "CONFLICT");
    }

    const proyectoExistente = await db.proyecto.findFirst({
      where: { oportunidad_id: opportunityId, deleted_at: null },
      select: { id: true },
    });
    if (proyectoExistente) {
      return apiError("Esta oportunidad ya tiene un proyecto.", 409, "CONFLICT");
    }

    const body = await parseJsonBody<unknown>(request);
    if (body === null) {
      return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
    }
    const parsed = PROYECTO_DESDE_OPORTUNIDAD_SCHEMA.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const responsable_id = parsed.data.responsable_id ?? auth.usuario.id;

    try {
      const proyecto = await db.proyecto.create({
        data: {
          codigo: parsed.data.codigo,
          nombre: parsed.data.nombre,
          cliente_id: id,
          oportunidad_id: opportunityId,
          territorio: parsed.data.territorio,
          linea_estrategica: parsed.data.linea_estrategica,
          fecha_inicio: parseDate(parsed.data.fecha_inicio)!,
          fecha_fin: parseDate(parsed.data.fecha_fin)!,
          beneficiarios_meta: parsed.data.beneficiarios_meta ?? 0,
          responsable_id,
        },
        select: PROJECT_SELECT,
      });

      await logAudit({
        entidad: "proyecto",
        entidad_id: proyecto.id,
        accion: "crear",
        usuario_id: auth.usuario.id,
        cambios: { oportunidad_id: opportunityId, codigo: parsed.data.codigo, cliente_id: id },
      });

      return NextResponse.json(
        { proyecto: toProjectItem(proyecto, { id: auth.usuario.id, rol: auth.usuario.rol }) },
        { status: 201 },
      );
    } catch (err) {
      // D1: la carrera concurrente (dos POST simultáneos pasan ambos la
      // pre-comprobación de `proyectoExistente`) la resuelve el `@unique` de
      // `oportunidad_id` en la base de datos; la pre-comprobación de arriba
      // es solo el mensaje amable en el camino común.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return apiError("Esta oportunidad ya tiene un proyecto.", 409, "CONFLICT");
      }
      throw err;
    }
  },
);
