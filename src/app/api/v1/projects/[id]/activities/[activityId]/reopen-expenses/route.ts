// POST /api/v1/projects/:id/activities/:activityId/reopen-expenses — reopen the activity's expenses (S11, EV-07).
//
// S11 proposes it and D4 accepts it: the Gestor reopens an activity whose expenses were closed, and the motivo
// stays in the ledger. The three closure columns go back to null, so the activity shows saldo again and its lines
// accept expenses, and the reopening is audited as `motivo_reapertura`.
//
// Gate: the same as closing (`gateEjecucionWrite`), then the body (400) and the activity (404). Reopening an
// activity whose expenses are open — including one another request reopened — is a 409 CONFLICT. The write and its
// audit rows share one transaction.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { gateEjecucionWrite } from "@/lib/api/ejecucion";
import { parseEstructuraBody } from "@/lib/api/estructura";
import {
  ACTIVIDAD_NO_EXISTE,
  ACTIVIDAD_SIN_CIERRE_MESSAGE,
  CIERRE_GASTOS_SELECT,
  REAPERTURA_GASTOS_SCHEMA,
  reabrirGastosActividad,
} from "@/lib/api/cierre-gastos";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; activityId: string }> };

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos reabrir los gastos de la actividad. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, activityId } = await ctx.params;

    const gate = await gateEjecucionWrite(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const body = await parseEstructuraBody(request, REAPERTURA_GASTOS_SCHEMA);
    if (!body.ok) return body.response;

    const actividad = await db.actividad.findFirst({
      where: { id: activityId, proyecto_id: id, deleted_at: null },
      select: CIERRE_GASTOS_SELECT,
    });
    if (!actividad) return apiError(ACTIVIDAD_NO_EXISTE, 404, "NOT_FOUND");
    if (actividad.gastos_cerrados_at === null) {
      return apiError(ACTIVIDAD_SIN_CIERRE_MESSAGE, 409, "CONFLICT");
    }

    // The writer pins the closed state inside the transaction: this read is for the 404 and the fast 409 only.
    const reapertura = await db.$transaction((tx) =>
      reabrirGastosActividad(tx, {
        actividad,
        proyectoId: id,
        usuarioId: auth.usuario.id,
        motivo: body.value.motivo,
      }),
    );
    return NextResponse.json({ actividad: reapertura });
  },
);
