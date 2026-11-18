// Role-aware UI for the repository (S7, S10). Mirrors the server rules so the
// UI hides or disables what the API would reject with a 403:
// - document writes (PATCH, soft delete, restore) follow
//   `loadDocumentForWrite`: full roles anywhere, anyone else only on the
//   documents they authored;
// - Papelera is for the roles that can write any document;
// - Actividad reads GET /auditoria, which is ADMINISTRADOR only.

import { canManageAny } from "@/lib/permissions";
import type { CurrentUser } from "@/hooks/kanban";

type Actor = Pick<CurrentUser, "id" | "rol"> | null | undefined;

export const WRITE_DENIED_REASON =
  "Solo su autor o Coordinación, Gerencia y Administración pueden modificar este documento.";

export function canWriteDocument(user: Actor, doc: { autor_id: string }): boolean {
  if (!user) return false;
  return canManageAny(user.rol) || doc.autor_id === user.id;
}

export function canSeeTrash(user: Actor): boolean {
  return !!user && canManageAny(user.rol);
}

export function canSeeActivity(user: Actor): boolean {
  return user?.rol === "ADMINISTRADOR";
}

/** Who may pick a restricted category (same as reading restricted documents). */
export function canUseRestrictedCategories(user: Actor): boolean {
  return !!user && canManageAny(user.rol);
}
