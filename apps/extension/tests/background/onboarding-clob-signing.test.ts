import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import {
  clearOnboardingClobSigningPermitsForTab,
  consumeOnboardingClobSigningPermit,
  issueOnboardingClobSigningPermit,
} from "../../src/background/onboarding-clob-signing";

const address = "0x000000000000000000000000000000000000cafe";
const onboardingUrl = "chrome-extension://knoww/onboarding.html?embedded=1";
const setupUrl = "https://knoww.app/extension/connect";
function sender(url = setupUrl): chrome.runtime.MessageSender {
  return {
    id: "knoww",
    url: onboardingUrl,
    frameId: 2,
    tab: { id: 11, url } as chrome.tabs.Tab,
  };
}

beforeEach(() => {
  vi.stubGlobal("__DEV_MODE__", false);
  vi.stubGlobal("chrome", {
    runtime: {
      id: "knoww",
      getURL: (path: string) => `chrome-extension://knoww/${path}`,
    },
  });
});
afterEach(() => {
  clearOnboardingClobSigningPermitsForTab(11);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("only the packaged iframe on the exact onboarding route can issue a signing permit", () => {
  const token = issueOnboardingClobSigningPermit(sender(), address);
  assert.ok(token);
  assert.equal(
    consumeOnboardingClobSigningPermit(token, 11, address),
    setupUrl
  );
  for (const invalid of [
    { ...sender(), id: "another-extension" },
    { ...sender(), url: "chrome-extension://knoww/sidepanel.html" },
    { ...sender(), url: setupUrl, frameId: 0 },
    { ...sender(), frameId: 0 },
    { ...sender(), frameId: undefined },
    sender("https://knoww.app/"),
    sender("https://knoww.app/extension/connect?redirect=https://example.com"),
    sender("https://knoww.app.evil.example/extension/connect"),
    sender("https://example.com/extension/connect"),
  ])
    assert.equal(issueOnboardingClobSigningPermit(invalid, address), undefined);
});

test("localhost signing permits are limited to development and the configured port", () => {
  const localUrl = "http://localhost:8000/extension/connect";
  assert.equal(
    issueOnboardingClobSigningPermit(sender(localUrl), address),
    undefined
  );
  vi.stubGlobal("__DEV_MODE__", true);
  const token = issueOnboardingClobSigningPermit(sender(localUrl), address);
  assert.ok(token);
  assert.equal(
    consumeOnboardingClobSigningPermit(token, 11, address),
    localUrl
  );
  assert.equal(
    issueOnboardingClobSigningPermit(
      sender("http://localhost:8001/extension/connect"),
      address
    ),
    undefined
  );
});

test("permits are bound to a tab and wallet, expire, and cannot be replayed", () => {
  vi.useFakeTimers();
  const token = issueOnboardingClobSigningPermit(sender(), address);
  assert.ok(token);
  assert.throws(
    () => consumeOnboardingClobSigningPermit(token, 12, address),
    /expired/
  );
  assert.throws(
    () => consumeOnboardingClobSigningPermit(token, 11, `0x${"d".repeat(40)}`),
    /expired/
  );
  assert.equal(
    consumeOnboardingClobSigningPermit(token, 11, address),
    setupUrl
  );
  assert.throws(
    () => consumeOnboardingClobSigningPermit(token, 11, address),
    /expired/
  );
  const stale = issueOnboardingClobSigningPermit(sender(), address);
  assert.ok(stale);
  vi.advanceTimersByTime(240_001);
  assert.throws(
    () => consumeOnboardingClobSigningPermit(stale, 11, address),
    /expired/
  );
});

test("closing or navigating the onboarding tab revokes its pending permit", () => {
  const token = issueOnboardingClobSigningPermit(sender(), address);
  assert.ok(token);
  clearOnboardingClobSigningPermitsForTab(11);
  assert.throws(
    () => consumeOnboardingClobSigningPermit(token, 11, address),
    /expired/
  );
});
