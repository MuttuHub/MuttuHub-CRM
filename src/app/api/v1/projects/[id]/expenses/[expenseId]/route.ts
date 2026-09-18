// GET/PATCH/DELETE /api/v1/projects/:id/expenses/:expenseId — Gasto detail,
// edit and soft delete. Same access axis as the parent expenses/route.ts.
// `expenseId` is always scoped by `proyecto_id` on every query — a gasto
// from another project is treated as not found, never leaked through this
// route (same pattern as goals/[goalId]/route.ts).
//
// `linea_id` is deliberately NOT patchable here: moving a gasto to another
// línea presupuestal would require re-validating the new línea against this
// project all over again for no requirement this batch actually needs —
// out of scope, declared here rather than silently supported.

import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { parseDate, zodError } from "@/lib/api/crm";
import { getProjectForWrite, loadProjectScoped } from "@/lib/api/projects";
import { logAudit } from "@/lib/api/audit";
import { EXPENSE_SELECT } from "../route";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; expenseId: string }> };

export const EXPENSE_PATCH_SCHEMA = z
  .object({
    concepto: z.string().trim().min(1, "El concepto no puede estar vacío.").max(300, "El concepto es muy largo."),
    monto_cop: z.number().positive("El monto debe ser mayor a cero."),
    fecha_gasto: z.string().refine((v) => parseDate(v) !== null, "Fecha de gasto no válida."),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, "Envía al menos un campo para actualizar.");

async function loadExpense(proyectoId: string, expenseId: string) {
  return db.gasto.findFirst({
    where: { id: expenseId, proyecto_id: proyectoId, deleted_at: null },
    select: EXPENSE_SELECT,
  });
}

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos cargar el gasto. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, expenseId } = await ctx.params;

    const access = await loadProjectScoped(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND" ? "El proyecto no existe." : "No tienes permisos sobre este proyecto.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    const gasto = await loadExpense(id, expenseId);
    if (!gasto) {
      return apiError("El gasto no existe.", 404, "NOT_FOUND");
    }

    return NextResponse.json({ gasto });
  },
);

export const PATCH = withApiErrorHandling(
  "projects",
  "No pudimos actualizar el gasto. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, expenseId } = await ctx.params;

    const body = await parseJsonBody<unknown>(request);
    if (body === null) {
      return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
    }
    const parsed = EXPENSE_PATCH_SCHEMA.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const access = await getProjectForWrite(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND"
          ? "El proyecto no existe."
          : "No tienes permisos para actualizar gastos de este proyecto.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    const gasto = await loadExpense(id, expenseId);
    if (!gasto) {
      return apiError("El gasto no existe.", 404, "NOT_FOUND");
    }

    const data: Prisma.GastoUncheckedUpdateInput = {};
    if (parsed.data.concepto !== undefined) data.concepto = parsed.data.concepto;
    if (parsed.data.monto_cop !== undefined) data.monto_cop = parsed.data.monto_cop;
    if (parsed.data.fecha_gasto !== undefined) data.fecha_gasto = parseDate(parsed.data.fecha_gasto)!;

    const updated = await db.gasto.update({ where: { id: expenseId }, data, select: EXPENSE_SELECT });

    await logAudit({
      entidad: "presupuesto",
      entidad_id: expenseId,
      accion: "editar",
      usuario_id: auth.usuario.id,
      cambios: parsed.data,
    });

    return NextResponse.json({ gasto: updated });
  },
);

export const DELETE = withApiErrorHandling(
  "projects",
  "No pudimos eliminar el gasto. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, expenseId } = await ctx.params;

    const access = await getProjectForWrite(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND"
          ? "El proyecto no existe."
          : "No tienes permisos para eliminar gastos de este proyecto.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    const gasto = await loadExpense(id, expenseId);
    if (!gasto) {
      return apiError("El gasto no existe.", 404, "NOT_FOUND");
    }

    await db.gasto.update({ where: { id: expenseId }, data: { deleted_at: new Date() } });

    await logAudit({
      entidad: "presupuesto",
      entidad_id: expenseId,
      accion: "eliminar",
      usuario_id: auth.usuario.id,
    });

    return new NextResponse(null, { status: 204 });
  },
);
