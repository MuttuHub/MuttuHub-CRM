// POST /api/v1/projects/:id/programming/confirm — T13 (S7): «El Gestor confirma la programación cuando
// “Falta por programar” queda en $0 en todas las líneas. Después el Gerente aprueba la línea base, como hoy.»
//
// Same gate as the programming PUT (who programs, confirms) and the same project periods. The rule runs in
// `confirmarProgramacion` under the BORRADOR lock: 409 with the pending lines, otherwise who and when are
// recorded. Any later budget or programming write clears the confirmation (`limpiarConfirmacion`).

import { NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/api/handler";
import { apiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { RespuestaAbortada, confirmarProgramacion, gatePresupuestoWrite } from "@/lib/api/presupuesto";
import { isoDate } from "@/lib/proyectos/proyecto-general";
import { projectPeriods } from "@/lib/proyectos/weeks";
import { SIN_FECHAS_MESSAGE } from "../route";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos confirmar la programación. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const gate = await gatePresupuestoWrite(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const { fecha_inicio: inicio, fecha_fin: fin } = gate.value;
    if (!inicio || !fin || fin < inicio) return apiError(SIN_FECHAS_MESSAGE, 409, "INVALID_STATE");
    const periodos = projectPeriods(isoDate(inicio), isoDate(fin));

    try {
      const vista = await db.$transaction((tx) =>
        confirmarProgramacion(tx, { proyectoId: id, usuarioId: auth.usuario.id, periodos }),
      );
      return NextResponse.json(vista);
    } catch (error) {
      if (error instanceof RespuestaAbortada) return error.response;
      throw error;
    }
  },
);
