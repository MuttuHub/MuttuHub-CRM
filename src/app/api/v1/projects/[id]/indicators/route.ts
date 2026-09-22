// GET/POST /api/v1/projects/:id/indicators — Indicador list/create.
// `proyecto_id` is always forced from the URL — never accepted in the body,
// same invariant as goals/route.ts. `meta_id` IS accepted in the body (it is
// optional here, unlike activities' required `meta_id`) but is re-validated
// against THIS project before the write, same cross-project pattern as
// activities/route.ts and expenses/route.ts — the composite FK
// (`Indicador(meta_id, proyecto_id) -> Meta(id, proyecto_id)`) is the real
// backstop, this check only turns a cross-project meta_id into a clean 400
// instead of a raw Prisma error. Access follows the same axis as the rest of
// the Proyecto aggregate: `canViewProject` (read) / `canManageProject`
// (write).

import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { zodError } from "@/lib/api/crm";
import { getProjectForWrite, loadProjectScoped } from "@/lib/api/projects";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** Projection shared by the Indicador list/detail/create/update responses. */
export const INDICATOR_SELECT = {
  id: true,
  proyecto_id: true,
  meta_id: true,
  nombre: true,
  unidad: true,
  meta_valor: true,
  valor_actual: true,
  cuenta_beneficiarios: true,
  created_at: true,
  updated_at: true,
} as const;

export const INDICATOR_SCHEMA = z.object({
  meta_id: z.string().min(1, "La meta no puede estar vacía.").optional(),
  nombre: z
    .string()
    .trim()
    .min(1, "El nombre del indicador es obligatorio.")
    .max(200, "El nombre es muy largo."),
  unidad: z.string().trim().min(1, "La unidad es obligatoria.").max(100, "La unidad es muy larga."),
  meta_valor: z.number().positive("La meta del indicador debe ser mayor a cero."),
  // null = sin medir, nunca cuenta como cumplido (schema.prisma). Solo se
  // valida el shape aquí; la ausencia de medición se representa omitiendo
  // el campo, no enviando null.
  valor_actual: z.number().min(0, "El valor actual no puede ser negativo.").optional(),
  cuenta_beneficiarios: z.boolean().optional(),
});

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos cargar los indicadores del proyecto. Inténtalo de nuevo.",
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

    const indicadores = await db.indicador.findMany({
      where: { proyecto_id: id, deleted_at: null },
      select: INDICATOR_SELECT,
      orderBy: { created_at: "desc" },
    });

    return NextResponse.json({ indicadores });
  },
);

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos crear el indicador. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const body = await parseJsonBody<unknown>(request);
    if (body === null) {
      return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
    }
    // `proyecto_id` is never read from the body: `INDICATOR_SCHEMA` does not
    // declare it, so zod strips any value sent there — the only source of
    // truth is the URL param used below.
    const parsed = INDICATOR_SCHEMA.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const access = await getProjectForWrite(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND"
          ? "El proyecto no existe."
          : "No tienes permisos para crear indicadores en este proyecto.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    // Friendly API-layer rejection of a cross-project meta_id, same pattern
    // as activities/route.ts and expenses/route.ts. The composite FK is the
    // real backstop with or without this check.
    if (parsed.data.meta_id !== undefined) {
      const meta = await db.meta.findFirst({
        where: { id: parsed.data.meta_id, proyecto_id: id, deleted_at: null },
        select: { id: true },
      });
      if (!meta) {
        return apiError("La meta no existe o no pertenece a este proyecto.", 400, "VALIDATION_ERROR");
      }
    }

    const indicador = await db.indicador.create({
      data: {
        proyecto_id: id,
        meta_id: parsed.data.meta_id ?? null,
        nombre: parsed.data.nombre,
        unidad: parsed.data.unidad,
        meta_valor: new Prisma.Decimal(parsed.data.meta_valor),
        valor_actual:
          parsed.data.valor_actual !== undefined ? new Prisma.Decimal(parsed.data.valor_actual) : null,
        cuenta_beneficiarios: parsed.data.cuenta_beneficiarios ?? false,
      },
      select: INDICATOR_SELECT,
    });

    return NextResponse.json({ indicador }, { status: 201 });
  },
);
