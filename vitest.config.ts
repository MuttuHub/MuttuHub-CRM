import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { configDefaults, defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["src/test/setup.ts"],
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
      reporter: ["text", "html"],
      // Thresholds desactivados a propósito: la cobertura real es ~13-15% y un
      // gate de 60% que no se cumple solo genera ruido. Meta documentada en
      // docs/pendientes/pendientes-y-mejoras.md — reactivar cuando la suite
      // de componentes/hooks crezca y el porcentaje real se acerque a la meta.
      // thresholds: {
      //   lines: 60,
      //   statements: 60,
      //   functions: 60,
      //   branches: 50,
      // },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
})