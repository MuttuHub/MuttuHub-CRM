// GET /api/v1/projects/:id/beneficiaries — beneficiary records and their live total (S4 U4).
// POST — register a count of beneficiaries.
//
// Create: ADMINISTRADOR/GERENCIA or an active-member COORDINADOR, only while the
// project is EN_EJECUCION (404 -> 403 -> 409 -> 400). `cantidad` is an integer
// > 0; the date cannot be after today in Bogota; an optional `actividad_id`
// must be a live activity of the same project (400 otherwise). Voided rows are
// listed but excluded from `total`.

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { logChange } from "@/lib/api/audit-cambios";
import { parseEstructuraBody } from "@/lib/api/estructura";
import { gateEjecucionRead, gateEjecucionWrite } from "@/lib/api/ejecucion";
import { toBeneficiarioView, totalBeneficiarios } from "@/lib/api/mediciones";
import { todayInBogota } from "@/lib/proyectos/weeks";
import { fechaField } from "@/app/api/v1/projects/[id]/deliverables/[deliverableId]/progress/route";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const FECHA_BENEFICIARIOS_FUTURA_MESSAGE = "La fecha del registro no puede ser posterior a hoy.";
export const ACTIVIDAD_AJENA_MESSAGE = "La actividad no existe en este proyecto.";

export const BENEFICIARIOS_CREATE_SCHEMA = z
  .object({
    fecha: fechaField,
    cantidad: z
      .number({ error: "Ingresa un número válido." })
      .int("La cantidad debe ser un número entero.")
      .min(1, "La cantidad debe ser mayor que 0.")
      .max(1_000_000_000, "La cantidad es demasiado alta."),
    actividad_id: z.string().min(1, "La actividad no es válida.").optional(),
    observacion: z.string().trim().max(2000, "La observación es demasiado larga.").optional(),
  })
  .strict();

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos cargar los beneficiarios. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const gate = await gateEjecucionRead(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const rows = await db.registroBeneficiario.findMany({
      where: { proyecto_id: id },
      orderBy: [{ fecha: "asc" }, { created_at: "asc" }],
    });

    return NextResponse.json({
      estado: gate.value.estado,
      registros: rows.map(toBeneficiarioView),
      total: totalBeneficiarios(rows),
    });
  },
);

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos registrar los beneficiarios. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const gate = await gateEjecucionWrite(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const body = await parseEstructuraBody(request, BENEFICIARIOS_CREATE_SCHEMA);
    if (!body.ok) return body.response;
    const input = body.value;

    if (input.fecha > todayInBogota()) {
      return apiError(FECHA_BENEFICIARIOS_FUTURA_MESSAGE, 400, "VALIDATION_ERROR");
    }
    if (input.actividad_id !== undefined) {
      const actividad = await db.actividad.findFirst({
        where: { id: input.actividad_id, proyecto_id: id, deleted_at: null },
        select: { id: true },
      });
      if (!actividad) return apiError(ACTIVIDAD_AJENA_MESSAGE, 400, "VALIDATION_ERROR");
    }

    const row = await db.$transaction(async (tx) => {
      const created = await tx.registroBeneficiario.create({
        data: {
          proyecto_id: id,
          actividad_id: input.actividad_id ?? null,
          fecha: new Date(`${input.fecha}T00:00:00.000Z`),
          cantidad: input.cantidad,
          observacion: input.observacion && input.observacion.length > 0 ? input.observacion : null,
          registrado_por_id: auth.usuario.id,
        },
      });
      await logChange(tx, {
        usuario_id: auth.usuario.id,
        accion: "CREAR",
        entidad: "beneficiarios",
        entidad_id: created.id,
        proyecto_id: id,
        valor_nuevo: {
          actividad_id: created.actividad_id,
          fecha: input.fecha,
          cantidad: created.cantidad,
          observacion: created.observacion,
        },
      });
      return created;
    });

    return NextResponse.json({ registro: toBeneficiarioView(row) }, { status: 201 });
  },
);
