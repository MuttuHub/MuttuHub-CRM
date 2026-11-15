// POST /api/v1/projects/:id/activities/:activityId/close-expenses — «Cerrar gastos de la actividad» (S11, EV-07).
//
// The Gestor closes the activity's expenses with a mandatory `nota` that explains the difference between the
// assigned amount and the executed one («No se requirió transporte porque el taller fue en el mismo municipio»).
// From then on the activity shows ahorro or sobreejecución with that note (5-B reads the state from here) and its
// lines stop admitting new expenses.
//
// Gate: the same as registering an expense (`gateEjecucionWrite`: 404 -> 403 -> 409 when the project is not
// EN_EJECUCION), because closing is an execution decision about that activity's spending. Then the body (400) and
// the activity (404). Closing an activity that is already closed — including one another request closed after
// this one read it — is a 409 CONFLICT, never a silent success. The three columns and their audit rows share one
// transaction.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { gateEjecucionWrite } from "@/lib/api/ejecucion";
import { parseEstructuraBody } from "@/lib/api/estructura";
import {
  ACTIVIDAD_NO_EXISTE,
  ACTIVIDAD_YA_CERRADA_MESSAGE,
  CIERRE_GASTOS_SCHEMA,
  CIERRE_GASTOS_SELECT,
  cerrarGastosActividad,
} from "@/lib/api/cierre-gastos";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; activityId: string }> };

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos cerrar los gastos de la actividad. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, activityId } = await ctx.params;

    const gate = await gateEjecucionWrite(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const body = await parseEstructuraBody(request, CIERRE_GASTOS_SCHEMA);
    if (!body.ok) return body.response;

    const actividad = await db.actividad.findFirst({
      where: { id: activityId, proyecto_id: id, deleted_at: null },
      select: CIERRE_GASTOS_SELECT,
    });
    if (!actividad) return apiError(ACTIVIDAD_NO_EXISTE, 404, "NOT_FOUND");
    if (actividad.gastos_cerrados_at !== null) {
      return apiError(ACTIVIDAD_YA_CERRADA_MESSAGE, 409, "CONFLICT");
    }

    // The writer pins the state again inside the transaction: this read is for the 404 and the fast 409 only.
    const cierre = await db.$transaction((tx) =>
      cerrarGastosActividad(tx, {
        actividad,
        proyectoId: id,
        usuarioId: auth.usuario.id,
        nota: body.value.nota,
      }),
    );
    return NextResponse.json({ actividad: cierre });
  },
);
