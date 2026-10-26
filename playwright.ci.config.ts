import { defineConfig, devices } from "@playwright/test";

// E2E suite in CI (E1). Unlike playwright.config.ts (demo-paced, recorded,
// against an already-running dev server), this config starts the production
// build itself and runs at full speed against the seeded local Supabase that
// the `e2e` job brings up. It is never pointed at a remote environment.
export default defineConfig({
  testDir: "./e2e",
  testIgnore: [
    // Needs a clean demo (zero projects) and conflicts with the S11 seed the
    // rest of the suite uses; it stays a manual run (docs/guia-prueba-proyectos.md).
    "**/proyectos-demo.spec.ts",
    // Needs a real QA account (QA_TEST_EMAIL / QA_TEST_PASSWORD) and skips without it.
    "**/change-password.spec.ts",
  ],
  timeout: 180_000,
  expect: { timeout: 15_000 },
  // Several specs are serial and mutate shared seed state (permisos, ficha-ejecucion).
  fullyParallel: false,
  workers: 1,
  retries: 1,
  outputDir: "test-results-ci",
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report-ci" }]],
  use: {
    baseURL: "http://localhost:3000",
    video: "off",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 60_000,
  },
  webServer: {
    command: "npm start",
    url: "http://localhost:3000/login",
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
