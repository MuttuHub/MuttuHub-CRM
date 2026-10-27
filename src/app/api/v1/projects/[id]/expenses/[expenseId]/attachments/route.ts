// POST /api/v1/projects/:id/expenses/:expenseId/attachments — attach a support to an expense that
// already exists (B8: imported expenses are created without one, the support comes separately).
//
// Same gate and rules as editing the expense (PATCH): ONLY the registrant, on an EN_EJECUCION project
// (404 -> 403 -> 409 -> 400), while the expense is REGISTRADO or RECHAZADO. The body is one item of
// `soportes[]` of POST /expenses (a file confirmed after `expenses/sign` + direct upload, or an https
// link) and goes through the same `validarSoporte`. At most 5 live supports per expense, re-checked under
// the transaction. Audit: one EDITAR row on the `soportes` count.

import { NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/api/handler";
import { apiError, RespuestaAbortada } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { logChange } from "@/lib/api/audit-cambios";
import { conflict, isUniqueViolation } from "@/lib/api/estructura";
import { gateEjecucionWrite } from "@/lib/api/ejecucion";
import { MEDIO_DUPLICADO_MESSAGE, STORAGE_PATH_INDEX, validarSoporte } from "@/lib/api/soportes";
import {
  ESTADOS_EDITABLES,
  GASTO_ANULADO_MESSAGE,
  GASTO_FORBIDDEN_MESSAGE,
  GASTO_INCLUDE,
  GASTO_NO_EXISTE,
  GASTO_VALIDADO_MESSAGE,
  MAX_SOPORTES,
  MAX_SOPORTES_MESSAGE,
  toGastoView,
} from "@/lib/api/gastos";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; expenseId: string }> };

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos adjuntar el soporte. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, expenseId } = await ctx.params;

    const gate = await gateEjecucionWrite(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const actual = await db.gasto.findFirst({ where: { id: expenseId, proyecto_id: id }, include: GASTO_INCLUDE });
    if (!actual) return apiError(GASTO_NO_EXISTE, 404, "NOT_FOUND");
    if (actual.registrado_por_id !== auth.usuario.id) return apiError(GASTO_FORBIDDEN_MESSAGE, 403, "FORBIDDEN");
    if (!ESTADOS_EDITABLES.includes(actual.estado)) {
      const message = actual.estado === "ANULADO" ? GASTO_ANULADO_MESSAGE : GASTO_VALIDADO_MESSAGE;
      return apiError(message, 409, "INVALID_STATE");
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
    }
    if (actual.soportes.length >= MAX_SOPORTES) return apiError(MAX_SOPORTES_MESSAGE, 400, "VALIDATION_ERROR");
    const soporte = await validarSoporte(id, raw);
    if (!soporte.ok) return soporte.response;

    try {
      const gasto = await db.$transaction(async (tx) => {
        const vivos = await tx.soporteProyecto.count({ where: { gasto_id: expenseId, deleted_at: null } });
        if (vivos >= MAX_SOPORTES) throw new RespuestaAbortada(apiError(MAX_SOPORTES_MESSAGE, 400, "VALIDATION_ERROR"));
        await tx.soporteProyecto.create({
          data: { proyecto_id: id, gasto_id: expenseId, subido_por_id: auth.usuario.id, ...soporte.value },
        });
        await logChange(tx, {
          usuario_id: auth.usuario.id,
          accion: "EDITAR",
          entidad: "gasto",
          entidad_id: expenseId,
          proyecto_id: id,
          campo: "soportes",
          valor_anterior: vivos,
          valor_nuevo: vivos + 1,
        });
        return tx.gasto.findFirstOrThrow({ where: { id: expenseId }, include: GASTO_INCLUDE });
      });
      return NextResponse.json({ gasto: toGastoView(gasto, { puedeVerSoportes: true }) }, { status: 201 });
    } catch (err) {
      if (err instanceof RespuestaAbortada) return err.response;
      if (isUniqueViolation(err, STORAGE_PATH_INDEX)) return conflict(MEDIO_DUPLICADO_MESSAGE);
      throw err;
    }
  },
);
