// GET /api/v1/projects/:id/objectives — live objectives of a project (S3 U1).
// POST /api/v1/projects/:id/objectives — add an objective to a BORRADOR project.
//
// GET reuses the membership-aware read scope of the ficha. POST is manager-only
// and BORRADOR-only. The duplicate-code conflict is the partial unique index
// `objetivos_codigo_activo_uq` (P2002 -> 409), never a read-then-write check.
// The creation and its `CREAR objetivo` audit row share one transaction.

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { logChange } from "@/lib/api/audit-cambios";
import {
  codigoField,
  conflict,
  gateEstructuraRead,
  gateEstructuraWrite,
  isUniqueViolation,
  ordenField,
  parseEstructuraBody,
  ESTRUCTURA_STATE_MESSAGE,
} from "@/lib/api/estructura";
import { toObjetivoView } from "@/lib/proyectos/objetivo";
import { lockProyectoBorrador } from "@/lib/api/presupuesto";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const OBJETIVO_INDEX = "objetivos_codigo_activo_uq";
export const OBJETIVO_DUPLICATE_MESSAGE = "Ya existe un objetivo con ese código en el proyecto.";

export const OBJETIVO_CREATE_SCHEMA = z
  .object({
    codigo: codigoField,
    descripcion: z
      .string({ error: "La descripción es obligatoria." })
      .trim()
      .min(1, "La descripción no puede estar vacía.")
      .max(2000, "La descripción es muy larga."),
    orden: ordenField.optional(),
  })
  .strict();

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos cargar los objetivos. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const gate = await gateEstructuraRead(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const objetivos = await db.objetivo.findMany({
      where: { proyecto_id: id, deleted_at: null },
      orderBy: [{ orden: "asc" }, { codigo: "asc" }],
    });

    return NextResponse.json({ objetivos: objetivos.map(toObjetivoView) });
  },
);

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos crear el objetivo. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const gate = await gateEstructuraWrite(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const body = await parseEstructuraBody(request, OBJETIVO_CREATE_SCHEMA);
    if (!body.ok) return body.response;

    let orden = body.value.orden;
    if (orden === undefined) {
      const max = await db.objetivo.aggregate({
        where: { proyecto_id: id, deleted_at: null },
        _max: { orden: true },
      });
      orden = (max._max.orden ?? 0) + 1;
    }

    try {
      const row = await db.$transaction(async (tx) => {
        await lockProyectoBorrador(tx, id, ESTRUCTURA_STATE_MESSAGE);
        const created = await tx.objetivo.create({
          data: {
            proyecto_id: id,
            codigo: body.value.codigo,
            descripcion: body.value.descripcion,
            orden,
          },
        });

        await logChange(tx, {
          usuario_id: auth.usuario.id,
          accion: "CREAR",
          entidad: "objetivo",
          entidad_id: created.id,
          proyecto_id: id,
          valor_nuevo: {
            codigo: created.codigo,
            descripcion: created.descripcion,
            orden: created.orden,
          },
        });

        return created;
      });

      return NextResponse.json({ objetivo: toObjetivoView(row) }, { status: 201 });
    } catch (err) {
      if (isUniqueViolation(err, OBJETIVO_INDEX)) return conflict(OBJETIVO_DUPLICATE_MESSAGE);
      throw err;
    }
  },
);
