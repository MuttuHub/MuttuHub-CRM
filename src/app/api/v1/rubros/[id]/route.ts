// PATCH /api/v1/rubros/:id — solo ADMINISTRADOR. Renombra (`nombre`) y
// suspende/restaura (`activo`); NUNCA cambia `codigo`. La defensa en
// profundidad es explícita: cualquier `codigo` en el body es 400, además del
// trigger `rubros_codigo_inmutable` de la base de datos.
// DELETE /api/v1/rubros/:id — siempre 409: un rubro no se elimina, se suspende
// (`activo: false`). No hay soft delete ni hard delete.
//
// La bitácora v2 (`logChanges`, antes/después por campo) se escribe en la MISMA
// transacción que el update (ADR-05): si la auditoría falla, el cambio de
// negocio falla con ella.

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiRole, requireApiUser } from "@/lib/supabase/server";
import { diffFields, logChanges } from "@/lib/api/audit-cambios";
import { RUBRO_SELECT } from "../route";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const RUBRO_PATCH_SCHEMA = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, "El nombre no puede estar vacío.")
    .max(120, "El nombre es muy largo.")
    .optional(),
  activo: z.boolean().optional(),
});

export const PATCH = withApiErrorHandling(
  "rubros",
  "No pudimos actualizar el rubro. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiRole(["ADMINISTRADOR"]);
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const body = await parseJsonBody<Record<string, unknown>>(request);
    if (body === null) {
      return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
    }

    // El trigger de la base de datos es la garantía real; la API rechaza la
    // clave de plano para que ningún cliente llegue a intentarlo.
    if ("codigo" in body) {
      return apiError(
        "El código del rubro es inmutable: no se puede cambiar.",
        400,
        "VALIDATION_ERROR",
      );
    }

    const parsed = RUBRO_PATCH_SCHEMA.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "Datos no válidos.", 400, "VALIDATION_ERROR");
    }
    const data = parsed.data;
    if (data.nombre === undefined && data.activo === undefined) {
      return apiError("Envía 'nombre' o 'activo'.", 400, "VALIDATION_ERROR");
    }

    const existing = await db.rubro.findUnique({ where: { id }, select: RUBRO_SELECT });
    if (!existing) {
      return apiError("El rubro no existe.", 404, "NOT_FOUND");
    }

    const cambios = diffFields(existing, data, ["nombre", "activo"]);

    const updated = await db.$transaction(async (tx) => {
      const row = await tx.rubro.update({ where: { id }, data, select: RUBRO_SELECT });
      if (cambios.length > 0) {
        await logChanges(
          tx,
          cambios.map((cambio) => ({
            usuario_id: auth.usuario.id,
            accion:
              cambio.campo === "activo" && cambio.valor_nuevo === false ? "SUSPENDER" : "EDITAR",
            entidad: "rubro",
            entidad_id: id,
            campo: cambio.campo,
            valor_anterior: cambio.valor_anterior,
            valor_nuevo: cambio.valor_nuevo,
          })),
        );
      }
      return row;
    });

    return NextResponse.json({ rubro: updated });
  },
);

export const DELETE = withApiErrorHandling(
  "rubros",
  "No pudimos procesar la solicitud. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    await ctx.params;

    return apiError(
      "Un rubro no se elimina nunca: solo se puede suspender ('activo: false').",
      409,
      "CONFLICT",
    );
  },
);
