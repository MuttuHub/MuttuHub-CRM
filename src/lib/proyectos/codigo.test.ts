import { describe, expect, it } from "vitest"

import { formatProjectCode, parseProjectCode, projectCodePrefix } from "./codigo"

describe("formatProjectCode", () => {
  it("zero-pads the sequence to a minimum of three digits", () => {
    expect(formatProjectCode(2026, 1)).toBe("PRY-2026-001")
    expect(formatProjectCode(2026, 42)).toBe("PRY-2026-042")
    expect(formatProjectCode(2026, 999)).toBe("PRY-2026-999")
  })

  it("never truncates a sequence of four or more digits", () => {
    expect(formatProjectCode(2026, 1000)).toBe("PRY-2026-1000")
    expect(formatProjectCode(2026, 12345)).toBe("PRY-2026-12345")
  })

  it("pads the year to the four-digit shape of the code", () => {
    expect(formatProjectCode(26, 1)).toBe("PRY-0026-001")
  })

  it("rejects a non-positive or non-integer sequence", () => {
    expect(() => formatProjectCode(2026, 0)).toThrow(RangeError)
    expect(() => formatProjectCode(2026, -1)).toThrow(RangeError)
    expect(() => formatProjectCode(2026, 1.5)).toThrow(RangeError)
    expect(() => formatProjectCode(2026, Number.NaN)).toThrow(RangeError)
  })

  it("rejects a nonsense year", () => {
    expect(() => formatProjectCode(0, 1)).toThrow(RangeError)
    expect(() => formatProjectCode(-2026, 1)).toThrow(RangeError)
    expect(() => formatProjectCode(2026.5, 1)).toThrow(RangeError)
    expect(() => formatProjectCode(10_000, 1)).toThrow(RangeError)
  })
})

describe("parseProjectCode", () => {
  it("extracts the year and the sequence", () => {
    expect(parseProjectCode("PRY-2026-001")).toEqual({ year: 2026, sequence: 1 })
    expect(parseProjectCode("PRY-2026-1000")).toEqual({ year: 2026, sequence: 1000 })
  })

  it("round-trips with formatProjectCode", () => {
    for (const [year, sequence] of [
      [2026, 1],
      [1999, 7],
      [2026, 1000],
    ] as const) {
      expect(parseProjectCode(formatProjectCode(year, sequence))).toEqual({ year, sequence })
    }
  })

  it("returns null for a string that is not exactly the code format", () => {
    expect(parseProjectCode("")).toBeNull()
    expect(parseProjectCode("PRY-2026-1")).toBeNull()
    expect(parseProjectCode("PRY-2026-")).toBeNull()
    expect(parseProjectCode("pry-2026-001")).toBeNull()
    expect(parseProjectCode("PRY-26-001")).toBeNull()
    expect(parseProjectCode("PRY-2026-0001")).toBeNull()
    expect(parseProjectCode("PRY-2026-001x")).toBeNull()
    expect(parseProjectCode(" PRY-2026-001")).toBeNull()
    expect(parseProjectCode("PRY-2026-001 ")).toBeNull()
  })

  it("rejects a zero sequence even though it is three digits", () => {
    expect(parseProjectCode("PRY-2026-000")).toBeNull()
  })
})

describe("projectCodePrefix", () => {
  it("is the year-padded prefix shared by every code of that year", () => {
    expect(projectCodePrefix(2026)).toBe("PRY-2026-")
    expect(projectCodePrefix(26)).toBe("PRY-0026-")
  })

  it("validates the year like formatProjectCode does", () => {
    expect(() => projectCodePrefix(0)).toThrow(RangeError)
    expect(() => projectCodePrefix(10_000)).toThrow(RangeError)
  })
})
