// Pure statistics of the dashboard bench (S9 U4): nearest-rank percentiles over wall-clock samples.

export type BenchSummary = { runs: number; min: number; p50: number; p95: number; max: number }

/** Nearest-rank percentile (`p` in 1..100) of a non-empty sample set. */
export function nearestRank(samples: readonly number[], p: number): number {
  if (samples.length === 0) throw new RangeError("No samples");
  if (!(p > 0 && p <= 100)) throw new RangeError("p must be in (0, 100]");
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.max(1, Math.ceil((p / 100) * sorted.length)) - 1];
}

export function summarize(samples: readonly number[]): BenchSummary {
  const round = (value: number) => Math.round(value * 10) / 10;
  return {
    runs: samples.length,
    min: round(Math.min(...samples)),
    p50: round(nearestRank(samples, 50)),
    p95: round(nearestRank(samples, 95)),
    max: round(Math.max(...samples)),
  };
}

/** p95 above this means the SDD's cache table (S9.4 / ADR-12) would be warranted. */
export const CACHE_THRESHOLD_MS = 1500;
/** Acceptance limit of the portfolio dashboard (RNF). */
export const P95_LIMIT_MS = 3000;

export function verdict(summary: BenchSummary): { ok: boolean; cacheWarranted: boolean } {
  return { ok: summary.p95 < P95_LIMIT_MS, cacheWarranted: summary.p95 > CACHE_THRESHOLD_MS };
}
