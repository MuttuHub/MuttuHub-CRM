import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { configDefaults, defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["src/test/setup.ts"],
    // Resource envelope (CP-4, measured 2026-10-01). This suite is jsdom-heavy on a
    // memory-constrained machine (12 logical CPUs, 7.6 GiB total, 2.7-3.1 GiB
    // available). The reproducible failure mode is contention, not the worker count:
    // running two full suites concurrently produced 6-7 failures in each
    // (`Test timed out in 5000ms`, `pointer-events: none`) on specs that all pass in
    // isolation, while a single suite is green. Three sequential non-contended runs
    // with the cap below were green (122 files / 1122 tests); cumulative jsdom
    // `environment` time was 164-172 s warm and 299 s on the first cold run, so a
    // slow first run is expected on this filesystem. Pinning the pool keeps
    // `npm test`, an ad-hoc `npx vitest run` and the documented `--pool=threads`
    // command on one code path. Note: `minWorkers` does not exist in vitest 4.1.10.
    pool: "threads",
    maxWorkers: 4,
    // e2e/ holds Playwright specs (@playwright/test's own runner, video
    // recording against the live dev server) — vitest's default glob would
    // otherwise pick them up and fail them (wrong test/expect implementation).
    // Spread the built-in defaults too, since setting `exclude` replaces them.
    exclude: [...configDefaults.exclude, "e2e/**"],
    // En Vitest 4 `coverage` se configura dentro de `test` (no top-level) y la
    // opción `all` fue removida: con `include` definido, los archivos no
    // cubiertos que matcheen los patrones entran al reporte. Scope intencional:
    // código cliente testeable en jsdom.
    coverage: {
      include: [
        "src/lib/**",
        "src/store/**",
        "src/hooks/**",
        "src/components/**",
      ],
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/*.d.ts",
        "src/lib/api/**",
        "src/lib/supabase/**",
        "src/lib/auth/**",
        "src/lib/mock/**",
        "src/lib/db.ts",
        "src/lib/email.ts",
      ],
      reporter: ["text-summary", "html"],
      // Ratchet (E2): the floor is the coverage measured on 2026-10-21 with
      // `npm run test:coverage` (src + scripts, the same scope CI runs). A run
      // below it fails. When coverage rises, autoUpdate rewrites these values
      // upwards (rounded down) and the change is committed with the tests that
      // earned it. Lowering a value is a deliberate, reviewable edit.
      thresholds: {
        autoUpdate: (newThreshold) => Math.floor(newThreshold),
        lines: 73,
        statements: 72,
        functions: 68,
        branches: 64,
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
})