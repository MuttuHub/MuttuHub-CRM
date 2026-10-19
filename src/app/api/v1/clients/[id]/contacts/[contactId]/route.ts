// PATCH/DELETE /api/v1/clients/:id/contacts/:contactId — contact edit and
// soft delete. The contact must belong to the client and the caller needs
// write access to that client (responsable self for COLABORADOR).

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError, isValidEmail, parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { ENUM_VALUES } from "@/lib/catalogs";
import { catalogEnum, getClientForWrite, zodError } from "@/lib/api/crm";
import type { RolContacto } from "@prisma/client";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; contactId: string }> };

export const CONTACT_PATCH_SCHEMA = z
  .object({
    nombre: z
      .string()
      .trim()
      .min(1, "El nombre del contacto no puede estar vacío.")
      .max(200, "El nombre es muy largo."),
    cargo: z.string().nullable().optional(),
    correo: z.string().trim().refine(isValidEmail, "Correo no válido.").nullable().optional(),
    telefono: z.string().nullable().optional(),
    rol_decision: catalogEnum(
      ENUM_VALUES.RolContacto as readonly RolContacto[],
      "Rol en la decisión no válido.",
    )
      .nullable()
      .optional(),
    notas: z.string().nullable().optional(),
    // v7 alignment C4a (Relaciones): same ranges as CONTACT_SCHEMA.
    poder: z
      .number()
      .int("El poder debe ser un número entero.")
      .min(1, "El poder debe estar entre 1 y 5.")
      .max(5, "El poder debe estar entre 1 y 5.")
      .nullable()
      .optional(),
    interes: z
      .number()
      .int("El interés debe ser un número entero.")
      .min(1, "El interés debe estar entre 1 y 5.")
      .max(5, "El interés debe estar entre 1 y 5.")
      .nullable()
      .optional(),
    fuerza_relacion: z
      .number()
      .int("La fuerza de la relación debe ser un número entero.")
      .min(1, "La fuerza de la relación debe estar entre 1 y 3.")
      .max(3, "La fuerza de la relación debe estar entre 1 y 3.")
      .nullable()
      .optional(),
    owner_id: z.string().min(1, "El propietario no es válido.").nullable().optional(),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, "Envía al menos un campo para actualizar.");

export const PATCH = withApiErrorHandling(
  "contacts",
  "No pudimos actualizar el contacto. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, contactId } = await ctx.params;

    const body = await parseJsonBody<unknown>(request);
    if (body === null) {
      return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
    }
    const parsed = CONTACT_PATCH_SCHEMA.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const access = await getClientForWrite(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND" ? "El cliente no existe." : "No tienes permisos sobre este cliente.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    const existing = await db.contacto.findFirst({
      where: { id: contactId, cliente_id: id, deleted_at: null },
    });
    if (!existing) {
      return apiError("El contacto no existe.", 404, "NOT_FOUND");
    }

    const contacto = await db.contacto.update({
      where: { id: contactId },
      data: {
        nombre: parsed.data.nombre,
        cargo: parsed.data.cargo,
        correo: parsed.data.correo,
        telefono: parsed.data.telefono,
        rol_decision: parsed.data.rol_decision,
        notas: parsed.data.notas,
        poder: parsed.data.poder,
        interes: parsed.data.interes,
        fuerza_relacion: parsed.data.fuerza_relacion,
        owner_id: parsed.data.owner_id,
      },
    });
    return NextResponse.json({ contacto });
  },
);

export const DELETE = withApiErrorHandling(
  "contacts",
  "No pudimos eliminar el contacto. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, contactId } = await ctx.params;

    const access = await getClientForWrite(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND" ? "El cliente no existe." : "No tienes permisos sobre este cliente.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    const existing = await db.contacto.findFirst({
      where: { id: contactId, cliente_id: id, deleted_at: null },
    });
    if (!existing) {
      return apiError("El contacto no existe.", 404, "NOT_FOUND");
    }

    await db.contacto.update({ where: { id: contactId }, data: { deleted_at: new Date() } });
    return new NextResponse(null, { status: 204 });
  },
);
