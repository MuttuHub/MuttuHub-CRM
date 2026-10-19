// GET/POST /api/v1/clients/:id/contacts — contact list (flat array, not
// paginated) and creation (PRD §4.2 "Contactos" tab). Read is scoped like the
// client; writes follow the client write permission (responsable self for
// COLABORADOR).

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError, isValidEmail, parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { ENUM_VALUES } from "@/lib/catalogs";
import {
  catalogEnum,
  getClientForWrite,
  loadClientScoped,
  zodError,
} from "@/lib/api/crm";
import type { RolContacto } from "@prisma/client";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const CONTACT_SCHEMA = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, "El nombre del contacto es obligatorio.")
    .max(200, "El nombre es muy largo."),
  cargo: z.string().nullable().optional(),
  correo: z
    .string()
    .trim()
    .refine(isValidEmail, "Correo no válido.")
    .nullable()
    .optional(),
  telefono: z.string().nullable().optional(),
  rol_decision: catalogEnum(
    ENUM_VALUES.RolContacto as readonly RolContacto[],
    "Rol en la decisión no válido.",
  )
    .nullable()
    .optional(),
  notas: z.string().nullable().optional(),
});

export const GET = withApiErrorHandling(
  "contacts",
  "No pudimos cargar los contactos. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const cliente = await loadClientScoped(id, auth.usuario);
    if (!cliente) {
      return apiError("El cliente no existe.", 404, "NOT_FOUND");
    }
    const contactos = await db.contacto.findMany({
      where: { cliente_id: id, deleted_at: null },
      orderBy: { created_at: "asc" },
    });
    return NextResponse.json({ contactos });
  },
);

export const POST = withApiErrorHandling(
  "contacts",
  "No pudimos guardar el contacto. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const body = await parseJsonBody<unknown>(request);
    if (body === null) {
      return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
    }
    const parsed = CONTACT_SCHEMA.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const access = await getClientForWrite(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND" ? "El cliente no existe." : "No tienes permisos sobre este cliente.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    const contacto = await db.contacto.create({
      data: {
        cliente_id: id,
        nombre: parsed.data.nombre,
        cargo: parsed.data.cargo,
        correo: parsed.data.correo,
        telefono: parsed.data.telefono,
        rol_decision: parsed.data.rol_decision,
        notas: parsed.data.notas,
      },
    });
    return NextResponse.json({ contacto }, { status: 201 });
  },
);
