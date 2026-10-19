// `?incluir_inactivos=true` on the catalog GETs: only ADMINISTRADOR may see
// suspended rows. Any other role silently gets the default (active rows only).

import type { RolUsuario } from "@prisma/client";

export function wantsInactivos(request: Request | undefined, rol: RolUsuario): boolean {
  if (!request || rol !== "ADMINISTRADOR") return false;
  return new URL(request.url).searchParams.get("incluir_inactivos") === "true";
}
