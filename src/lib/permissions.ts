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

/**
 * Project-management roles for the v2 projects module (S0.7). Deliberately
 * narrower than the record-write role list: a COORDINADOR manages the projects
 * they are responsable of (or are a member of), not the whole portfolio, so
 * granting them project-level write authority through that shared list would
 * be wrong.
 */
export const PROJECT_MANAGER_ROLES: readonly RolUsuario[] = [
  "ADMINISTRADOR",
  "GERENCIA",
]

/** Actor carrying the gerencial read flag (tablero-seguimiento-social). Orthogonal to `rol` and READ-only. */
export type ProjectActor = PermissionActor & { puede_ver_tablero_gerencial: boolean }

/** The same actor once the loader has resolved whether they belong to the project under evaluation. */
export type ProjectMembershipActor = ProjectActor & { es_miembro: boolean }

/**
 * Base predicate of the v2 project permission set: who owns project-level
 * authority. Every other write predicate here composes with it, which keeps
 * the manager set in one place and stops a future change from re-widening the
 * role list in one predicate only.
 */
export function canManageProjects(actor: PermissionActor): boolean {
  return PROJECT_MANAGER_ROLES.includes(actor.rol)
}

/**
 * Creation is restricted to project managers. Behaviour change vs v1: a
 * COORDINADOR can no longer create projects, because creating one cannot rely
 * on the ownership/membership axes that grant them authority over an existing
 * project.
 */
export function canCreateProject(actor: PermissionActor): boolean {
  return canManageProjects(actor)
}

/**
 * Write authority over one project and everything hanging from it. Managers
 * pass unconditionally; a COORDINADOR passes only as the responsable of that
 * project. Behaviour change vs v1: ownership alone no longer grants writing,
 * so a COLABORADOR responsable is denied instead of silently promoted.
 */
export function canManageProject(
  proyecto: { responsable_id: string },
  actor: PermissionActor,
): boolean {
  return (
    canManageProjects(actor) ||
    (proyecto.responsable_id === actor.id && actor.rol === "COORDINADOR")
  )
}

/**
 * Execution (loading progress and closing activities) requires explicit
 * membership for a COORDINADOR; managers execute regardless. Kept separate
 * from `canManageProject` because editing project data is not the same right
 * as executing it, and the loader resolves membership per project.
 */
export function canExecuteProject(actor: ProjectMembershipActor): boolean {
  return canManageProjects(actor) || (actor.rol === "COORDINADOR" && actor.es_miembro)
}

/**
 * Read axis of a single project: managers and holders of the gerencial flag
 * see everything, and a COORDINADOR sees the projects they belong to. The flag
 * is the only reason it is not narrowed to `canManageProjects`, so this
 * predicate must never be reused as a write gate.
 */
export function canViewProjectV2(actor: ProjectMembershipActor): boolean {
  return (
    canManageProjects(actor) ||
    actor.puede_ver_tablero_gerencial ||
    (actor.rol === "COORDINADOR" && actor.es_miembro)
  )
}

/**
 * Financial supports are the most sensitive project artifact, so the
 * gerencial flag must NOT grant them: a Visualizador with
 * `puede_ver_tablero_gerencial` reports totals without inspecting the
 * supporting documents. Only managers and COORDINADOR members qualify.
 */
export function canViewFinancialSupports(actor: ProjectMembershipActor): boolean {
  return canManageProjects(actor) || (actor.rol === "COORDINADOR" && actor.es_miembro)
}

/**
 * Segregation of duties: validating an expense is a control over the spender,
 * so whoever registered it can never validate it, even a manager. Composing
 * with `canManageProjects` keeps the rule tied to the project manager set
 * rather than to the wider record-write authority.
 */
export function canValidateExpense(
  gasto: { registrado_por_id: string },
  actor: PermissionActor,
): boolean {
  return canManageProjects(actor) && gasto.registrado_por_id !== actor.id
}

/** Baseline approval is a management decision, not an execution one. */
export function canApproveBaseline(actor: PermissionActor): boolean {
  return canManageProjects(actor)
}

/** Modification approval follows the same authority as the baseline it amends. */
export function canApproveModification(actor: PermissionActor): boolean {
  return canManageProjects(actor)
}

/**
 * Portfolio-wide read: managers plus the gerencial flag. Deliberately not the
 * shared record-write predicate, which would hand a COORDINADOR the global
 * portfolio view they are supposed to get only through per-project membership.
 */
export function canViewPortfolio(actor: ProjectActor): boolean {
  return canManageProjects(actor) || actor.puede_ver_tablero_gerencial
}
