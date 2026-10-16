// POST /api/v1/projects/:id/expenses/:expenseId/reject (S6 U4, RF-22).
//
// ADMINISTRADOR/GERENCIA other than the registrant, with a motivo, on a REGISTRADO expense.
// The identification is not required to reject. The registrant may correct a RECHAZADO expense
// through PATCH (it returns to REGISTRADO). The rejection notifies the registrant (M7). Order: 404 -> 403 -> 404 -> 403 (own) -> 400 -> 409.

import { NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/api/handler";
import { apiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { canValidateExpense } from "@/lib/permissions";
import { logChange } from "@/lib/api/audit-cambios";
import { notificarGastoRechazado } from "@/lib/api/notificaciones-proyecto";
import { parseEstructuraBody } from "@/lib/api/estructura";
import { GASTO_FORBIDDEN_MESSAGE, GASTO_INCLUDE, toGastoView } from "@/lib/api/gastos";
import {
  MOTIVO_GASTO_SCHEMA,
  GASTO_PROYECTO_ESTADO_MESSAGE,
  RECHAZAR_PROPIO_MESSAGE,
  SOLO_REGISTRADO_MESSAGE,
  gateGastoDecision,
  proyectoPermiteValidacion,
} from "@/lib/api/validacion-gastos";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; expenseId: string }> };

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos rechazar el gasto. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, expenseId } = await ctx.params;

    const gate = await gateGastoDecision(auth.usuario, id, expenseId);
    if (!gate.ok) return gate.response;
    const gasto = gate.value;

    // Rejecting follows the same segregation as validating (also a DB CHECK).
    if (!canValidateExpense(gasto, auth.usuario)) {
      return apiError(gasto.registrado_por_id === auth.usuario.id ? RECHAZAR_PROPIO_MESSAGE : GASTO_FORBIDDEN_MESSAGE, 403, "FORBIDDEN");
    }

    const body = await parseEstructuraBody(request, MOTIVO_GASTO_SCHEMA);
    if (!body.ok) return body.response;
    const { motivo } = body.value;

    if (gasto.estado !== "REGISTRADO") return apiError(SOLO_REGISTRADO_MESSAGE, 409, "INVALID_STATE");

    const actualizado = await db.$transaction(async (tx) => {
      // The project estado that allowed this is re-checked under lock (a close may have raced the gate).
      if (!(await proyectoPermiteValidacion(tx, id))) return "proyecto-no-activo" as const;
      const { count } = await tx.gasto.updateMany({
        where: { id: expenseId, proyecto_id: id, estado: "REGISTRADO" },
        data: {
          estado: "RECHAZADO",
          rechazado_por_id: auth.usuario.id,
          rechazado_at: new Date(),
          motivo_rechazo: motivo,
        },
      });
      if (count === 0) return null; // a racing validation or rejection won
      await logChange(tx, {
        usuario_id: auth.usuario.id,
        accion: "RECHAZAR",
        entidad: "gasto",
        entidad_id: expenseId,
        proyecto_id: id,
        campo: "estado",
        valor_anterior: "REGISTRADO",
        valor_nuevo: { estado: "RECHAZADO", motivo },
      });
      // M7: the author learns of the rejection in the same commit that records it.
      await notificarGastoRechazado(tx, {
        gastoId: expenseId,
        proyectoId: id,
        autorId: gasto.registrado_por_id,
        rechazadoPorId: auth.usuario.id,
      });
      return tx.gasto.findFirstOrThrow({ where: { id: expenseId }, include: GASTO_INCLUDE });
    });
    if (actualizado === "proyecto-no-activo") return apiError(GASTO_PROYECTO_ESTADO_MESSAGE, 409, "INVALID_STATE");
    if (!actualizado) return apiError(SOLO_REGISTRADO_MESSAGE, 409, "INVALID_STATE");

    return NextResponse.json({ gasto: toGastoView(actualizado, { puedeVerSoportes: true }) });
  },
);
