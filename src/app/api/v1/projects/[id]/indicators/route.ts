// GET /api/v1/projects/:id/indicators — live result indicators (S3 U3).
// POST /api/v1/projects/:id/indicators — add an indicator to an objective.
//
// An indicator needs an objective, a code (`IND-01`), a name, a goal > 0 and a
// unit; the baseline is optional and >= 0. Manager-only and BORRADOR-only (404
// -> 403 -> 409 -> 400). The objective must be a live one of the same project
// (the composite foreign key backs it up). The code is unique per project among
// live rows through `indicadores_codigo_activo_uq` (P2002 -> 409).

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { logChange } from "@/lib/api/audit-cambios";
import {
  cantidadNoNegativaField,
  checkObjetivoDelProyecto,
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
import { toIndicadorView } from "@/lib/proyectos/indicador";
import { lockProyectoBorrador } from "@/lib/api/presupuesto";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const INDICADOR_INDEX = "indicadores_codigo_activo_uq";
export const INDICADOR_DUPLICATE_MESSAGE = "Ya existe un indicador con ese código en el proyecto.";

export const INDICADOR_CREATE_SCHEMA = z
  .object({
    objetivo_id: z.string({ error: "El objetivo es obligatorio." }).min(1, "El objetivo es obligatorio."),
    codigo: codigoField,
    nombre: textoField("El nombre", 300),
    meta: cantidadPositivaField,
    unidad: textoField("La unidad", 100),
    linea_base: cantidadNoNegativaField.nullable().optional(),
  })
  .strict();

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos cargar los indicadores. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const gate = await gateEstructuraRead(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const indicadores = await db.indicador.findMany({
      where: { proyecto_id: id, deleted_at: null },
      orderBy: [{ codigo: "asc" }],
    });

    return NextResponse.json({ indicadores: indicadores.map(toIndicadorView) });
  },
);

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos crear el indicador. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const gate = await gateEstructuraWrite(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const body = await parseEstructuraBody(request, INDICADOR_CREATE_SCHEMA);
    if (!body.ok) return body.response;
    const input = body.value;

    const objetivoAjeno = await checkObjetivoDelProyecto(id, input.objetivo_id);
    if (objetivoAjeno) return objetivoAjeno;

    try {
      const row = await db.$transaction(async (tx) => {
        await lockProyectoBorrador(tx, id, ESTRUCTURA_STATE_MESSAGE);
        const created = await tx.indicador.create({
          data: {
            proyecto_id: id,
            objetivo_id: input.objetivo_id,
            codigo: input.codigo,
            nombre: input.nombre,
            meta: toDecimal2(input.meta),
            unidad: input.unidad,
            linea_base:
              input.linea_base === undefined || input.linea_base === null
                ? null
                : toDecimal2(input.linea_base),
          },
        });

        await logChange(tx, {
          usuario_id: auth.usuario.id,
          accion: "CREAR",
          entidad: "indicador",
          entidad_id: created.id,
          proyecto_id: id,
          valor_nuevo: {
            objetivo_id: created.objetivo_id,
            codigo: created.codigo,
            nombre: created.nombre,
            meta: created.meta,
            unidad: created.unidad,
            linea_base: created.linea_base,
          },
        });

        return created;
      });

      return NextResponse.json({ indicador: toIndicadorView(row) }, { status: 201 });
    } catch (err) {
      if (isUniqueViolation(err, INDICADOR_INDEX)) return conflict(INDICADOR_DUPLICATE_MESSAGE);
      throw err;
    }
  },
);
