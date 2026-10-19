import { describe, expect, it } from "vitest"
import { nearestRank, summarize, verdict } from "./bench-stats"

describe("bench stats", () => {
  it("nearest-rank percentiles over 10 samples", () => {
    const samples = [50, 10, 20, 30, 40, 60, 70, 80, 90, 100]
    expect(nearestRank(samples, 50)).toBe(50)
    expect(nearestRank(samples, 95)).toBe(100)
    expect(nearestRank(samples, 10)).toBe(10)
  })

  it("rejects empty input and an out-of-range percentile", () => {
    expect(() => nearestRank([], 50)).toThrow(RangeError)
    expect(() => nearestRank([1], 0)).toThrow(RangeError)
    expect(() => nearestRank([1], 101)).toThrow(RangeError)
  })

  it("summarizes min, p50, p95, max with one decimal", () => {
    expect(summarize([120.04, 100, 130, 110])).toEqual({ runs: 4, min: 100, p50: 110, p95: 130, max: 130 })
  })

  it("flags the 3 s limit and the 1.5 s cache threshold", () => {
    expect(verdict({ runs: 1, min: 0, p50: 0, p95: 900, max: 0 })).toEqual({ ok: true, cacheWarranted: false })
    expect(verdict({ runs: 1, min: 0, p50: 0, p95: 2000, max: 0 })).toEqual({ ok: true, cacheWarranted: true })
    expect(verdict({ runs: 1, min: 0, p50: 0, p95: 3000, max: 0 })).toEqual({ ok: false, cacheWarranted: true })
  })
})
