// POST /api/v1/projects/:id/expenses/:expenseId/validate (S6 U4, RF-22).
//
// ADMINISTRADOR/GERENCIA other than the registrant (segregation of duties, also a DB CHECK).
// Order: 404 -> 403 -> 404 -> 403 (own) -> 409 -> transaction. Validating beyond the assigned
// amount of the rubro is blocked: the flag and the notifications are committed and the answer is
// 409 OVERSPEND_BLOCKED (the transaction RETURNS a blocked result, it never throws).

import { NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/api/handler";
import { apiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { canValidateExpense } from "@/lib/permissions";
import { conflict } from "@/lib/api/estructura";
import { GASTO_FORBIDDEN_MESSAGE, toGastoView } from "@/lib/api/gastos";
import {
  DATOS_INCOMPLETOS_MESSAGE,
  OVERSPEND_MESSAGE,
  SOLO_REGISTRADO_MESSAGE,
  VALIDAR_PROPIO_MESSAGE,
  gateGastoGestion,
  validarEnTransaccion,
} from "@/lib/api/validacion-gastos";
import { datosIncompletos } from "@/lib/proyectos/gastos";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; expenseId: string }> };

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos validar el gasto. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, expenseId } = await ctx.params;

    const gate = await gateGastoGestion(auth.usuario, id, expenseId);
    if (!gate.ok) return gate.response;
    const gasto = gate.value;

    if (!canValidateExpense(gasto, auth.usuario)) {
      return apiError(gasto.registrado_por_id === auth.usuario.id ? VALIDAR_PROPIO_MESSAGE : GASTO_FORBIDDEN_MESSAGE, 403, "FORBIDDEN");
    }
    if (gasto.estado !== "REGISTRADO") return apiError(SOLO_REGISTRADO_MESSAGE, 409, "INVALID_STATE");
    if (datosIncompletos(gasto)) return conflict(DATOS_INCOMPLETOS_MESSAGE);

    const resultado = await db.$transaction((tx) =>
      validarEnTransaccion(tx, { gasto, validadorId: auth.usuario.id }),
    );
    if ("incompleto" in resultado) return conflict(DATOS_INCOMPLETOS_MESSAGE);
    if ("stale" in resultado) return apiError(SOLO_REGISTRADO_MESSAGE, 409, "INVALID_STATE");
    if (resultado.blocked) return apiError(OVERSPEND_MESSAGE, 409, "OVERSPEND_BLOCKED");

    return NextResponse.json({ gasto: toGastoView(resultado.gasto, { puedeVerSoportes: true }) });
  },
);
