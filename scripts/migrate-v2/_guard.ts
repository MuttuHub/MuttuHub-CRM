/**
 * WHY: every v2 migration script runs against the same single environment this
 * project has — a local Docker Postgres and a local Supabase Storage — and the
 * only other instance in play is PRODUCTION (`.env`). This module is the one
 * source of truth that makes that boundary hard to cross: importing it loads
 * `.env.local`, refuses any non-loopback target and, because ES modules
 * evaluate their imports in order, does so before any `@/lib/db` client can be
 * constructed.
 *
 * The ONE way past the loopback rule is deliberate and narrow (launch day, the
 * production `s1-rubros` import): `MIGRATE_V2_ALLOW_REMOTE_HOST` must equal the
 * exact hostname (no port, no suffix, no wildcard) of every non-loopback
 * DATABASE_URL / DIRECT_URL. NEXT_PUBLIC_SUPABASE_URL always stays loopback, and a
 * remote `--apply` must carry `--expect-hash` (`requireHashForRemoteApply`).
 * `.env` is still never loaded: the operator exports the production URLs in the
 * shell for that single run.
 */
import {
  assertLocalDatabaseUrl,
  connectionTarget,
  isLocalTarget,
  loadLocalEnv,
  NonLocalDatabaseError,
} from "../../prisma/local-env"

/** Every variable a v2 data script must resolve to a loopback host. */
export const GUARDED_VARS = ["DATABASE_URL", "DIRECT_URL", "NEXT_PUBLIC_SUPABASE_URL"] as const

/** Database variables that may point at one explicitly allowed remote host. */
const REMOTE_CAPABLE_VARS = ["DATABASE_URL", "DIRECT_URL"] as const

/** Opt-in for a production run: the exact hostname of the remote database. */
export const ALLOW_REMOTE_ENV = "MIGRATE_V2_ALLOW_REMOTE_HOST"

function hostnameOf(value: string | undefined): string | null {
  if (!value) return null
  try {
    return new URL(value).hostname.toLowerCase() || null
  } catch {
    return null
  }
}

/** Remote database variables whose hostname equals the opt-in exactly. */
function permittedRemoteVars(): string[] {
  const allowed = process.env[ALLOW_REMOTE_ENV]?.trim().toLowerCase()
  if (!allowed) return []

  return REMOTE_CAPABLE_VARS.filter((name) => {
    const value = process.env[name]
    return Boolean(value) && !isLocalTarget(value) && hostnameOf(value) === allowed
  })
}

loadLocalEnv()
// Fail-closed: everything that is not an explicitly permitted remote database
// variable still has to be loopback (and set).
const permitted = new Set<string>(permittedRemoteVars())
assertLocalDatabaseUrl(GUARDED_VARS.filter((name) => !permitted.has(name)))

/** True when this process runs against an explicitly allowed remote database. */
export const isRemoteRun = permitted.size > 0

/**
 * A remote run may only apply a reviewed plan. The harness already refuses
 * `--apply` without `--expect-hash`; this check repeats it at the guard so the
 * production path does not depend on the harness staying that way.
 */
export function requireHashForRemoteApply(argv: readonly string[] = process.argv.slice(2)): void {
  if (isRemoteRun && argv.includes("--apply") && !argv.includes("--expect-hash")) {
    throw new NonLocalDatabaseError(
      "Remote --apply requires --expect-hash <sha> copied from a reviewed dry-run against the same target.",
    )
  }
}

/** `host:port` of DATABASE_URL (e.g. `127.0.0.1:54322`), never a password. */
export function describeTarget(): string {
  return connectionTarget(process.env.DATABASE_URL) ?? "unknown"
}

export { assertLocalDatabaseUrl, connectionTarget, loadLocalEnv, NonLocalDatabaseError }
