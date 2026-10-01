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
import "../_guard"

import { db } from "../../../src/lib/db"

// Touching the client proves its module body ran (and built the Prisma client).
console.log(db ? "ok" : "no-db")
