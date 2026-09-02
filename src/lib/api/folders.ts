// Pure helpers for the folders tree (Fase 2 / plan §4A).
//
// Tree by adjacency list (parent_id self-reference), max depth 8. The whole
// tree is a single small query assembled in memory, so cycle detection and
// depth validation are a plain walk over the parent chain — no materialized
// path, no closure table (both would only add a denormalized invariant that
// can drift, and Prisma models neither).

export const FOLDER_MAX_DEPTH = 8;

export type FolderParentMap = Map<string, string | null>;

/**
 * Validates moving `folderId` under `newParentId` (or creating a new folder
 * under it when `folderId` is "").
 *
 * `parents` maps every active folder id -> its parent_id (null = root). The
 * walk climbs the parent chain from `newParentId` up to the root:
 *   - if it reaches `folderId`, moving would create a cycle -> CYCLE;
 *   - if the resulting depth exceeds FOLDER_MAX_DEPTH -> DEPTH_EXCEEDED.
 * Returns the depth the moved/created folder would have on success.
 */
export function validateFolderParent(
  parents: FolderParentMap,
  folderId: string,
  newParentId: string | null,
): { ok: true; depth: number } | { ok: false; code: "CYCLE" | "DEPTH_EXCEEDED" } {
  if (newParentId === null) return { ok: true, depth: 0 };

  let depth = 0;
  let current: string | null = newParentId;
  while (current !== null) {
    if (current === folderId) return { ok: false, code: "CYCLE" };
    depth += 1;
    if (depth > FOLDER_MAX_DEPTH) return { ok: false, code: "DEPTH_EXCEEDED" };
    current = parents.get(current) ?? null;
  }
  return { ok: true, depth };
}