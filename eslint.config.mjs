import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated artifacts
    "coverage/**",
    // Local-only artifacts that are not tracked but break a local lint run:
    // Next moves an outdated build aside as `.next-stale-<timestamp>`,
    // the Supabase CLI caches into `supabase/.temp`, and the design
    // handoff prototype lives outside the app.
    ".next-*/**",
    "supabase/.temp/**",
    "Web app views creation/**",
  ]),
]);

export default eslintConfig;
