/**
 * Single source of truth for "which database is this process allowed to touch".
 *
 * This project has no separate development or staging Supabase: the only remote
 * instance is PRODUCTION, and it is what `.env` points at. Every DB-touching
 * entry point — the Prisma CLI (`prisma.config.ts`), the seed, the backfill
 * scripts and the DB invariant test — must therefore load `.env.local` and
 * refuse to run against anything that is not loopback.
 *
 * Never load `.env` from this module.
 */
import { config } from "dotenv"

export const LOCAL_ENV_FILE = ".env.local"

/** Variables a DB-touching entry point must resolve. */
export const REQUIRED_LOCAL_VARS = ["DATABASE_URL", "DIRECT_URL"] as const

const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "::1", "0.0.0.0"])

export class NonLocalDatabaseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "NonLocalDatabaseError"
  }
}

function parseUrl(value: string | undefined | null): URL | null {
  if (!value) return null
  try {
    return new URL(value)
  } catch {
    return null
  }
}

/** `host:port` of a connection string, or null when it cannot be parsed. */
export function connectionTarget(value: string | undefined | null): string | null {
  const url = parseUrl(value)
  if (!url || !url.hostname) return null
  return url.port ? `${url.hostname}:${url.port}` : url.hostname
}

/**
 * True only for a genuine loopback hostname. An unparseable value is *not*
 * treated as local: this guard fails closed.
 */
export function isLocalTarget(value: string | undefined | null): boolean {
  const url = parseUrl(value)
  if (!url) return false
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase()
  return LOOPBACK_HOSTNAMES.has(hostname)
}

/** Drops the password so a connection string can appear in an error message. */
export function redact(value: string): string {
  return value.replace(/\/\/([^:/@]+):[^@]*@/, "//$1:***@")
}

/**
 * Loads a local env file. Defaults to `.env.local`; `.env` is never loaded
 * because it points at the shared production database.
 *
 * `dotenv` does not override variables that are already present, so CI and an
 * explicit shell export keep working unchanged.
 */
export function loadLocalEnv(filePath: string = LOCAL_ENV_FILE): void {
  config({ path: filePath, quiet: true })
}

/**
 * Throws unless every named variable resolves to a loopback host. There is no
 * bypass: no flag, no environment variable and no argument can widen it.
 */
export function assertLocalDatabaseUrl(names: readonly string[] = REQUIRED_LOCAL_VARS): void {
  const problems: string[] = []

  for (const name of names) {
    const value = process.env[name]

    if (!value) {
      problems.push(`${name} is not set. Load ${LOCAL_ENV_FILE} or export it explicitly.`)
      continue
    }

    if (!isLocalTarget(value)) {
      problems.push(`${name} points at ${connectionTarget(value) ?? redact(value)}, which is not loopback.`)
    }
  }

  if (problems.length > 0) {
    throw new NonLocalDatabaseError(
      [
        "Refusing to run against a non-local database.",
        "",
        ...problems.map((problem) => `- ${problem}`),
        "",
        "This project has no development or staging Supabase: the only remote instance is PRODUCTION.",
        `Expected host: loopback only (127.0.0.1, localhost, ::1). Set ${LOCAL_ENV_FILE} or use the db:*:local scripts.`,
      ].join("\n"),
    )
  }
}
