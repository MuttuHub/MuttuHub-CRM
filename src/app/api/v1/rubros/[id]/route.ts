// PATCH/DELETE /api/v1/rubros/:id — Rubro edit and soft delete (D5). Toggling
// `activo: false` is the normal way to retire a rubro: it disappears from
// `GET /api/v1/rubros`'s default (new-line) listing while every existing
// `LineaPresupuestal` that already points at it keeps working untouched —
// this route never cascades into `lineas_presupuestales`. Both operations
// are `requireApiRole(["ADMINISTRADOR"])` only, same gate as the parent
// `rubros/route.ts` POST.

import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiRole } from "@/lib/supabase/server";
import { zodError } from "@/lib/api/crm";
import { RUBRO_SELECT } from "../route";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const RUBRO_PATCH_SCHEMA = z
  .object({
    nombre: z.string().trim().min(1, "El nombre del rubro no puede estar vacío.").max(100, "El nombre es muy largo."),
    activo: z.boolean(),
    orden: z.number().int().min(0, "El orden no puede ser negativo."),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, "Envía al menos un campo para actualizar.");

async function loadRubro(id: string) {
  return db.rubro.findFirst({ where: { id, deleted_at: null }, select: RUBRO_SELECT });
}

export const PATCH = withApiErrorHandling(
  "rubros",
  "No pudimos actualizar el rubro. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiRole(["ADMINISTRADOR"]);
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const body = await parseJsonBody<unknown>(request);
    if (body === null) {
      return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
    }
    const parsed = RUBRO_PATCH_SCHEMA.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const rubro = await loadRubro(id);
    if (!rubro) {
      return apiError("El rubro no existe.", 404, "NOT_FOUND");
    }

    const data: Prisma.RubroUncheckedUpdateInput = {};
    if (parsed.data.nombre !== undefined) data.nombre = parsed.data.nombre;
    if (parsed.data.activo !== undefined) data.activo = parsed.data.activo;
    if (parsed.data.orden !== undefined) data.orden = parsed.data.orden;

    const updated = await db.rubro.update({ where: { id }, data, select: RUBRO_SELECT });

    return NextResponse.json({ rubro: updated });
  },
);

export const DELETE = withApiErrorHandling(
  "rubros",
  "No pudimos eliminar el rubro. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiRole(["ADMINISTRADOR"]);
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const rubro = await loadRubro(id);
    if (!rubro) {
      return apiError("El rubro no existe.", 404, "NOT_FOUND");
    }

    await db.rubro.update({ where: { id }, data: { deleted_at: new Date() } });

    return new NextResponse(null, { status: 204 });
  },
);
