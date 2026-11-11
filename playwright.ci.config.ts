import { defineConfig, devices } from "@playwright/test";

// E2E suite in CI (E1). Unlike playwright.config.ts (demo-paced, recorded,
// against an already-running dev server), this config starts the production
// build itself and runs at full speed against the seeded local Supabase that
// the `e2e` job brings up. It runs the maintained suite (e2e/proyectos-v2) plus the
// root legacy specs that match the current UI (CI_LEGACY_SPECS). The rest of the
// root specs stay out on purpose (odd/tasks/e2e-proyectos-v2.md): crm-demo and
// proyectos-demo are recorded demos (proyectos-demo needs zero projects),
// change-password needs a real QA account, permisos-colaborador is blocked by
// the kanban card's aria-disabled wrapper. It is never pointed at a remote environment.
//
// Files run in path order: the legacy specs (e2e/*.spec.ts) run before
// e2e/proyectos-v2/, and none of them touches data the v2 suite relies on.
const CI_LEGACY_SPECS = ["invitation-flow", "oportunidad-ciclo", "proyectos-ficha-pagina"];

export default defineConfig({
  testDir: "./e2e",
  testMatch: [
    /[\\/]e2e[\\/]proyectos-v2[\\/][^\\/]+\.spec\.ts$/,
    new RegExp(`[\\\\/]e2e[\\\\/](${CI_LEGACY_SPECS.join("|")})\\.spec\\.ts$`),
  ],
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
