// Pure permission predicates (PR 1 of the read-scope refactor): separates
// WRITE authority over other people's records (canManageAny) and document
// confidentiality (canReadRestrictedDocs) from READ-scope, which still lives
// as `isFullAccess` in src/lib/api/crm.ts and src/lib/dashboard.ts until PR 3
// opens it up. Zero behavior change here — same roles, same rules, just
// named for what they actually gate. No imports from @/lib/db or next/server:
// this module must stay framework/DB-free.

import type { RolUsuario } from "@prisma/client";

export const MANAGE_ANY_ROLES: readonly RolUsuario[] = [
  "ADMINISTRADOR",
  "GERENCIA",
  "COORDINADOR",
];

/** Autoridad de ESCRITURA sobre registros ajenos. NO es visibilidad de lectura. */
export function canManageAny(rol: RolUsuario): boolean {
  return MANAGE_ANY_ROLES.includes(rol);
}

/** Alias explícito: quién puede leer documentos de categorías restringidas. Mismo valor que canManageAny, otro concepto — no fusionar. */
export const canReadRestrictedDocs = canManageAny;

export type PermissionActor = { id: string; rol: RolUsuario };

/** Espejo exacto de la regla de getClientForWrite en crm.ts. */
export function canEditClient(
  cliente: { responsable_id: string },
  actor: PermissionActor,
): boolean {
  return canManageAny(actor.rol) || cliente.responsable_id === actor.id;
}

/** Espejo exacto de la regla de getTaskForWrite en crm.ts (incluye la rama del cliente vinculado). */
export function canEditTask(
  tarea: { responsable_id: string; cliente_responsable_id?: string | null },
  actor: PermissionActor,
): boolean {
  if (canManageAny(actor.rol) || tarea.responsable_id === actor.id) return true;
  return tarea.cliente_responsable_id != null && tarea.cliente_responsable_id === actor.id;
}

/** Actor with the commercial flag (D3, oportunidades-comerciales). Orthogonal to `rol`. */
export type CommercialActor = PermissionActor & { gestiona_oportunidades: boolean };

/**
 * READ axis (RNF-C02): who may see the commercial cycle at all. A COLABORADOR
 * responsable of a client does NOT get commercial access from that alone —
 * only `isFullAccess` roles or the explicit flag grant it.
 */
export function hasCommercialAccess(actor: CommercialActor): boolean {
  return canManageAny(actor.rol) || actor.gestiona_oportunidades;
}

/**
 * WRITE axis (D4): commercial access AND the existing client write boundary.
 * Composing with `canEditClient` keeps the flag a purely narrowing axis — it
 * never expands write authority beyond what the actor already has on the
 * client.
 */
export function canManageOpportunity(
  cliente: { responsable_id: string },
  actor: CommercialActor,
): boolean {
  return hasCommercialAccess(actor) && canEditClient(cliente, actor);
}
