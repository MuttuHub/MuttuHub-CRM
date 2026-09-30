/**
 * Side-effect guard: load `.env.local` and refuse to continue unless every
 * database URL resolves to loopback.
 *
 * Import it as the FIRST import of any file that may write to the database —
 * the seed, a backfill script or a DB test. ES modules evaluate their imports in
 * order, so placing it before `@/lib/db` guarantees the check runs before the
 * Prisma client is constructed from `process.env.DATABASE_URL`.
 *
 * Never point this at `.env`: that file is the shared production instance.
 */
import { assertLocalDatabaseUrl, loadLocalEnv } from "./local-env"

loadLocalEnv()
assertLocalDatabaseUrl()
