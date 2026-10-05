/**
 * Per-year project-code allocator (S2.2, SDD §4.2).
 *
 * The counter lives in `proyecto_secuencias` (`anio` primary key, `ultimo`
 * last issued sequence) and is bumped by a single `INSERT ... ON CONFLICT
 * ("anio") DO UPDATE ... RETURNING` — one statement, so the row lock Postgres
 * takes on `anio` serialises two concurrent creations for the same year and
 * they receive consecutive, distinct sequences. `codigo` is `@unique`, so the
 * counter has to be reliable, never best-effort.
 *
 * The whole function runs **inside the caller's transaction**: it receives the
 * transaction client and never opens one of its own. When the counter row does
 * not exist yet, the INSERT seeds it from the maximum code already present in
 * `proyectos` for that year (`parseProjectCode`), so a year whose projects were
 * created before the counter existed continues the series instead of colliding
 * with `proyectos_codigo_key`.
 */

import type { Prisma } from "@prisma/client";
import { formatProjectCode, parseProjectCode, projectCodePrefix } from "@/lib/proyectos/codigo";

type UltimoRow = { ultimo: number };

/** Highest sequence among the codes that belong to `year`; 0 when there is none. */
function maxExistingSequence(codes: readonly { codigo: string }[], year: number): number {
  let max = 0;
  for (const { codigo } of codes) {
    const parsed = parseProjectCode(codigo);
    if (parsed && parsed.year === year && parsed.sequence > max) {
      max = parsed.sequence;
    }
  }
  return max;
}

/** Allocates the next `PRY-AAAA-NNN` code for `year` using the given transaction. */
export async function nextProjectCode(tx: Prisma.TransactionClient, year: number): Promise<string> {
  const prefix = projectCodePrefix(year);

  // Soft-deleted projects still hold their `codigo` (unique index has no
  // partial predicate), so they must be counted too and this read is not
  // filtered by `deleted_at`.
  const existing = await tx.proyecto.findMany({
    where: { codigo: { startsWith: prefix } },
    select: { codigo: true },
  });
  const initial = maxExistingSequence(existing, year) + 1;

  const rows = await tx.$queryRaw<UltimoRow[]>`
    INSERT INTO "proyecto_secuencias" ("anio", "ultimo")
    VALUES (${year}, ${initial})
    ON CONFLICT ("anio") DO UPDATE
      SET "ultimo" = "proyecto_secuencias"."ultimo" + 1
    RETURNING "ultimo"
  `;

  const ultimo = rows[0]?.ultimo;
  if (ultimo === undefined) {
    throw new Error(`The project-code counter returned no value for year ${year}`);
  }

  return formatProjectCode(year, ultimo);
}
