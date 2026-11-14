// POST /api/v1/projects/:id/programming/move — T13 (S4): «El Gestor puede mover valores entre meses de una misma
// línea sin aprobación, siempre que el total de la línea no cambie.» Only while the project is EN_EJECUCION; in
// BORRADOR the full programming PUT stays the way to program.
//
// Same permission as the programming writes (who may edit the project's data). The current month is the Bogota one
// (`periodOf(todayInBogota())`, like the modification rules). The rule runs in `moverProgramacion` under the project
// lock: 400 for the same month, a closed month, a value above the origin month, a month outside the project or a
// line of another project; 409 when the project left EN_EJECUCION meanwhile. Answers the programming view.

import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiErrorHandling } from "@/lib/api/handler";
import { apiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { parseEstructuraBody } from "@/lib/api/estructura";
import { RespuestaAbortada, gateProgramacionMover, moverProgramacion, parseMonto } from "@/lib/api/presupuesto";
import { periodOf, todayInBogota } from "@/lib/proyectos/weeks";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const PERIODO = /^\d{4}-(?:0[1-9]|1[0-2])$/;

export const PROGRAMMING_MOVE_SCHEMA = z
  .object({
    linea_id: z.string({ error: "La línea es obligatoria." }).min(1, "La línea es obligatoria."),
    origen: z.string({ error: "El mes de origen es obligatorio." }).regex(PERIODO, "El mes de origen no es válido (AAAA-MM)."),
    destino: z.string({ error: "El mes de destino es obligatorio." }).regex(PERIODO, "El mes de destino no es válido (AAAA-MM)."),
    valor: z.union([z.string(), z.number()], { error: "Ingresa un monto válido." }),
  })
  .strict();

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos mover el valor. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const gate = await gateProgramacionMover(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const body = await parseEstructuraBody(request, PROGRAMMING_MOVE_SCHEMA);
    if (!body.ok) return body.response;
    const monto = parseMonto(body.value.valor);
    if (!monto.ok) return apiError(monto.message, 400, "VALIDATION_ERROR");

    try {
      const vista = await db.$transaction((tx) =>
        moverProgramacion(tx, {
          proyectoId: id,
          usuarioId: auth.usuario.id,
          lineaId: body.value.linea_id,
          origen: body.value.origen,
          destino: body.value.destino,
          valor: monto.cents,
          periodoActual: periodOf(todayInBogota()),
        }),
      );
      return NextResponse.json(vista);
    } catch (error) {
      if (error instanceof RespuestaAbortada) return error.response;
      throw error;
    }
  },
);
