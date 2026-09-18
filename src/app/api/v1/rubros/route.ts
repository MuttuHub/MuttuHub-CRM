// GET/POST /api/v1/rubros — Rubro catalog list/create (D5, design.md
// "Catálogo de Rubro administrable"). NOT an enum, NOT a free-text string:
// an Administrador manages this table without a code deployment. Read is
// any authenticated user (the budget UI's "new línea" dropdown and the
// admin catalog screen both read this) — write is
// `requireApiRole(["ADMINISTRADOR"])`, same gate as `settings/route.ts`.
//
// GET defaults to `activo: true` only, so an inactive rubro never shows up
// as a "new-line option" (spec.md's catalog requirement). Pass
// `?incluir_inactivos=true` to see the full historic catalog (admin
// management screen, or a caller that needs to resolve the name of a rubro
// already linked to an existing línea presupuestal).

import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiRole, requireApiUser } from "@/lib/supabase/server";
import { zodError } from "@/lib/api/crm";

export const dynamic = "force-dynamic";

export const RUBRO_SELECT = {
  id: true,
  nombre: true,
  activo: true,
  orden: true,
  created_at: true,
  updated_at: true,
} as const;

export const RUBRO_SCHEMA = z.object({
  nombre: z.string().trim().min(1, "El nombre del rubro es obligatorio.").max(100, "El nombre es muy largo."),
  orden: z.number().int().min(0, "El orden no puede ser negativo.").optional(),
});

export const GET = withApiErrorHandling(
  "rubros",
  "No pudimos cargar los rubros. Inténtalo de nuevo.",
  async (request: Request) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    const incluirInactivos = new URL(request.url).searchParams.get("incluir_inactivos") === "true";

    const rubros = await db.rubro.findMany({
      where: incluirInactivos ? { deleted_at: null } : { deleted_at: null, activo: true },
      select: RUBRO_SELECT,
      orderBy: [{ orden: "asc" }, { nombre: "asc" }],
    });

    return NextResponse.json({ rubros });
  },
);

export const POST = withApiErrorHandling(
  "rubros",
  "No pudimos crear el rubro. Inténtalo de nuevo.",
  async (request: Request) => {
    const auth = await requireApiRole(["ADMINISTRADOR"]);
    if (!auth.ok) return auth.response;

    const body = await parseJsonBody<unknown>(request);
    if (body === null) {
      return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
    }
    const parsed = RUBRO_SCHEMA.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    try {
      const rubro = await db.rubro.create({
        data: {
          nombre: parsed.data.nombre,
          orden: parsed.data.orden ?? 0,
        },
        select: RUBRO_SELECT,
      });
      return NextResponse.json({ rubro }, { status: 201 });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return apiError("Ya existe un rubro con ese nombre.", 409, "CONFLICT");
      }
      throw err;
    }
  },
);
