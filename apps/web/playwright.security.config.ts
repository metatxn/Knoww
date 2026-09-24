import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/security",
  timeout: 20_000,
  expect: { timeout: 5_000 },
  use: { browserName: "chromium", headless: true },
  // These tests serve repository assets through Playwright routes. No app
  // server, environment files, wallet profile, or external network is needed.
  reporter: "list",
});
