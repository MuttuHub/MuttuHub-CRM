// PATCH /api/v1/municipalities/:id — ADMINISTRADOR only. Renames (`nombre`,
// `departamento`), fixes or clears the optional `codigo_dane` and
// suspends/restores (`activo`). Suspending stamps `fecha_suspension`;
// restoring clears it.
// DELETE /api/v1/municipalities/:id — ADMINISTRADOR only. Soft delete: the row
// is suspended (`activo: false` + `fecha_suspension`), never removed. There is
// no hard delete anywhere in this module.
//
// The v2 audit log (`logChanges`, per-field before/after) is written in the
// SAME transaction as the update (ADR-05): if the audit fails, the business
// change fails with it.

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiRole } from "@/lib/supabase/server";
import { diffFields, logChanges } from "@/lib/api/audit-cambios";
import {
  CODIGO_DANE_SCHEMA,
  MUNICIPIO_MESSAGES,
  MUNICIPIO_SELECT,
  municipioConflictMessage,
} from "../route";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const MUNICIPIO_PATCH_SCHEMA = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, "El nombre no puede estar vacío.")
    .max(120, "El nombre es muy largo.")
    .optional(),
  departamento: z
    .string()
    .trim()
    .min(1, "El departamento no puede estar vacío.")
    .max(120, "El departamento es muy largo.")
    .optional(),
  codigo_dane: CODIGO_DANE_SCHEMA,
  activo: z.boolean().optional(),
});

/** Fields the audit diff watches. */
const AUDITED_FIELDS = ["nombre", "departamento", "codigo_dane", "activo", "fecha_suspension"] as const;

/** Suspension is always `activo: false` plus the timestamp that proves it. */
function suspensionData() {
  return { activo: false, fecha_suspension: new Date() };
}

export const PATCH = withApiErrorHandling(
  "municipalities",
  "No pudimos actualizar el municipio. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiRole(["ADMINISTRADOR"]);
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const body = await parseJsonBody<Record<string, unknown>>(request);
    if (body === null) {
      return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
    }

    const parsed = MUNICIPIO_PATCH_SCHEMA.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "Datos no válidos.", 400, "VALIDATION_ERROR");
    }
    const { nombre, departamento, codigo_dane, activo } = parsed.data;
    if (
      nombre === undefined &&
      departamento === undefined &&
      codigo_dane === undefined &&
      activo === undefined
    ) {
      return apiError("Envía 'nombre', 'departamento', 'codigo_dane' o 'activo'.", 400, "VALIDATION_ERROR");
    }

    const existing = await db.municipio.findUnique({ where: { id }, select: MUNICIPIO_SELECT });
    if (!existing) {
      return apiError("El municipio no existe.", 404, "NOT_FOUND");
    }

    // Fast path: clean conflict messages without a failed update. It is NOT
    // atomic, so the two unique indexes stay the race-condition safety net
    // (the P2002 handler below answers with the exact same conflicts).
    if (nombre !== undefined || departamento !== undefined) {
      const pairConflict = await db.municipio.findFirst({
        where: {
          nombre: nombre ?? existing.nombre,
          departamento: departamento ?? existing.departamento,
          NOT: { id },
        },
        select: { id: true },
      });
      if (pairConflict) {
        return apiError(MUNICIPIO_MESSAGES.duplicatePair, 409, "CONFLICT");
      }
    }
    if (codigo_dane !== undefined && codigo_dane !== null) {
      const daneConflict = await db.municipio.findFirst({
        where: { codigo_dane, NOT: { id } },
        select: { id: true },
      });
      if (daneConflict) {
        return apiError(MUNICIPIO_MESSAGES.duplicateDane, 409, "CONFLICT");
      }
    }

    const data: {
      nombre?: string;
      departamento?: string;
      codigo_dane?: string | null;
      activo?: boolean;
      fecha_suspension?: Date | null;
    } = {};
    if (nombre !== undefined) data.nombre = nombre;
    if (departamento !== undefined) data.departamento = departamento;
    if (codigo_dane !== undefined) data.codigo_dane = codigo_dane;
    if (activo !== undefined) {
      // Restoring clears the stamp; suspending sets it.
      data.activo = activo;
      data.fecha_suspension = activo ? null : suspensionData().fecha_suspension;
    }

    const cambios = diffFields(existing, data, AUDITED_FIELDS);

    try {
      const updated = await db.$transaction(async (tx) => {
        const row = await tx.municipio.update({ where: { id }, data, select: MUNICIPIO_SELECT });
        if (cambios.length > 0) {
          await logChanges(
            tx,
            cambios.map((cambio) => ({
              usuario_id: auth.usuario.id,
              accion:
                cambio.campo === "activo" && cambio.valor_nuevo === false ? "SUSPENDER" : "EDITAR",
              entidad: "municipio",
              entidad_id: id,
              campo: cambio.campo,
              valor_anterior: cambio.valor_anterior,
              valor_nuevo: cambio.valor_nuevo,
            })),
          );
        }
        return row;
      });

      return NextResponse.json({ municipio: updated });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return apiError(municipioConflictMessage(err), 409, "CONFLICT");
      }
      throw err;
    }
  },
);

export const DELETE = withApiErrorHandling(
  "municipalities",
  "No pudimos suspender el municipio. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiRole(["ADMINISTRADOR"]);
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const existing = await db.municipio.findUnique({ where: { id }, select: MUNICIPIO_SELECT });
    if (!existing) {
      return apiError("El municipio no existe.", 404, "NOT_FOUND");
    }

    // Soft delete: suspend, never destroy. No Prisma delete delegate is called.
    const data = suspensionData();
    const cambios = diffFields(existing, data, AUDITED_FIELDS);

    const updated = await db.$transaction(async (tx) => {
      const row = await tx.municipio.update({ where: { id }, data, select: MUNICIPIO_SELECT });
      if (cambios.length > 0) {
        await logChanges(
          tx,
          cambios.map((cambio) => ({
            usuario_id: auth.usuario.id,
            accion: "SUSPENDER",
            entidad: "municipio",
            entidad_id: id,
            campo: cambio.campo,
            valor_anterior: cambio.valor_anterior,
            valor_nuevo: cambio.valor_nuevo,
          })),
        );
      }
      return row;
    });

    return NextResponse.json({ municipio: updated });
  },
);
