import { describe, expect, it } from "vitest"
import { formatMillones } from "./millones"

describe("formatMillones", () => {
  it("renders millions with one decimal, thousands dotted and a comma decimal", () => {
    expect(formatMillones(BigInt(156_770_000_000))).toBe("$ 1.567,7 M")
    expect(formatMillones(BigInt(17_740_000_000))).toBe("$ 177,4 M")
  })
  it("drops the decimal when it is zero", () => {
    expect(formatMillones(BigInt(200_000_000_000))).toBe("$ 2.000 M")
  })
  it("falls back to the standard COP format below one million", () => {
    expect(formatMillones(BigInt(99_999_900))).toBe("$ 999.999")
  })
})
