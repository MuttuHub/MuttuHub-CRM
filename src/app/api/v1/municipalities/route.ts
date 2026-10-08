// GET /api/v1/municipalities — municipios catalog (REQ-CAT-04).
// Any authenticated user reads the active municipios.
// POST /api/v1/municipalities — ADMINISTRADOR only. Creates a municipio with
// an optional `codigo_dane`, unique only when present.
//
// The catalog is administered from here because the migration seeds NOTHING:
// N-21 asked for it to be filled from the normalised legacy `territorio`
// values, but no `territorio` field or enum exists in this repository, so a
// national list would be invented data. The demo municipios live in
// prisma/seed.ts.

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { wantsInactivos } from "@/lib/api/incluir-inactivos";
import { requireApiRole, requireApiUser } from "@/lib/supabase/server";
import { logChange } from "@/lib/api/audit-cambios";

export const dynamic = "force-dynamic";

export const MUNICIPIO_SELECT = {
  id: true,
  nombre: true,
  departamento: true,
  codigo_dane: true,
  activo: true,
  fecha_suspension: true,
  orden: true,
  created_at: true,
  updated_at: true,
} as const;

/** A DANE municipality code is 5 digits; empty means "no code yet". */
export const CODIGO_DANE_SCHEMA = z
  .string()
  .trim()
  .regex(/^\d{5}$/, "El código DANE debe tener 5 dígitos.")
  .nullable()
  .optional();

export const MUNICIPIO_CREATE_SCHEMA = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, "El nombre no puede estar vacío.")
    .max(120, "El nombre es muy largo."),
  departamento: z
    .string()
    .trim()
    .min(1, "El departamento no puede estar vacío.")
    .max(120, "El departamento es muy largo."),
  codigo_dane: CODIGO_DANE_SCHEMA,
  orden: z.number().int().min(0, "El orden no puede ser negativo.").optional(),
});

export const MUNICIPIO_MESSAGES = {
  duplicatePair: "Ya existe un municipio con ese nombre en ese departamento.",
  duplicateDane: "Ya existe un municipio con ese código DANE.",
} as const;

/**
 * A P2002 from the `(nombre, departamento)` index must answer with the pair
 * message and a P2002 from the `codigo_dane` index with the DANE one, so the
 * violated columns have to be read from the error itself. Prisma 7 with
 * `@prisma/adapter-pg` reports them in
 * `meta.driverAdapterError.cause.constraint.fields`; other clients use
 * `meta.target`. Searching the serialised meta as text names the offending
 * index either way.
 */
export function municipioConflictMessage(err: Prisma.PrismaClientKnownRequestError): string {
  return JSON.stringify(err.meta ?? {}).includes("codigo_dane")
    ? MUNICIPIO_MESSAGES.duplicateDane
    : MUNICIPIO_MESSAGES.duplicatePair;
}

export const GET = withApiErrorHandling(
  "municipalities",
  "No pudimos cargar los municipios. Inténtalo de nuevo.",
  async (request?: Request) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    const municipios = await db.municipio.findMany({
      where: wantsInactivos(request, auth.usuario.rol) ? {} : { activo: true },
      orderBy: [{ orden: "asc" }, { nombre: "asc" }],
      select: MUNICIPIO_SELECT,
    });
    return NextResponse.json({ municipios });
  },
);

export const POST = withApiErrorHandling(
  "municipalities",
  "No pudimos crear el municipio. Inténtalo de nuevo.",
  async (request: Request) => {
    const auth = await requireApiRole(["ADMINISTRADOR"]);
    if (!auth.ok) return auth.response;

    const body = await parseJsonBody<Record<string, unknown>>(request);
    if (body === null) {
      return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
    }

    const parsed = MUNICIPIO_CREATE_SCHEMA.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "Datos no válidos.", 400, "VALIDATION_ERROR");
    }
    const { nombre, departamento, codigo_dane, orden } = parsed.data;
    const codigoDane = codigo_dane ?? null;

    // Fast path: clean conflict messages without a failed insert. It is NOT
    // atomic, so the two unique indexes stay the race-condition safety net
    // (the P2002 handler below answers with the exact same conflicts).
    const pairConflict = await db.municipio.findFirst({
      where: { nombre, departamento },
      select: { id: true },
    });
    if (pairConflict) {
      return apiError(MUNICIPIO_MESSAGES.duplicatePair, 409, "CONFLICT");
    }
    if (codigoDane !== null) {
      const daneConflict = await db.municipio.findUnique({
        where: { codigo_dane: codigoDane },
        select: { id: true },
      });
      if (daneConflict) {
        return apiError(MUNICIPIO_MESSAGES.duplicateDane, 409, "CONFLICT");
      }
    }

    try {
      const municipio = await db.$transaction(async (tx) => {
        const row = await tx.municipio.create({
          data: { nombre, departamento, codigo_dane: codigoDane, ...(orden === undefined ? {} : { orden }) },
          select: MUNICIPIO_SELECT,
        });
        // The audit row is written in the SAME transaction as the business
        // write (ADR-05): if the audit fails, the creation fails with it.
        await logChange(tx, {
          usuario_id: auth.usuario.id,
          accion: "CREAR",
          entidad: "municipio",
          entidad_id: row.id,
          valor_nuevo: { nombre, departamento, codigo_dane: codigoDane },
        });
        return row;
      });

      return NextResponse.json({ municipio }, { status: 201 });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return apiError(municipioConflictMessage(err), 409, "CONFLICT");
      }
      throw err;
    }
  },
);
