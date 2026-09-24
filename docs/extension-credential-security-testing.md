# Extension credential security tests

Verified locally on 2026-09-24. This suite covers the extension API-key setup flow. It is not a coverage claim for every Knoww security control.

## Run the checks

From the repository root:

```sh
pnpm --filter @knoww/web test:credential-security
pnpm --filter @knoww/web test:credential-security:browser
```

If Chromium is not installed, install the Playwright-managed browser first:

```sh
pnpm --filter @knoww/web exec playwright install chromium
```

The security runner disables environment-file loading and Cloudflare runtime initialization. It uses synthetic accounts, session fixtures, and credentials. External credential-service calls are simulated. The browser suite intercepts requests and serves the repository's signing asset with its static CSP. Neither command uses a personal browser profile or submits an order.

The runner uses the web package's existing Vitest and V8 coverage dependencies. No dependencies were added. It writes the HTML report to `apps/web/coverage/credential-security/index.html` and machine-readable totals to `coverage-summary.json` in that directory. Per-file line and branch thresholds fail the command if coverage falls below the configured floors.

The existing Web CI workflow runs `test:credential-security` for pull requests targeting `main` or `agg-restructuring`. Playwright checks are manual only; CI does not install Chromium or run the browser suite. The workflow change has not run on GitHub yet.

## What the tests exercise

| Area | Automated checks | Boundary exercised |
| --- | --- | --- |
| Background routing | External or missing sender identity, subframes, absent/wrong tabs, malformed inputs | Actual registered runtime message handler |
| Session and claim checks | Missing, malformed, expired, or wrong-wallet sessions; forged, expired, released, replaced, or replayed claims; duplicate requests | Actual session decoding, claim ownership, expiry, and request coalescing |
| Onboarding permission | Forged, expired, wrong-tab, and reused permits | Actual permit issuance/consumption through the router |
| Signing location | Onboarding uses its existing document; other credential setup opens a dedicated tab; navigation, tab closure, or changed document aborts | Actual trusted-tab signing orchestration with simulated Chrome APIs |
| Wallet choice and signature | MetaMask and Phantom provider selection, ambiguous wallets, wrong accounts, malformed signatures, valid signatures from another account | Actual injected signing function with provider fixtures; actual viem signature recovery |
| Failure and recovery | Wallet rejection, signing timeout, credential-service failure, malformed credential response, successful retry | Actual router cleanup and credential persistence |
| Delayed responses | Overall request timeout, session expiry/account change, or replaced claim while the service is working | Actual completion checks before credential persistence |
| Secret handling | Credentials stay in trusted session storage; success responses contain only the method; partial credentials are rejected; bearer-token namespace is inaccessible through `creds:*` | Actual storage and mediation modules with simulated Chrome storage |
| Content integration | Single-flight derivation, claim cleanup, sole-wallet fallback, wallet changes, WalletConnect dispatch, onboarding permit forwarding | Existing credential-manager tests |
| Web session authentication | Expiry, invalid HMAC on an expired token, revocation/cleanup, concurrent relayer sessions, SIWE challenge origin binding | Existing session tests use real token signing/verification with simulated storage; challenge-route tests mock issuance and rate limiting |
| Browser CSP | Blocks inline/site scripts and inline handlers, fetch/beacon requests, and iframe embedding; retains the signing UI | Chromium enforcing the policy read from `public/_headers` on the repository HTML |

The new background integration file contains 46 cases. It imports the real background entry point. Only unrelated telemetry modules, Chrome APIs, and the external credential service are replaced. It generates disposable signatures with the real ClobAuth typed data.

The worker's session fixture is deliberately synthetic. The worker reads session facts from trusted extension storage; the separate web tests exercise server signature validation. The integration fixture does not prove server authentication by itself.

## Regressions found while adding coverage

| Case | Observed before the fix | Result after the fix |
| --- | --- | --- |
| Credential service completes after the overall timeout | Credentials were stored after the caller had received a timeout | Result is discarded; no credentials or success broadcast; a fresh attempt succeeds |
| Session expires while credential service is working | Response reported success and stored credentials | Completion fails before storage |
| Claim is replaced while credential service is working | Old response reported success and stored credentials | Old response is rejected and the replacement claim remains active |
| Incomplete successful credential response | Raw partial API key and secret reached the caller | Response is rejected without returning its data; retry succeeds |

These regressions failed against the implementation present before their fixes. A further passing test checks an account change during credential creation. The production changes recheck the active attempt, session, and claim before saving a trusted derivation result, and reject malformed successful derivation responses. Normal onboarding, dedicated signing tabs, and WalletConnect dispatch retain their existing behavior.

## Measured coverage

V8 coverage from the focused extension suite, not the full test run:

| File or scope | Lines | Branches |
| --- | ---: | ---: |
| Selected background security helpers combined | 91.79% | 82.28% |
| `creds-guards.ts` | 100% | 100% |
| `clob-credentials-store.ts` | 100% | 100% |
| `clob-credential-derivation-lock.ts` | 100% | 90.47% |
| `extension-session-token.ts` | 95.45% | 85.71% |
| `extension-session.ts` | 84.37% | 80.95% |
| `onboarding-clob-signing.ts` | 90% | 72.72% |
| `trading-credential-mediation.ts` | 100% | 86.66% |
| `trusted-clob-signing.ts` | 89.43% | 80.14% |
| Content `credentials.ts` | 78.35% | 66.03% |
| Entire `background.ts`, including unrelated handlers | 22.19% | 18.15% |
| All selected files, including entire `background.ts` | 38.06% | 33.77% |

The router totals include unrelated handlers such as scoring and trading. They are shown to keep the denominator visible. There is no claim of 100% flow coverage, and the helper thresholds do not replace the behavioral checks above.

## Commands actually run

Working directories are relative to the repository root.

| Directory | Command | Result |
| --- | --- | --- |
| `apps/web` | `node scripts/test-credential-security.mjs` | 110 extension tests and 27 web tests passed; coverage thresholds passed |
| `apps/web` | `./node_modules/.bin/playwright test --config playwright.security.config.ts` | 3 Chromium tests passed |
| `apps/extension` | `./node_modules/.bin/tsc --noEmit` | Passed |
| `apps/web` | `./node_modules/.bin/tsc --noEmit` | Passed |
| Repository root | Biome command below | Passed with one existing optional-chain warning |

The full extension suite also passed, with 1,178 tests across 150 files. It was run from `apps/extension` without loading environment files:

```sh
node --input-type=module -e 'const {startVitest}=await import("vitest/node"); const ctx=await startVitest("test",[],{run:true},{envDir:false}); await ctx?.close();'
```

The failing regression runs used the same programmatic command with `["tests/background/credential-security.integration.test.ts"]` in place of `[]`.

```sh
./node_modules/.bin/biome check \
  apps/extension/src/background.ts \
  apps/extension/src/background/trading-credential-mediation.ts \
  apps/extension/tests/background/credential-security.integration.test.ts \
  apps/extension/tests/background/trusted-clob-signing.test.ts \
  apps/web/playwright.security.config.ts \
  apps/web/e2e/security/extension-credentials.spec.ts \
  apps/web/scripts/test-credential-security.mjs \
  apps/web/package.json
```

## Remaining browser verification

These checks were **not run** in this pass. Use an isolated browser profile and an unfunded test wallet with the built trading-enabled extension.

| Manual check | Expected result |
| --- | --- |
| Complete onboarding with MetaMask, then Phantom | Selected wallet receives ClobAuth request; signing stays in the existing Knoww onboarding tab |
| Generate credentials from the trading panel and extension sidebar | Dedicated Knoww signing tab opens, then closes after completion |
| Reject a signature, then retry | Friendly rejection message; no stored credentials from the rejected attempt; retry succeeds |
| Change account, navigate, or close the signing tab during setup | Attempt fails; credentials are not accepted for the wrong wallet/document |
| Repeat with WalletConnect | Connection and credential setup complete through the existing WalletConnect path |
| Inspect the response headers in the actual deployment | `/extension-credentials.html` receives the configured CSP when served directly |
| Use the installed extension on the CSP-protected signing page | Legitimate extension injection and wallet approval work together under the real browser policy |

Chromium policy tests prove enforcement of the repository policy. They do not prove that Cloudflare delivers the header, or that installed MetaMask/Phantom popups behave correctly with a bundled extension. The complete HTTP challenge/sign-in exchange, service-worker suspension/restart during an in-flight request, storage failures, and storage-write races need additional coverage. No real credential-service request or production build was used for this pass.

## Files changed for this pass

- `apps/extension/tests/background/credential-security.integration.test.ts`: router security and recovery tests.
- `apps/extension/tests/background/trusted-clob-signing.test.ts`: run provider-selection coverage for both MetaMask and Phantom.
- `apps/extension/src/background.ts`: reject stale and incomplete credential results.
- `apps/extension/src/background/trading-credential-mediation.ts`: clarify the caller's handling of incomplete responses.
- `apps/web/e2e/security/extension-credentials.spec.ts` and `apps/web/playwright.security.config.ts`: browser CSP checks.
- `apps/web/scripts/test-credential-security.mjs` and `apps/web/package.json`: repeatable security suite and coverage thresholds.
- `.github/workflows/web-ci.yml`: run the security coverage checks on applicable pull requests; browser checks remain manual.
- This document: scope, evidence, commands, and remaining checks.

Earlier staged changes were preserved. No commit, push, deployment, or pull request was created. No schema or dependency migration is required; the extension changes take effect after rebuilding and reloading its trading-enabled bundle.
