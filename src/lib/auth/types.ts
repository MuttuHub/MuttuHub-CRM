// Shared auth types and Spanish labels for the Muttu Hub platform (PRD §3).
// Used by the admin UI, the auth pages and future CRM/Kanban modules.

import type { RolUsuario } from "@prisma/client";

export type { RolUsuario } from "@prisma/client";

/** Human-readable Spanish labels for role enums, shared across modules. */
export const ROLE_LABELS: Record<RolUsuario, string> = {
  ADMINISTRADOR: "Administrador",
  GERENCIA: "Gerencia / Dirección",
  COORDINADOR: "Coordinador",
  COLABORADOR: "Colaborador",
};

export const ALL_ROLES = Object.keys(ROLE_LABELS) as RolUsuario[];

/** Session lifecycle (PRD §3.1): 4h total, warning banner at 3h50m. */
export const SESSION = {
  durationMs: 4 * 60 * 60 * 1000,
  warnBeforeMs: 10 * 60 * 1000,
} as const;

/**
 * localStorage key holding the absolute deadline (ISO string) of the current
 * session. Set at login from `sessionExpiresAt`, read by the session banner.
 * The Supabase JWT expiry must be configured to 4h (14400s) in the dashboard
 * so JWT and banner deadlines stay in sync.
 */
export const SESSION_STORAGE_KEY = "sessionDeadlineAt";

/** ISO date of the login moment; mirrors Supabase's `session_issued_at`. */
export function sessionExpiresAt(from: Date = new Date()): string {
  return new Date(from.getTime() + SESSION.durationMs).toISOString();
}
