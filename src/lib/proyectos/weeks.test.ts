import { describe, expect, it } from "vitest"

import { F_W1 } from "./__fixtures__/weeks"
import {
  activityDates,
  daysBetweenInclusive,
  defaultWeight,
  durationWeeks,
  fromDayNumber,
  periodOf,
  projectPeriods,
  toDayNumber,
  todayInBogota,
  weekEnd,
  weekStart,
} from "./weeks"

describe("toDayNumber / fromDayNumber", () => {
  it("round-trips an ISO date through UTC day numbers", () => {
    for (const date of ["2026-10-05", "2027-01-29", "2024-02-29", "2000-01-01"]) {
      expect(fromDayNumber(toDayNumber(date))).toBe(date)
    }
  })

  it("counts consecutive calendar days as one apart", () => {
    expect(toDayNumber("2026-10-06") - toDayNumber("2026-10-05")).toBe(1)
    expect(toDayNumber("2027-01-29") - toDayNumber("2026-10-05")).toBe(116)
  })

  it("throws RangeError on a malformed or impossible date", () => {
    expect(() => toDayNumber("05/10/2026")).toThrow(RangeError)
    expect(() => toDayNumber("2026-13-01")).toThrow(RangeError)
    expect(() => toDayNumber("2026-02-30")).toThrow(RangeError)
    expect(() => toDayNumber("")).toThrow(RangeError)
  })
})

describe("daysBetweenInclusive", () => {
  it("includes both endpoints", () => {
    expect(daysBetweenInclusive("2026-10-05", "2026-10-05")).toBe(1)
    expect(daysBetweenInclusive("2026-10-05", "2026-10-11")).toBe(7)
  })
})

describe("durationWeeks", () => {
  it("is ceil((fin - inicio + 1) / 7): 28 days -> 4 weeks, 29 days -> 5 weeks, 117 days -> 17 weeks", () => {
    expect(durationWeeks("2026-10-05", "2026-11-01")).toBe(4) // 28 days
    expect(durationWeeks("2026-10-05", "2026-11-02")).toBe(5) // 29 days
    expect(durationWeeks(F_W1.fechaInicio, F_W1.fechaFin)).toBe(17) // 117 days
  })

  it("throws RangeError when fecha_fin is before fecha_inicio", () => {
    expect(() => durationWeeks("2026-10-05", "2026-10-04")).toThrow(RangeError)
  })
})

describe("weekStart / weekEnd", () => {
  it("week n starts at fecha_inicio + 7(n-1) days and ends at fecha_inicio + 7n - 1 days", () => {
    expect(weekStart("2026-10-05", 1)).toBe("2026-10-05")
    expect(weekEnd("2026-10-05", 1)).toBe("2026-10-11")
    expect(weekStart("2026-10-05", 2)).toBe("2026-10-12")
    expect(weekEnd("2026-10-05", 2)).toBe("2026-10-18")
    expect(weekStart("2026-10-05", 17)).toBe("2027-01-25")
    expect(weekEnd("2026-10-05", 17)).toBe("2027-01-31")
  })

  it("rejects a week number below 1 or a non-integer", () => {
    expect(() => weekStart("2026-10-05", 0)).toThrow(RangeError)
    expect(() => weekStart("2026-10-05", 1.5)).toThrow(RangeError)
  })
})

describe("activityDates", () => {
  it("computes activity 1.4 (weeks 3-6) as 2026-10-19 -> 2026-11-15 for a 2026-10-05 start", () => {
    const { semanaInicio, semanaFin, inicio, fin } = F_W1.actividad14
    expect(activityDates(F_W1.fechaInicio, semanaInicio, semanaFin)).toEqual({ inicio, fin })
  })
})

describe("defaultWeight", () => {
  it("is semana_fin - semana_inicio + 1", () => {
    expect(defaultWeight(3, 6)).toBe(F_W1.actividad14.pesoPorDefecto)
    expect(defaultWeight(1, 1)).toBe(1)
    expect(defaultWeight(1, 17)).toBe(17)
  })

  it("throws RangeError when the range is inverted", () => {
    expect(() => defaultWeight(6, 3)).toThrow(RangeError)
  })
})

describe("periodOf / projectPeriods", () => {
  it("lists project periods from the start month to the end month inclusive, across a year boundary", () => {
    expect(projectPeriods(F_W1.fechaInicio, F_W1.fechaFin)).toEqual([...F_W1.periodos])
  })

  it("returns a single period when start and end share a month", () => {
    expect(projectPeriods("2026-10-05", "2026-10-29")).toEqual(["2026-10"])
  })

  it("throws RangeError when fecha_fin is before fecha_inicio", () => {
    expect(() => projectPeriods("2027-01-29", "2026-10-05")).toThrow(RangeError)
  })

  it("derives the period from a date", () => {
    expect(periodOf("2026-10-05")).toBe("2026-10")
    expect(() => periodOf("nope")).toThrow(RangeError)
  })
})

describe("todayInBogota", () => {
  it("does not shift dates across the America/Bogota offset (2026-10-05T03:00Z is 2026-10-04)", () => {
    expect(todayInBogota(new Date("2026-10-05T03:00:00Z"))).toBe("2026-10-04")
  })

  it("keeps the same calendar date once Bogota has passed local midnight", () => {
    expect(todayInBogota(new Date("2026-10-05T05:00:00Z"))).toBe("2026-10-05")
    expect(todayInBogota(new Date("2026-10-05T23:59:59Z"))).toBe("2026-10-05")
    expect(todayInBogota(new Date("2026-10-06T04:59:59Z"))).toBe("2026-10-05")
  })
})
