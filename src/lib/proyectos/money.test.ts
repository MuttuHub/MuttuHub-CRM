import { describe, expect, it } from "vitest"

import { formatCOP, formatPercent, fromCents, percentTenths, sumCents, toCents, toleranceThreshold, withinTolerance } from "./money"

// `tsconfig.json` targets ES2017, so bigint *literals* (`0n`) do not compile.
// `BigInt(...)` keeps the expectations independent of the code under test.
const bp10pct = BigInt(1000)

describe("toCents", () => {
  it("parses decimal strings and Prisma-like decimals to integer cents without float error", () => {
    expect(toCents("59500000")).toBe(BigInt("5950000000"))
    expect(toCents("59500000.5")).toBe(BigInt("5950000050"))
    expect(toCents("0")).toBe(BigInt(0))
    expect(toCents("-13.5")).toBe(BigInt(-1350))
    // A Prisma.Decimal only promises toString().
    expect(toCents({ toString: () => "1234.56" })).toBe(BigInt(123456))
    // 0.1 + 0.2 in floats is not 0.3; the string path keeps it exact.
    expect(toCents("0.3")).toBe(BigInt(30))
  })

  it("rejects more than two decimals", () => {
    expect(() => toCents("1.234")).toThrow(RangeError)
    expect(() => toCents("0.001")).toThrow(RangeError)
  })

  it("rejects a value that is not a decimal number", () => {
    expect(() => toCents("abc")).toThrow(RangeError)
    expect(() => toCents("")).toThrow(RangeError)
    expect(() => toCents("1,5")).toThrow(RangeError)
  })
})

describe("fromCents", () => {
  it("renders cents as a plain decimal string with two decimals", () => {
    expect(fromCents(BigInt("5950000000"))).toBe("59500000.00")
    expect(fromCents(BigInt("5950000050"))).toBe("59500000.50")
    expect(fromCents(BigInt(-1350))).toBe("-13.50")
    expect(fromCents(BigInt(0))).toBe("0.00")
  })

  it("round-trips through toCents", () => {
    for (const value of ["59500000.00", "1.05", "-0.99"]) {
      expect(fromCents(toCents(value))).toBe(value)
    }
  })
})

describe("sumCents", () => {
  it("sums exactly and treats an empty list as zero", () => {
    expect(sumCents([toCents("0.1"), toCents("0.2")])).toBe(toCents("0.3"))
    expect(sumCents([])).toBe(BigInt(0))
  })
})

describe("percentTenths", () => {
  it("rounds half-up: 27.000.000 / 29.750.000 -> 908 and 13.500.000 / 24.000.000 -> 563", () => {
    expect(percentTenths(toCents("27000000"), toCents("29750000"))).toBe(BigInt(908))
    expect(percentTenths(toCents("13500000"), toCents("24000000"))).toBe(BigInt(563))
  })

  it("shows those percentages with the Colombian decimal comma", () => {
    expect(formatPercent(percentTenths(toCents("27000000"), toCents("29750000")))).toBe("90,8 %")
    expect(formatPercent(percentTenths(toCents("13500000"), toCents("24000000")))).toBe("56,3 %")
  })

  it("returns null when the denominator is zero", () => {
    expect(percentTenths(toCents("100"), BigInt(0))).toBeNull()
  })

  it("handles negatives symmetrically", () => {
    expect(percentTenths(toCents("-13500000"), toCents("24000000"))).toBe(BigInt(-563))
  })

  it("is exact for a whole percentage", () => {
    expect(percentTenths(toCents("100"), toCents("100"))).toBe(BigInt(1000))
    expect(percentTenths(toCents("50"), toCents("100"))).toBe(BigInt(500))
  })
})

describe("formatPercent", () => {
  it("renders tenths with a comma decimal separator", () => {
    expect(formatPercent(BigInt(908))).toBe("90,8 %")
    expect(formatPercent(BigInt(563))).toBe("56,3 %")
    expect(formatPercent(BigInt(1000))).toBe("100,0 %")
    expect(formatPercent(BigInt(0))).toBe("0,0 %")
  })

  it("renders an em dash when there is no percentage", () => {
    expect(formatPercent(null)).toBe("—")
  })
})

describe("withinTolerance / toleranceThreshold", () => {
  it("compares e*10000 <= p*(10000 + bp) exactly: 13.200.000 within, 13.200.000,01 outside for P 12.000.000 and 10 %", () => {
    const programmed = toCents("12000000")

    expect(withinTolerance(toCents("12000000"), programmed, bp10pct)).toBe(true)
    expect(withinTolerance(toCents("13200000"), programmed, bp10pct)).toBe(true)
    expect(withinTolerance(toCents("13200000.01"), programmed, bp10pct)).toBe(false)
    expect(withinTolerance(toCents("13500000"), programmed, bp10pct)).toBe(false)
  })

  it("treats a zero tolerance as an exact bound", () => {
    const programmed = toCents("12000000")
    expect(withinTolerance(programmed, programmed, BigInt(0))).toBe(true)
    expect(withinTolerance(toCents("12000000.01"), programmed, BigInt(0))).toBe(false)
  })

  it("computes the display threshold", () => {
    expect(toleranceThreshold(toCents("12000000"), bp10pct)).toBe(toCents("13200000"))
  })
})

describe("formatCOP", () => {
  it("formats COP with dots as thousands separators and no decimals when whole", () => {
    expect(formatCOP(toCents("59500000"))).toBe("$ 59.500.000")
    expect(formatCOP(toCents("0"))).toBe("$ 0")
    expect(formatCOP(toCents("1234567.89"))).toBe("$ 1.234.567,89")
  })

  it("keeps the cents when the amount is not whole", () => {
    expect(formatCOP(toCents("59500000.5"))).toBe("$ 59.500.000,50")
  })

  it("does the whole thing in bigint, so a large amount never loses precision", () => {
    expect(formatCOP(toCents("999999999999.99"))).toBe("$ 999.999.999.999,99")
  })
})
