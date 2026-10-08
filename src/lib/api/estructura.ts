// Shared plumbing of the S3 technical-structure routes (objectives, activities,
// deliverables, indicators), all mounted under /api/v1/projects/:id/.
//
// Every write follows the order the project PATCH established: the project is
// read first (404 for missing or soft-deleted), then the manager gate (403),
// then the BORRADOR gate (409 INVALID_STATE), and only then the body (400).

import { Prisma, type Usuario } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { canManageProjects } from "@/lib/permissions";
import { canReadProject, loadProjectScoped } from "@/lib/api/projects";

export const ESTRUCTURA_STATE_MESSAGE =
  "Solo se puede editar la estructura técnica de un proyecto en Borrador.";

export const ESTRUCTURA_FORBIDDEN_MESSAGE = "No tienes permisos sobre este proyecto.";

export type GateResult<T> = { ok: true; value: T } | { ok: false; response: Response };

export type EstructuraProyecto = {
  id: string;
  estado: string;
  fecha_inicio: Date | null;
  fecha_fin: Date | null;
};

/** 404 -> 403 -> 409 for a structure write. */
export async function gateEstructuraWrite(
  usuario: Usuario,
  proyectoId: string,
): Promise<GateResult<EstructuraProyecto>> {
  const proyecto = await db.proyecto.findFirst({
    where: { id: proyectoId, deleted_at: null },
    select: { id: true, estado: true, fecha_inicio: true, fecha_fin: true },
  });
  if (!proyecto) {
    return { ok: false, response: apiError("El proyecto no existe.", 404, "NOT_FOUND") };
  }
  if (!canManageProjects(usuario)) {
    return { ok: false, response: apiError(ESTRUCTURA_FORBIDDEN_MESSAGE, 403, "FORBIDDEN") };
  }
  if (proyecto.estado !== "BORRADOR") {
    return {
      ok: false,
      response: apiError(ESTRUCTURA_STATE_MESSAGE, 409, "INVALID_STATE"),
    };
  }
  return { ok: true, value: proyecto };
}

/** 404 -> 403 for a structure read, with the membership-aware read scope. */
export async function gateEstructuraRead(
  usuario: Usuario,
  proyectoId: string,
): Promise<GateResult<{ id: string; fecha_inicio: Date | null; fecha_fin: Date | null }>> {
  const scoped = await loadProjectScoped(usuario, proyectoId, {
    id: true,
    fecha_inicio: true,
    fecha_fin: true,
  });
  if (!scoped) {
    return { ok: false, response: apiError("El proyecto no existe.", 404, "NOT_FOUND") };
  }
  if (!canReadProject(usuario, scoped.es_miembro)) {
    return { ok: false, response: apiError(ESTRUCTURA_FORBIDDEN_MESSAGE, 403, "FORBIDDEN") };
  }
  return { ok: true, value: scoped.row };
}

/** Parses a JSON object body against a zod schema; a scalar body is a 400, never a 500. */
export async function parseEstructuraBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<GateResult<z.infer<S>>> {
  const body = await parseJsonBody<unknown>(request);
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, response: apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR") };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      response: apiError(parsed.error.issues[0]?.message ?? "Datos no válidos.", 400, "VALIDATION_ERROR"),
    };
  }
  return { ok: true, value: parsed.data };
}

/** True when `err` is the P2002 of the named (partial) unique index. */
export function isUniqueViolation(err: unknown, indexName: string): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002" &&
    JSON.stringify(err.meta ?? {}).includes(indexName)
  );
}

export function conflict(message: string): Response {
  return apiError(message, 409, "CONFLICT");
}

/** Shared field rules. */
export const codigoField = z
  .string({ error: "El código es obligatorio." })
  .trim()
  .min(1, "El código no puede estar vacío.")
  .max(50, "El código es muy largo.");

export const ordenField = z
  .number()
  .int("El orden debe ser un número entero.")
  .min(0, "El orden no puede ser negativo.")
  .max(100_000, "El orden es demasiado alto.");

export const NOTHING_TO_UPDATE = "Envía al menos un campo para actualizar.";
