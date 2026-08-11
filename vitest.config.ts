import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["src/test/setup.ts"],
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
      thresholds: {
        lines: 60,
        statements: 60,
        functions: 60,
        branches: 50,
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
})