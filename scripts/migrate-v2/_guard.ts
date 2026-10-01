/**
 * WHY: every v2 migration script runs against the same single environment this
 * project has — a local Docker Postgres and a local Supabase Storage — and the
 * only other instance in play is PRODUCTION (`.env`). This module is the one
 * source of truth that makes that boundary impossible to cross: importing it
 * loads `.env.local`, refuses any non-loopback target and, because ES modules
 * evaluate their imports in order, does so before any `@/lib/db` client can be
 * constructed.
 *
 * `prisma/require-local-db` already guards DATABASE_URL and DIRECT_URL; this
 * wrapper additionally guards NEXT_PUBLIC_SUPABASE_URL, which the storage
 * report needs and which `REQUIRED_LOCAL_VARS` does not cover.
 */
import "../../prisma/require-local-db"

import {
  assertLocalDatabaseUrl,
  connectionTarget,
  loadLocalEnv,
  NonLocalDatabaseError,
} from "../../prisma/local-env"

/** Every variable a v2 data script must resolve to a loopback host. */
export const GUARDED_VARS = ["DATABASE_URL", "DIRECT_URL", "NEXT_PUBLIC_SUPABASE_URL"] as const

// Both calls are idempotent: `require-local-db` already ran the loader and the
// two-postgres assert. Re-running them here widens the check to the Supabase URL
// without changing its fail-closed behaviour.
loadLocalEnv()
assertLocalDatabaseUrl(GUARDED_VARS)

/** `host:port` of DATABASE_URL (e.g. `127.0.0.1:54322`), never a password. */
export function describeTarget(): string {
  return connectionTarget(process.env.DATABASE_URL) ?? "unknown"
}

export { assertLocalDatabaseUrl, connectionTarget, loadLocalEnv, NonLocalDatabaseError }
