import { defineConfig } from "@playwright/test";

/** E2E tests run against an already running stack (`make demo`). Override the URL with E2E_BASE_URL. */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    // Full Chromium in new headless mode (no separate headless-shell download needed).
    channel: "chromium",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
