/**
 * WHY: the guard test must observe import order, so it needs a process where the
 * guard is imported first and the Prisma client second. This probe is that
 * process: if the guard throws, the client module below is never evaluated and
 * nothing prints; if the guard passes, the client is constructed and `ok` lands
 * on stdout.
 *
 * Relative paths only: this runs under plain `node --import tsx` in a test, so
 * the `@/` alias is not available here.
 */
import { requireHashForRemoteApply } from "../_guard"

import { db } from "../../../src/lib/db"

// Mirrors what a real script does right after the guard: a remote target may only
// apply a plan that carries a reviewed --expect-hash.
requireHashForRemoteApply(process.argv.slice(2))

// Touching the client proves its module body ran (and built the Prisma client).
console.log(db ? "ok" : "no-db")
