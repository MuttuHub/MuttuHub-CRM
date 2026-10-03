// GET /api/v1/strategic-lines — strategic-lines catalog (REQ-CAT-03).
// Any authenticated user reads the active lines ordered by code.
// POST /api/v1/strategic-lines — ADMINISTRADOR only. Creates a catalog line
// with an immutable, unique `codigo`.
//
// The 8 seeded lines come from LINEAS_ESTRATEGICAS_V2 in src/lib/catalogs.ts
// (the single TS source of truth); this route only administers them.

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiRole, requireApiUser } from "@/lib/supabase/server";
import { logChange } from "@/lib/api/audit-cambios";

export const dynamic = "force-dynamic";

export const LINEA_SELECT = {
  id: true,
  codigo: true,
  nombre: true,
  activo: true,
  fecha_suspension: true,
  orden: true,
  created_at: true,
  updated_at: true,
} as const;

export const LINEA_CREATE_SCHEMA = z.object({
  codigo: z
    .string()
    .trim()
    .min(1, "El código no puede estar vacío.")
    .max(20, "El código es muy largo."),
  nombre: z
    .string()
    .trim()
    .min(1, "El nombre no puede estar vacío.")
    .max(120, "El nombre es muy largo."),
  orden: z.number().int().min(0, "El orden no puede ser negativo.").optional(),
});

const DUPLICATE_CODE_MESSAGE = "Ya existe una línea estratégica con ese código.";

export const GET = withApiErrorHandling(
  "strategic-lines",
  "No pudimos cargar las líneas estratégicas. Inténtalo de nuevo.",
  async () => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    const lineas = await db.lineaEstrategicaCatalogo.findMany({
      where: { activo: true },
      orderBy: { codigo: "asc" },
      select: LINEA_SELECT,
    });
    return NextResponse.json({ lineas });
  },
);

export const POST = withApiErrorHandling(
  "strategic-lines",
  "No pudimos crear la línea estratégica. Inténtalo de nuevo.",
  async (request: Request) => {
    const auth = await requireApiRole(["ADMINISTRADOR"]);
    if (!auth.ok) return auth.response;

    const body = await parseJsonBody<Record<string, unknown>>(request);
    if (body === null) {
      return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
    }

    const parsed = LINEA_CREATE_SCHEMA.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "Datos no válidos.", 400, "VALIDATION_ERROR");
    }
    const { codigo, nombre, orden } = parsed.data;

    // Fast path: a clean conflict message without a failed insert. It is NOT
    // atomic, so the unique index on `codigo` stays the race-condition safety
    // net (P2002 below answers with the exact same conflict).
    const existing = await db.lineaEstrategicaCatalogo.findUnique({
      where: { codigo },
      select: { id: true },
    });
    if (existing) {
      return apiError(DUPLICATE_CODE_MESSAGE, 409, "CONFLICT");
    }

    try {
      const linea = await db.$transaction(async (tx) => {
        const row = await tx.lineaEstrategicaCatalogo.create({
          data: { codigo, nombre, ...(orden === undefined ? {} : { orden }) },
          select: LINEA_SELECT,
        });
        // The audit row is written in the SAME transaction as the business
        // write (ADR-05): if the audit fails, the creation fails with it.
        await logChange(tx, {
          usuario_id: auth.usuario.id,
          accion: "CREAR",
          entidad: "linea",
          entidad_id: row.id,
          valor_nuevo: { codigo, nombre },
        });
        return row;
      });

      return NextResponse.json({ linea }, { status: 201 });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return apiError(DUPLICATE_CODE_MESSAGE, 409, "CONFLICT");
      }
      throw err;
    }
  },
);
