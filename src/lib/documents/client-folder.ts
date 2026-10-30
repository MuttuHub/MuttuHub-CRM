// Folder <-> client rules of the Document Repository (S3, S4, S6; assumption
// A5: one folder per client, folders without a client keep working as today).
//
// Single home for two rules every write path shares, so the upload routes, the
// signed-upload endpoint, the move (PATCH) and the task-attachment mirror can
// never drift apart:
//   - resolveDocumentPlacement: which folder a document lands in and which
//     client it is linked to. A client folder IMPOSES its client; an explicit
//     cliente_id that disagrees is rejected (never silently overridden).
//   - findOrCreateClientFolder: the client's folder, created on first use and
//     idempotent under concurrent calls (the unique index on
//     carpetas.cliente_id decides the race; the loser re-reads the winner).

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { loadClientScoped } from "@/lib/api/crm";

/** Projection returned by every folder endpoint (tree node fields + client). */
export const FOLDER_SELECT = {
  id: true,
  nombre: true,
  parent_id: true,
  cliente_id: true,
  created_at: true,
} as const;

export type FolderRow = Prisma.CarpetaGetPayload<{ select: typeof FOLDER_SELECT }>;

/** Same limit the folder create/rename routes enforce. */
const FOLDER_NAME_MAX = 120;

export const FOLDER_NOT_FOUND_MESSAGE = "La carpeta no existe.";
export const FOLDER_CLIENT_MISMATCH_MESSAGE =
  "El cliente indicado no coincide con el cliente de la carpeta.";
export const CARPETA_ID_INVALID_MESSAGE = "carpeta_id debe ser el id de una carpeta.";
const CLIENT_GONE_MESSAGE = "El cliente no existe o fue eliminado.";

/** True for Prisma's unique-constraint violation (P2002). */
export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/**
 * Normalizes a raw `carpeta_id` from a JSON body or a form field: absent, null
 * or blank means "no folder" (the document stays in «Todas», the previous
 * behavior); a string is trimmed; any other type is invalid.
 */
export function parseCarpetaId(raw: unknown): { ok: true; carpetaId: string | null } | { ok: false } {
  if (raw === undefined || raw === null) return { ok: true, carpetaId: null };
  if (typeof raw !== "string") return { ok: false };
  const trimmed = raw.trim();
  return { ok: true, carpetaId: trimmed || null };
}

export type DocumentPlacement =
  | { ok: true; carpetaId: string | null; clienteId: string | null }
  | { ok: false; response: Response };

/**
 * Resolves where a document goes and which client it belongs to.
 *
 * - No folder: the explicit client (if any) is kept, exactly as before.
 * - Missing/deleted folder: 404 "La carpeta no existe." (same as the move).
 * - Client folder: its client is the document's client. An explicit, different
 *   cliente_id is a 400 — the caller must not get one of the two silently.
 * - The resulting client must exist, not be deleted and be inside the caller's
 *   client read scope (`loadClientScoped`, the shared CRM rule): otherwise 400
 *   "El cliente no existe o fue eliminado.", the message the upload routes
 *   already used.
 */
export async function resolveDocumentPlacement(input: {
  carpetaId: string | null;
  clienteId: string | null;
}): Promise<DocumentPlacement> {
  let clienteId = input.clienteId;

  if (input.carpetaId !== null) {
    const carpeta = await db.carpeta.findFirst({
      where: { id: input.carpetaId, deleted_at: null },
      select: { id: true, cliente_id: true },
    });
    if (!carpeta) {
      return { ok: false, response: apiError(FOLDER_NOT_FOUND_MESSAGE, 404, "NOT_FOUND") };
    }
    if (carpeta.cliente_id) {
      if (clienteId !== null && clienteId !== carpeta.cliente_id) {
        return { ok: false, response: apiError(FOLDER_CLIENT_MISMATCH_MESSAGE, 400, "VALIDATION_ERROR") };
      }
      clienteId = carpeta.cliente_id;
    }
  }

  if (clienteId !== null && !(await loadClientScoped(clienteId))) {
    return { ok: false, response: apiError(CLIENT_GONE_MESSAGE, 400, "VALIDATION_ERROR") };
  }

  return { ok: true, carpetaId: input.carpetaId, clienteId };
}

/**
 * The client's folder, created at the root and named after the client the
 * first time it is needed. Null when the client does not exist or is deleted.
 *
 * Idempotent: a second call finds the folder the first one created. Two
 * concurrent first calls both miss the lookup; the unique index on
 * carpetas.cliente_id lets exactly one insert through and the other fails
 * with P2002, which re-reads the winner's folder instead of creating a second
 * one or answering 500.
 */
export async function findOrCreateClientFolder(
  clienteId: string,
  creadoPorId: string,
): Promise<{ carpeta: FolderRow; creada: boolean } | null> {
  const existing = await findClientFolder(clienteId);
  if (existing) return { carpeta: existing, creada: false };

  const cliente = await db.cliente.findFirst({
    where: { id: clienteId, deleted_at: null },
    select: { id: true, nombre: true },
  });
  if (!cliente) return null;

  const nombre = cliente.nombre.trim().slice(0, FOLDER_NAME_MAX) || "Cliente";
  try {
    const carpeta = await db.carpeta.create({
      data: { nombre, parent_id: null, cliente_id: clienteId, creado_por_id: creadoPorId },
      select: FOLDER_SELECT,
    });
    return { carpeta, creada: true };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const winner = await findClientFolder(clienteId);
    if (!winner) throw err;
    return { carpeta: winner, creada: false };
  }
}

function findClientFolder(clienteId: string) {
  return db.carpeta.findFirst({
    where: { cliente_id: clienteId, deleted_at: null },
    select: FOLDER_SELECT,
  });
}
