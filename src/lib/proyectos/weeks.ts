/**
 * Pure schedule math for the v2 projects module (S0.5).
 *
 * Every date is an ISO calendar date ("YYYY-MM-DD") handled as a UTC day number:
 * no timezone drift, no `Date` arithmetic on local time, no dependency on the
 * machine clock. Framework- and DB-free, like `src/lib/permissions.ts`.
 *
 * Activities live on relative weeks — `week n` runs from `fecha_inicio + 7(n-1)`
 * to `fecha_inicio + 7n - 1` — and the calendar dates shown in the UI are
 * derived from them, never stored twice.
 */

export type IsoDate = string
export type Periodo = string

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const MS_PER_DAY = 86_400_000

/** Throws RangeError unless `value` is a real calendar date in `YYYY-MM-DD`. */
export function assertIsoDate(value: string): void {
  const match = ISO_DATE.exec(value)
  if (!match) throw new RangeError(`Invalid ISO date: ${value}. Expected YYYY-MM-DD.`)

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const roundTrip = new Date(Date.UTC(year, month - 1, day))

  // Rejects impossible dates such as 2026-02-30, which Date.UTC would roll over.
  if (
    roundTrip.getUTCFullYear() !== year ||
    roundTrip.getUTCMonth() !== month - 1 ||
    roundTrip.getUTCDate() !== day
  ) {
    throw new RangeError(`Invalid calendar date: ${value}.`)
  }
}

/** UTC days since the Unix epoch. */
export function toDayNumber(date: IsoDate): number {
  assertIsoDate(date)
  const match = ISO_DATE.exec(date)!
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / MS_PER_DAY
}

export function fromDayNumber(dayNumber: number): IsoDate {
  if (!Number.isInteger(dayNumber)) throw new RangeError(`Day number must be an integer: ${dayNumber}`)
  return new Date(dayNumber * MS_PER_DAY).toISOString().slice(0, 10)
}

/** Number of calendar days from `a` to `b`, both endpoints included. */
export function daysBetweenInclusive(a: IsoDate, b: IsoDate): number {
  return toDayNumber(b) - toDayNumber(a) + 1
}

function assertWeek(week: number): void {
  if (!Number.isInteger(week) || week < 1) {
    throw new RangeError(`Week number must be an integer >= 1: ${week}`)
  }
}

/** `ceil((fin - inicio + 1) / 7)`; the RF-07 formula, applied literally. */
export function durationWeeks(inicio: IsoDate, fin: IsoDate): number {
  const days = daysBetweenInclusive(inicio, fin)
  if (days < 1) throw new RangeError(`fecha_fin ${fin} is before fecha_inicio ${inicio}.`)
  return Math.ceil(days / 7)
}

/** First day of week `n`: `inicio + 7(n-1)`. */
export function weekStart(inicio: IsoDate, week: number): IsoDate {
  assertWeek(week)
  return fromDayNumber(toDayNumber(inicio) + 7 * (week - 1))
}

/** Last day of week `n`: `inicio + 7n - 1`. */
export function weekEnd(inicio: IsoDate, week: number): IsoDate {
  assertWeek(week)
  return fromDayNumber(toDayNumber(inicio) + 7 * week - 1)
}

/** Calendar dates of an activity that spans weeks `semanaInicio..semanaFin`. */
export function activityDates(
  inicio: IsoDate,
  semanaInicio: number,
  semanaFin: number,
): { inicio: IsoDate; fin: IsoDate } {
  return { inicio: weekStart(inicio, semanaInicio), fin: weekEnd(inicio, semanaFin) }
}

/** Default activity weight: the number of weeks it spans. */
export function defaultWeight(semanaInicio: number, semanaFin: number): number {
  assertWeek(semanaInicio)
  assertWeek(semanaFin)
  if (semanaFin < semanaInicio) {
    throw new RangeError(`semana_fin ${semanaFin} is before semana_inicio ${semanaInicio}.`)
  }
  return semanaFin - semanaInicio + 1
}

/** `"YYYY-MM"` of a calendar date. */
export function periodOf(date: IsoDate): Periodo {
  assertIsoDate(date)
  return date.slice(0, 7)
}

/** Every month from `periodOf(inicio)` to `periodOf(fin)`, both included. */
export function projectPeriods(inicio: IsoDate, fin: IsoDate): Periodo[] {
  const start = periodOf(inicio)
  const end = periodOf(fin)

  if (end < start) throw new RangeError(`fecha_fin ${fin} is before fecha_inicio ${inicio}.`)

  const periods: Periodo[] = []
  let [year, month] = [Number(start.slice(0, 4)), Number(start.slice(5, 7))]

  for (;;) {
    const periodo = `${year}-${String(month).padStart(2, "0")}`
    periods.push(periodo)
    if (periodo === end) return periods

    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
}

const BOGOTA_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

/**
 * "Today" for every date rule in the module, in the America/Bogota calendar.
 * A UTC instant late at night is still the previous day in Colombia.
 */
export function todayInBogota(now: Date = new Date()): IsoDate {
  return BOGOTA_DATE.format(now)
}
