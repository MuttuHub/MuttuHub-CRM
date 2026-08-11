import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["src/test/setup.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
coverage: {
    all: true,
    // Scope intencional: código cliente testeable en jsdom. Nota (2026-08-10):
    // en vitest 4.1.10 + v8 los patrones de include/exclude NO filtran el grafo
    // cargado (los archivos importados por tests siempre se reportan, p.ej.
    // lib/api/* y lib/mock/demo.ts vía imports transitivos). Se dejan igual
    // para cuando el provider respete los patrones.
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
})