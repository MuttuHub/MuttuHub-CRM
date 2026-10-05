/**
 * Project code formatting and parsing for the v2 projects module (S2.2, SDD
 * §4.2).
 *
 * A project code is `PRY-AAAA-NNN`: the creation year followed by a per-year
 * sequence zero-padded to a minimum of three digits and NEVER truncated, so the
 * thousandth project of a year is `PRY-2026-1000`, not a wrapped `001`. The
 * file is framework- and DB-free, like `src/lib/proyectos/weeks.ts`, because
 * both the pure rules and the DB counter (`src/lib/api/project-code.ts`) must
 * agree on exactly one shape.
 */

const PROJECT_CODE = /^PRY-(\d{4})-(\d{3,})$/

/** Throws RangeError unless `year` is an integer in the four-digit range. */
function assertYear(year: number): void {
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    throw new RangeError(`Project year must be an integer between 1 and 9999: ${year}`)
  }
}

/** `PRY-AAAA-` — the prefix shared by every code of `year`. */
export function projectCodePrefix(year: number): string {
  assertYear(year)
  return `PRY-${String(year).padStart(4, "0")}-`
}

/**
 * Formats a project code. The sequence must be a positive integer; 1 -> `001`
 * and 1000 -> `1000`.
 */
export function formatProjectCode(year: number, sequence: number): string {
  assertYear(year)
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new RangeError(`Project sequence must be a positive integer: ${sequence}`)
  }
  return `${projectCodePrefix(year)}${String(sequence).padStart(3, "0")}`
}

/**
 * Extracts the year and sequence from a canonical code, or `null` when the
 * string is not exactly one. The padding is checked too, so a non-canonical
 * `PRY-2026-0001` is rejected instead of silently reading as sequence 1.
 */
export function parseProjectCode(code: string): { year: number; sequence: number } | null {
  const match = PROJECT_CODE.exec(code)
  if (!match) return null

  const year = Number(match[1])
  const sequence = Number(match[2])

  if (year < 1 || sequence < 1) return null
  if (match[2] !== String(sequence).padStart(3, "0")) return null

  return { year, sequence }
}
