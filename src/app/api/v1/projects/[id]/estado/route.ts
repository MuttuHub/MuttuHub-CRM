// POST /api/v1/projects/:id/estado — suspend, reactivate, close, reopen or cancel a project (B7).
//
// Body `{ accion, motivo }`. ADM/GER only (PO decision D-C). The estado change and its audit
// lote go in one transaction (`cambiarEstadoProyecto`), which re-checks the transition under
// the row lock. Order: project (404) -> permission (403) -> body (400) -> transition (409).

import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { canManageProjects } from "@/lib/permissions";
import { parseEstructuraBody } from "@/lib/api/estructura";
import { CAMBIO_ESTADO_SCHEMA, cambiarEstadoProyecto } from "@/lib/api/estado-proyecto";
import { destinoDeAccion, mensajeRechazo } from "@/lib/proyectos/transiciones-estado";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos cambiar el estado del proyecto. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const proyecto = await db.proyecto.findFirst({
      where: { id, deleted_at: null },
      select: { id: true, estado: true },
    });
    if (!proyecto) return apiError("El proyecto no existe.", 404, "NOT_FOUND");
    if (!canManageProjects(auth.usuario)) {
      return apiError("No tienes permisos sobre este proyecto.", 403, "FORBIDDEN");
    }

    const body = await parseEstructuraBody(request, CAMBIO_ESTADO_SCHEMA);
    if (!body.ok) return body.response;
    const { accion, motivo } = body.value;

    if (destinoDeAccion(accion, proyecto.estado) === null) {
      return apiError(mensajeRechazo(accion), 409, "INVALID_STATE");
    }

    // The writer repeats the check under the row lock; a RespuestaAbortada becomes its response.
    const resultado = await db.$transaction((tx) =>
      cambiarEstadoProyecto(tx, { proyectoId: id, usuarioId: auth.usuario.id, accion, motivo }),
    );
    return NextResponse.json(resultado);
  },
);
