import { defineConfig, devices } from "@playwright/test";

// E2E suite in CI (E1). Unlike playwright.config.ts (demo-paced, recorded,
// against an already-running dev server), this config starts the production
// build itself and runs at full speed against the seeded local Supabase that
// the `e2e` job brings up. It runs only the maintained suite (e2e/proyectos-v2);
// the root legacy specs are a documented follow-up (odd/tasks/e2e-proyectos-v2.md).
// It is never pointed at a remote environment.
export default defineConfig({
  testDir: "./e2e/proyectos-v2",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  // Several specs are serial and mutate shared seed state (permisos, ficha-ejecucion).
  fullyParallel: false,
  workers: 1,
  // No retries: the serial specs mutate the seed, so a retry would rerun them against
  // state the failed attempt already changed and could pass or fail for the wrong reason.
  retries: 0,
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
