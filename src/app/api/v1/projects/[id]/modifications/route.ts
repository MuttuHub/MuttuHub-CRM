// GET /api/v1/projects/:id/modifications — the modification requests of a project (S8 U4).
// POST — request a modification (E-26, RF-28).
//
// POST: ADM/GER, or a COORDINADOR who is an active member (A-01); only for an EN_EJECUCION project
// with an approved baseline. The detail is dry-run against the live project with the same rules the
// approval applies (400 with every broken rule in `reglas`); the request stores the newest version
// number as its base, so the approval can detect that the project moved on since. Order: project
// (404) -> permission (403) -> estado (409) -> body (400).

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { logChange } from "@/lib/api/audit-cambios";
import { parseEstructuraBody } from "@/lib/api/estructura";
import {
  MODIFICACION_SCHEMA,
  SOLICITUD_SELECT,
  evaluarSolicitud,
  gateModificacionRead,
  gateModificacionRequest,
  loadNombres,
  toSolicitudView,
} from "@/lib/api/modificaciones";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos cargar las solicitudes de modificación. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const gate = await gateModificacionRead(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const filas = await db.solicitudModificacion.findMany({
      where: { proyecto_id: id },
      orderBy: [{ solicitado_at: "desc" }, { id: "desc" }],
      select: SOLICITUD_SELECT,
    });
    const nombres = await loadNombres(filas.flatMap((f) => [f.solicitado_por_id, ...(f.decidido_por_id ? [f.decidido_por_id] : [])]));
    return NextResponse.json({ solicitudes: filas.map((fila) => toSolicitudView(fila, nombres)) });
  },
);

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos registrar la solicitud. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const gate = await gateModificacionRequest(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const body = await parseEstructuraBody(request, MODIFICACION_SCHEMA);
    if (!body.ok) return body.response;

    // Read the base BEFORE the live project: if an approval slips in between, the stored base is the
    // older one and the request is refused as stale later, never accepted against a newer state.
    const { _max } = await db.versionProyecto.aggregate({ where: { proyecto_id: id }, _max: { numero: true } });
    const versionBase = _max.numero ?? 0;

    const { reglas } = await evaluarSolicitud(db, id, body.value);
    if (reglas.length > 0) {
      return apiError(reglas[0]!.mensaje, 400, "VALIDATION_ERROR", { reglas });
    }

    const fila = await db.$transaction(async (tx) => {
      const creada = await tx.solicitudModificacion.create({
        data: {
          proyecto_id: id,
          tipo: body.value.tipo,
          motivo: body.value.motivo,
          detalle: body.value.detalle as unknown as Prisma.InputJsonValue,
          version_base_numero: versionBase,
          solicitado_por_id: auth.usuario.id,
        },
        select: SOLICITUD_SELECT,
      });
      await logChange(tx, {
        usuario_id: auth.usuario.id,
        accion: "SOLICITAR",
        entidad: "solicitud",
        entidad_id: creada.id,
        proyecto_id: id,
        valor_nuevo: { tipo: body.value.tipo, motivo: body.value.motivo, version_base_numero: versionBase },
      });
      return creada;
    });

    const nombres = await loadNombres([auth.usuario.id]);
    return NextResponse.json({ solicitud: toSolicitudView(fila, nombres) }, { status: 201 });
  },
);
