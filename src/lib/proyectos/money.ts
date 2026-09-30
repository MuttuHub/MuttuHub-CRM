/**
 * Exact money math for the v2 projects module (S0.5).
 *
 * Amounts are COP cents in `bigint`: no float ever touches an amount, so the
 * float-parsing trap RNF-06 warns about cannot happen here. The file is
 * framework- and DB-free, like `src/lib/permissions.ts`.
 *
 * Rounding is half-up, symmetric around zero, which is what the PO's spreadsheet
 * does: 13.500.000 / 24.000.000 is 56,25 %, displayed as 56,3 %.
 *
 * Note: `tsconfig.json` targets ES2017, so BigInt *literals* (`0n`) are rejected
 * by `tsc` even though `lib` includes esnext and the runtime supports bigint.
 * The named constants below keep the file compiling under that target.
 */

export type Cents = bigint

const ZERO = BigInt(0)
const HUNDRED = BigInt(100)
const THOUSAND = BigInt(1000)
const TEN_THOUSAND = BigInt(10_000)

const DECIMAL = /^-?\d+(?:\.\d+)?$/

/** Parses a decimal amount (string, number or Prisma.Decimal) to exact cents. */
export function toCents(value: string | number | { toString(): string }): Cents {
  const raw = typeof value === "string" ? value : value.toString()
  const text = raw.trim()

  if (!DECIMAL.test(text)) throw new RangeError(`Not a decimal amount: ${raw}`)

  const negative = text.startsWith("-")
  const [whole = "0", fraction = ""] = text.replace("-", "").split(".")

  if (fraction.length > 2) throw new RangeError(`More than two decimals in amount: ${raw}`)

  const cents = BigInt(whole) * HUNDRED + BigInt(fraction.padEnd(2, "0") || "0")
  return negative ? -cents : cents
}

/** Renders cents as a plain decimal string with exactly two decimals. */
export function fromCents(cents: Cents): string {
  const negative = cents < ZERO
  const absolute = negative ? -cents : cents
  const whole = absolute / HUNDRED
  const fraction = (absolute % HUNDRED).toString().padStart(2, "0")
  return `${negative ? "-" : ""}${whole}.${fraction}`
}

export function sumCents(values: readonly Cents[]): Cents {
  return values.reduce<Cents>((total, value) => total + value, ZERO)
}

/**
 * Percentage in tenths (90,8 % -> 908), rounded half-up and symmetric around
 * zero. A zero denominator has no percentage at all, so it returns null rather
 * than inventing one.
 */
export function percentTenths(numerator: Cents, denominator: Cents): bigint | null {
  if (denominator === ZERO) return null

  const scaled = numerator * THOUSAND
  const quotient = scaled / denominator
  const remainder = scaled % denominator
  const absoluteRemainder = remainder < ZERO ? -remainder : remainder
  const absoluteDenominator = denominator < ZERO ? -denominator : denominator

  if (absoluteRemainder * BigInt(2) >= absoluteDenominator) {
    return quotient + (scaled < ZERO ? -BigInt(1) : BigInt(1))
  }
  return quotient
}

/** "90,8 %"; an em dash when there is no percentage to show. */
export function formatPercent(tenths: bigint | null): string {
  if (tenths === null) return "—"

  const negative = tenths < ZERO
  const absolute = negative ? -tenths : tenths
  return `${negative ? "-" : ""}${absolute / BigInt(10)},${absolute % BigInt(10)} %`
}

/**
 * `E <= P * (1 + tolerance)`, evaluated with integers only so no boundary case
 * depends on binary floating point.
 */
export function withinTolerance(executed: Cents, programmed: Cents, toleranceBasisPoints: bigint): boolean {
  return executed * TEN_THOUSAND <= programmed * (TEN_THOUSAND + toleranceBasisPoints)
}

/** The yellow/red boundary for display: `P * (1 + tolerance)`. */
export function toleranceThreshold(programmed: Cents, toleranceBasisPoints: bigint): Cents {
  return (programmed * (TEN_THOUSAND + toleranceBasisPoints)) / TEN_THOUSAND
}

/**
 * `$ 59.500.000` — the same shape the app already shows (Intl "es-CO" + COP),
 * computed in bigint so no amount is ever routed through a float. Decimals are
 * dropped only when the amount is whole.
 */
export function formatCOP(cents: Cents): string {
  const negative = cents < ZERO
  const absolute = negative ? -cents : cents

  const grouped = (absolute / HUNDRED).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")
  const remainder = absolute % HUNDRED
  const decimals = remainder === ZERO ? "" : `,${remainder.toString().padStart(2, "0")}`

  return `${negative ? "-" : ""}$ ${grouped}${decimals}`
}
