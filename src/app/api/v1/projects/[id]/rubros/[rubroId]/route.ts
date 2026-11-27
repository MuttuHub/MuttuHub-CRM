// PUT /api/v1/projects/:id/rubros/:rubroId — switch a catalogue rubro on or off for THIS project only
// (B6, odd/tasks/producto-pendientes-2026-11.md S1, decision L7 «Bloquear»). Body: `{ habilitado: boolean }`.
//
// Order: project (404) -> budget-edit permission (403) -> body (400) -> under the project lock: estado
// BORRADOR or EN_EJECUCION (409) -> rubro (404) -> disabling needs the rubro at $0 with no expenses in the
// project (409 CONFLICT with the reason). Re-enabling is always allowed. Answers `{ rubro_id, habilitado }`.

import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiErrorHandling } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { parseEstructuraBody } from "@/lib/api/estructura";
import { RespuestaAbortada } from "@/lib/api/errors";
import { cambiarHabilitacionRubro, gateRubrosProyecto } from "@/lib/api/rubros-proyecto";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; rubroId: string }> };

export const RUBRO_PROYECTO_PUT_SCHEMA = z
  .object({
    habilitado: z.boolean({ error: "Indica si el rubro queda habilitado (true) o deshabilitado (false)." }),
  })
  .strict();

export const PUT = withApiErrorHandling(
  "projects",
  "No pudimos cambiar el rubro del proyecto. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, rubroId } = await ctx.params;

    const gate = await gateRubrosProyecto(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const body = await parseEstructuraBody(request, RUBRO_PROYECTO_PUT_SCHEMA);
    if (!body.ok) return body.response;

    try {
      const resultado = await db.$transaction((tx) =>
        cambiarHabilitacionRubro(tx, {
          proyectoId: id,
          rubroId,
          habilitado: body.value.habilitado,
          usuarioId: auth.usuario.id,
        }),
      );
      return NextResponse.json(resultado);
    } catch (error) {
      if (error instanceof RespuestaAbortada) return error.response;
      throw error;
    }
  },
);
