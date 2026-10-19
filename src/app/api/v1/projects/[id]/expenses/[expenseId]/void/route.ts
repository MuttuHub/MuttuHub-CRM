// POST /api/v1/projects/:id/expenses/:expenseId/void (S6 U4, RF-22).
//
// ADMINISTRADOR/GERENCIA, any project estado (a mistake must stay correctable), only a VALIDADO
// expense: the row is kept with estado ANULADO and the anulado_* columns; E drops it because the
// financial loader only reads VALIDADO. Order: 404 -> 403 -> 404 -> 400 -> 409.

import { NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/api/handler";
import { apiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { logChange } from "@/lib/api/audit-cambios";
import { parseEstructuraBody } from "@/lib/api/estructura";
import { GASTO_INCLUDE, toGastoView } from "@/lib/api/gastos";
import { MOTIVO_GASTO_SCHEMA, SOLO_VALIDADO_MESSAGE, gateGastoGestion } from "@/lib/api/validacion-gastos";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; expenseId: string }> };

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos anular el gasto. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, expenseId } = await ctx.params;

    const gate = await gateGastoGestion(auth.usuario, id, expenseId);
    if (!gate.ok) return gate.response;
    const gasto = gate.value;

    const body = await parseEstructuraBody(request, MOTIVO_GASTO_SCHEMA);
    if (!body.ok) return body.response;
    const { motivo } = body.value;

    if (gasto.estado !== "VALIDADO") return apiError(SOLO_VALIDADO_MESSAGE, 409, "INVALID_STATE");

    const actualizado = await db.$transaction(async (tx) => {
      const { count } = await tx.gasto.updateMany({
        where: { id: expenseId, proyecto_id: id, estado: "VALIDADO" },
        data: {
          estado: "ANULADO",
          anulado_por_id: auth.usuario.id,
          anulado_at: new Date(),
          motivo_anulacion: motivo,
        },
      });
      if (count === 0) return null; // a concurrent void won the race
      await logChange(tx, {
        usuario_id: auth.usuario.id,
        accion: "ANULAR",
        entidad: "gasto",
        entidad_id: expenseId,
        proyecto_id: id,
        campo: "estado",
        valor_anterior: "VALIDADO",
        valor_nuevo: { estado: "ANULADO", motivo },
      });
      return tx.gasto.findFirstOrThrow({ where: { id: expenseId }, include: GASTO_INCLUDE });
    });
    if (!actualizado) return apiError(SOLO_VALIDADO_MESSAGE, 409, "INVALID_STATE");

    return NextResponse.json({ gasto: toGastoView(actualizado, { puedeVerSoportes: true }) });
  },
);
