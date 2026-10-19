// PATCH /api/v1/strategic-lines/:id — ADMINISTRADOR only. Renames (`nombre`)
// and suspends/restores (`activo`); NUNCA cambia `codigo`. Suspending stamps
// `fecha_suspension`; restoring clears it. The database trigger
// `lineas_estrategicas_codigo_inmutable` is the real guarantee — the API
// refuses the key up front so no client ever reaches it.
// DELETE /api/v1/strategic-lines/:id — ADMINISTRADOR only. Soft delete: the row
// is suspended (`activo: false` + `fecha_suspension`), never removed. There is
// no hard delete anywhere in this module.
//
// The v2 audit log (`logChanges`, per-field before/after) is written in the
// SAME transaction as the update (ADR-05): if the audit fails, the business
// change fails with it.

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiRole } from "@/lib/supabase/server";
import { diffFields, logChanges } from "@/lib/api/audit-cambios";
import { LINEA_SELECT } from "../route";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const LINEA_PATCH_SCHEMA = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, "El nombre no puede estar vacío.")
    .max(120, "El nombre es muy largo.")
    .optional(),
  activo: z.boolean().optional(),
});

/** Fields the audit diff watches; `codigo` is deliberately absent. */
const AUDITED_FIELDS = ["nombre", "activo", "fecha_suspension"] as const;

/** Suspension is always `activo: false` plus the timestamp that proves it. */
function suspensionData() {
  return { activo: false, fecha_suspension: new Date() };
}

export const PATCH = withApiErrorHandling(
  "strategic-lines",
  "No pudimos actualizar la línea estratégica. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiRole(["ADMINISTRADOR"]);
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const body = await parseJsonBody<Record<string, unknown>>(request);
    if (body === null) {
      return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
    }

    // Defense in depth on top of the database trigger: any `codigo` in the
    // body is a 400, even when it matches the stored value.
    if ("codigo" in body) {
      return apiError(
        "El código de la línea estratégica es inmutable: no se puede cambiar.",
        400,
        "VALIDATION_ERROR",
      );
    }

    const parsed = LINEA_PATCH_SCHEMA.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "Datos no válidos.", 400, "VALIDATION_ERROR");
    }
    const { nombre, activo } = parsed.data;
    if (nombre === undefined && activo === undefined) {
      return apiError("Envía 'nombre' o 'activo'.", 400, "VALIDATION_ERROR");
    }

    const existing = await db.lineaEstrategicaCatalogo.findUnique({
      where: { id },
      select: LINEA_SELECT,
    });
    if (!existing) {
      return apiError("La línea estratégica no existe.", 404, "NOT_FOUND");
    }

    const data: { nombre?: string; activo?: boolean; fecha_suspension?: Date | null } = {};
    if (nombre !== undefined) data.nombre = nombre;
    if (activo !== undefined) {
      // Restoring clears the stamp; suspending sets it.
      data.activo = activo;
      data.fecha_suspension = activo ? null : suspensionData().fecha_suspension;
    }

    const cambios = diffFields(existing, data, AUDITED_FIELDS);

    const updated = await db.$transaction(async (tx) => {
      const row = await tx.lineaEstrategicaCatalogo.update({ where: { id }, data, select: LINEA_SELECT });
      if (cambios.length > 0) {
        await logChanges(
          tx,
          cambios.map((cambio) => ({
            usuario_id: auth.usuario.id,
            accion:
              cambio.campo === "activo" && cambio.valor_nuevo === false ? "SUSPENDER" : "EDITAR",
            entidad: "linea",
            entidad_id: id,
            campo: cambio.campo,
            valor_anterior: cambio.valor_anterior,
            valor_nuevo: cambio.valor_nuevo,
          })),
        );
      }
      return row;
    });

    return NextResponse.json({ linea: updated });
  },
);

export const DELETE = withApiErrorHandling(
  "strategic-lines",
  "No pudimos suspender la línea estratégica. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiRole(["ADMINISTRADOR"]);
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const existing = await db.lineaEstrategicaCatalogo.findUnique({
      where: { id },
      select: LINEA_SELECT,
    });
    if (!existing) {
      return apiError("La línea estratégica no existe.", 404, "NOT_FOUND");
    }

    // Soft delete: suspend, never destroy. `codigo` stays untouched, so the
    // immutability trigger accepts the UPDATE.
    const data = suspensionData();
    const cambios = diffFields(existing, data, AUDITED_FIELDS);

    const updated = await db.$transaction(async (tx) => {
      const row = await tx.lineaEstrategicaCatalogo.update({ where: { id }, data, select: LINEA_SELECT });
      if (cambios.length > 0) {
        await logChanges(
          tx,
          cambios.map((cambio) => ({
            usuario_id: auth.usuario.id,
            accion: "SUSPENDER",
            entidad: "linea",
            entidad_id: id,
            campo: cambio.campo,
            valor_anterior: cambio.valor_anterior,
            valor_nuevo: cambio.valor_nuevo,
          })),
        );
      }
      return row;
    });

    return NextResponse.json({ linea: updated });
  },
);
