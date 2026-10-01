// ADR-13 signed direct-to-storage uploads (S0.9b).
//
// The browser uploads bytes straight to Supabase Storage with a short-lived
// signed URL, keeping them out of the route handler (the Vercel Function body
// limit is a ~4.5 MB platform constant that binds before the app's own 25 MB
// policy). The server still owns the storage KEY, and the confirm-mode routes
// re-check that the client did not point them at another target's object.
//
// Never-delete policy: this module only signs uploads and reads object
// metadata. It never deletes, moves, or copies a stored object.

import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeFileName } from "@/lib/api/files";

export type SignedUploadTarget =
  | { kind: "tarea"; tareaId: string }
  | { kind: "documento"; clienteId: string | null; documentoId: string };

/** Exact segment prefix every key for `target` must live under. */
export function targetStoragePrefix(target: SignedUploadTarget): string {
  if (target.kind === "tarea") return `tareas/${target.tareaId}`;
  return `documentos/${target.clienteId ?? "general"}/${target.documentoId}`;
}

/**
 * Today's task-attachment convention (unchanged by S0.9b):
 * `tareas/{tareaId}/{uuid}_{nombre-sanitizado}`. The `uuid` is kept
 * injectable so the convention is testable without freezing the clock/random.
 */
export function taskAttachmentStoragePath(
  tareaId: string,
  originalName: string,
  storageId: string = randomUUID(),
): string {
  return `tareas/${tareaId}/${storageId}_${sanitizeFileName(originalName)}`;
}

/**
 * True only when `storagePath` sits under the target's EXACT segment prefix
 * with a file name after it. Rejects:
 *   - a different id (`tareas/other/…`);
 *   - a sibling whose id merely STARTS with the expected one
 *     (`tareas/{id}evil/…`) — the comparison is per segment, never a string
 *     `startsWith`;
 *   - any `.`/`..` or empty segment;
 *   - a leading `/` (absolute path);
 *   - the bare prefix with no object name after it.
 */
export function assertKeyBelongsToTarget(
  storagePath: string,
  target: SignedUploadTarget,
): boolean {
  if (!storagePath || storagePath.startsWith("/")) return false;
  const segments = storagePath.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return false;
  }
  const prefix = targetStoragePrefix(target).split("/");
  if (segments.length <= prefix.length) return false;
  return prefix.every((segment, index) => segments[index] === segment);
}

/**
 * Real stored size of an object, or null when it is missing or unreadable.
 * The confirm-mode routes use it to verify the object the client claims it
 * uploaded exists, without ever reading its bytes into the function.
 */
export async function storedObjectSize(
  supabase: SupabaseClient,
  bucket: string,
  storagePath: string,
): Promise<number | null> {
  const { data, error } = await supabase.storage.from(bucket).info(storagePath);
  if (error || !data) return null;
  const size = data.size ?? data.metadata?.size;
  return typeof size === "number" ? size : null;
}
