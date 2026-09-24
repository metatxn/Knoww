import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startVitest } from "vitest/node";

const webRoot = fileURLToPath(new URL("../", import.meta.url));
const extensionRoot = resolve(webRoot, "../extension");

// Prevent environment-file loading and Cloudflare runtime initialization.
process.env.NEXT_RUNTIME = "test";
process.env.NEXT_PHASE = "phase-test";
delete process.env.EXTENSION_SESSION_SECRET;

const extensionTests = [
  "tests/background/credential-security.integration.test.ts",
  "tests/background/trusted-clob-signing.test.ts",
  "tests/background/trusted-clob-signing-ui.test.ts",
  "tests/background/onboarding-clob-signing.test.ts",
  "tests/background/creds-guards.test.ts",
  "tests/background/clob-credentials-store.test.ts",
  "tests/background/clob-credential-derivation-lock.test.ts",
  "tests/background/extension-session-storage.test.ts",
  "tests/background/extension-session-token.test.ts",
  "tests/background/trading-credential-mediation.test.ts",
  "tests/content/credential-manager.test.ts",
];
const securityFiles = [
  "src/background.ts",
  "src/background/trusted-clob-signing.ts",
  "src/background/onboarding-clob-signing.ts",
  "src/background/creds-guards.ts",
  "src/background/clob-credential-derivation-lock.ts",
  "src/background/clob-credentials-store.ts",
  "src/background/extension-session.ts",
  "src/background/extension-session-token.ts",
  "src/background/trading-credential-mediation.ts",
  "src/content/trading/credentials.ts",
];

const extension = await startVitest(
  "test",
  extensionTests,
  {
    root: extensionRoot,
    config: resolve(extensionRoot, "vitest.config.ts"),
    run: true,
    coverage: {
      enabled: true,
      provider: "v8",
      reportsDirectory: resolve(webRoot, "coverage/credential-security"),
      reporter: ["text", "json-summary", "html"],
      include: securityFiles,
      thresholds: {
        "src/background/creds-guards.ts": { lines: 100, branches: 100 },
        "src/background/clob-credentials-store.ts": {
          lines: 100,
          branches: 100,
        },
        "src/background/clob-credential-derivation-lock.ts": {
          lines: 100,
          branches: 90,
        },
        "src/background/trusted-clob-signing.ts": { lines: 89, branches: 80 },
        "src/background/onboarding-clob-signing.ts": {
          lines: 90,
          branches: 72,
        },
        "src/background/extension-session.ts": { lines: 84, branches: 80 },
        "src/background/extension-session-token.ts": {
          lines: 95,
          branches: 85,
        },
        "src/background/trading-credential-mediation.ts": {
          lines: 100,
          branches: 86,
        },
        "src/content/trading/credentials.ts": { lines: 78, branches: 66 },
      },
    },
  },
  { envDir: false }
);
if (!extension) throw new Error("Credential security tests did not start");
await extension.close();

const web = await startVitest(
  "test",
  [
    "src/middleware.test.ts",
    "src/lib/auth/extension-session.test.ts",
    "src/app/api/extension/session/challenge/route.test.ts",
  ],
  {
    root: webRoot,
    config: resolve(webRoot, "vitest.config.ts"),
    run: true,
  },
  { envDir: false }
);
if (!web) throw new Error("Web session security tests did not start");
await web.close();
