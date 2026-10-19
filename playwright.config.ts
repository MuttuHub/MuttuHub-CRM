import { defineConfig, devices } from "@playwright/test";

// CRM demo run against the already-running local dev server
// (http://localhost:3000). This config intentionally does NOT define a
// `webServer` block: the app must already be up, and Playwright must never
// start/stop it. Single chromium project, single worker, ordered — the goal
// is one narratable video of the CRM flows, not parallel isolation.
export default defineConfig({
  testDir: "./e2e",
  // Generous: slowMo + the spec's own "reading time" pauses between beats
  // easily push this past the default 60s for a demo-paced run.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    video: "on",
    trace: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    // Demo-paced on purpose (this project exists to produce a watchable
    // recording, not to run fast): every click/fill/type is slowed down so
    // the video reads as a person working, not a bot blur.
    launchOptions: { slowMo: 350 },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
