import { defineConfig, devices } from "@playwright/test";

// Verification (non demo-paced) config for the v2 Projects E2E suite.
// Runs against an ALREADY RUNNING dev server; it never starts or stops it.
// Usage: PLAYWRIGHT_BASE_URL=http://172.30.48.1:3000 \
//   npx playwright test --config playwright.verify.config.ts
export default defineConfig({
  testDir: "./e2e/proyectos-v2",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: "./test-results-verify",
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report-verify" }],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    video: "off",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
