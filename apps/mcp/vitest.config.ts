import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      // The pool loads the top-level wrangler.jsonc environment, so tests
      // see the production-shaped vars (oauth-required) by default.
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          GOOGLE_CLIENT_ID: "google-test-client.apps.googleusercontent.com",
          GOOGLE_CLIENT_SECRET: "google-test-secret",
          POSTHOG_PROJECT_API_KEY: "",
        },
      },
    }),
  ],
  test: {
    include: ["src/**/*.test.ts"],
    // Bound workerd startup while pnpm runs the other workspace suites.
    // Per-file storage isolation remains enabled.
    maxWorkers: 2,
    // Allow for Durable Object startup on cold runners.
    testTimeout: 10_000,
  },
});
