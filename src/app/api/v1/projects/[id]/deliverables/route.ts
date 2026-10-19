// GET /api/v1/projects/:id/deliverables — live deliverables of a project (S3 U3).
// POST /api/v1/projects/:id/deliverables — add a deliverable to an activity.
//
// A deliverable is one measurable product of an activity: it needs a goal
// quantity > 0, a unit and the kind of evidence required (free text). Manager-
// only and BORRADOR-only (404 -> 403 -> 409 -> 400). The activity must be a live
// one of the same project (the composite foreign key backs it up). The code is
// unique per PROJECT among live rows through the partial unique index
// `entregables_codigo_activo_uq` (P2002 -> 409).

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { logChange } from "@/lib/api/audit-cambios";
import {
  cantidadPositivaField,
  codigoField,
  conflict,
  gateEstructuraRead,
  gateEstructuraWrite,
  isUniqueViolation,
  parseEstructuraBody,
  textoField,
  toDecimal2,
  ESTRUCTURA_STATE_MESSAGE,
} from "@/lib/api/estructura";
import { toEntregableView } from "@/lib/proyectos/entregable";
import { lockProyectoBorrador } from "@/lib/api/presupuesto";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const ENTREGABLE_INDEX = "entregables_codigo_activo_uq";
export const ENTREGABLE_DUPLICATE_MESSAGE = "Ya existe un entregable con ese código en el proyecto.";
export const ACTIVIDAD_AJENA_MESSAGE = "La actividad no existe en este proyecto.";

export const ENTREGABLE_CREATE_SCHEMA = z
  .object({
    actividad_id: z.string({ error: "La actividad es obligatoria." }).min(1, "La actividad es obligatoria."),
    codigo: codigoField,
    descripcion: textoField("La descripción", 2000),
    cantidad_meta: cantidadPositivaField,
    unidad: textoField("La unidad", 100),
    tipo_medio_exigido: textoField("El tipo de medio exigido", 200),
  })
  .strict();

/** The activity must be a live one of this very project. */
export async function checkActividadDelProyecto(
  proyectoId: string,
  actividadId: string,
): Promise<Response | null> {
  const actividad = await db.actividad.findFirst({
    where: { id: actividadId, proyecto_id: proyectoId, deleted_at: null },
    select: { id: true },
  });
  return actividad ? null : apiError(ACTIVIDAD_AJENA_MESSAGE, 400, "VALIDATION_ERROR");
}

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos cargar los entregables. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const gate = await gateEstructuraRead(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const entregables = await db.entregable.findMany({
      where: { proyecto_id: id, deleted_at: null },
      orderBy: [{ codigo: "asc" }],
    });

    return NextResponse.json({ entregables: entregables.map(toEntregableView) });
  },
);

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos crear el entregable. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const gate = await gateEstructuraWrite(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const body = await parseEstructuraBody(request, ENTREGABLE_CREATE_SCHEMA);
    if (!body.ok) return body.response;
    const input = body.value;

    const actividadAjena = await checkActividadDelProyecto(id, input.actividad_id);
    if (actividadAjena) return actividadAjena;

    try {
      const row = await db.$transaction(async (tx) => {
        await lockProyectoBorrador(tx, id, ESTRUCTURA_STATE_MESSAGE);
        const created = await tx.entregable.create({
          data: {
            proyecto_id: id,
            actividad_id: input.actividad_id,
            codigo: input.codigo,
            descripcion: input.descripcion,
            cantidad_meta: toDecimal2(input.cantidad_meta),
            unidad: input.unidad,
            tipo_medio_exigido: input.tipo_medio_exigido,
          },
        });

        await logChange(tx, {
          usuario_id: auth.usuario.id,
          accion: "CREAR",
          entidad: "entregable",
          entidad_id: created.id,
          proyecto_id: id,
          valor_nuevo: {
            actividad_id: created.actividad_id,
            codigo: created.codigo,
            descripcion: created.descripcion,
            cantidad_meta: created.cantidad_meta,
            unidad: created.unidad,
            tipo_medio_exigido: created.tipo_medio_exigido,
          },
        });

        return created;
      });

      return NextResponse.json({ entregable: toEntregableView(row) }, { status: 201 });
    } catch (err) {
      if (isUniqueViolation(err, ENTREGABLE_INDEX)) return conflict(ENTREGABLE_DUPLICATE_MESSAGE);
      throw err;
    }
  },
);
