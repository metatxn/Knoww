import assert from "node:assert/strict";
import { buildClobAuthRpcTypedData } from "@knoww/shared-types/polymarket";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { afterEach, test, vi } from "vitest";

vi.mock("../../src/background/extension-session", () => ({
  getKnowwAppUrl: () => "https://knoww.app",
}));

import {
  clearOnboardingClobSigningPermitsForTab,
  issueOnboardingClobSigningPermit,
} from "../../src/background/onboarding-clob-signing";
import {
  assertClobAuthSigner,
  signClobAuthInPage,
  signClobAuthInTrustedTab,
  TRUSTED_CLOB_SIGNING_PATH,
} from "../../src/background/trusted-clob-signing";

const address = "0x000000000000000000000000000000000000cafe";
const wallet = { name: "MetaMask", rdns: "io.metamask" };
const trustedUrl = `https://knoww.app${TRUSTED_CLOB_SIGNING_PATH}`;
type TabUpdateListener = (
  tabId: number,
  change: { url?: string; status?: string }
) => void;
type TabRemoveListener = (tabId: number) => void;

function installSigningPage(
  providers: Array<{
    info: { name: string; rdns: string };
    provider: { request: ReturnType<typeof vi.fn> };
  }>
) {
  const page = new EventTarget() as EventTarget & {
    top?: EventTarget;
    postMessage: ReturnType<typeof vi.fn>;
  };
  page.top = page;
  page.postMessage = vi.fn();
  page.addEventListener("eip6963:requestProvider", () => {
    for (const detail of providers) {
      const announcement = new Event("eip6963:announceProvider") as Event & {
        detail: typeof detail;
      };
      announcement.detail = detail;
      page.dispatchEvent(announcement);
    }
  });
  vi.stubGlobal("window", page);
  vi.stubGlobal("location", {
    origin: "https://knoww.app",
    pathname: TRUSTED_CLOB_SIGNING_PATH,
  });
  return page;
}

afterEach(() => {
  clearOnboardingClobSigningPermitsForTab(11);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function installOnboardingTabs(url = "https://knoww.app/extension/connect") {
  const updated = new Set<TabUpdateListener>();
  const removed = new Set<TabRemoveListener>();
  const executeScript = vi.fn(async () => [
    {
      frameId: 0,
      documentId: "onboarding-document",
      result: `0x${"a".repeat(130)}`,
    },
  ]);
  const tabs = {
    get: vi.fn(async (tabId: number) => ({
      id: tabId,
      windowId: 2,
      url: tabId === 11 ? url : trustedUrl,
      status: "complete",
    })),
    create: vi.fn(async () => ({ id: 44 })),
    remove: vi.fn(async () => {}),
    update: vi.fn(async () => {}),
    onUpdated: {
      addListener: (listener: TabUpdateListener) => updated.add(listener),
      removeListener: (listener: TabUpdateListener) => updated.delete(listener),
    },
    onRemoved: {
      addListener: (listener: TabRemoveListener) => removed.add(listener),
      removeListener: (listener: TabRemoveListener) => removed.delete(listener),
    },
  };
  vi.stubGlobal("__DEV_MODE__", url.startsWith("http://localhost:8000/"));
  vi.stubGlobal("chrome", {
    tabs,
    scripting: { executeScript },
    runtime: {
      id: "knoww",
      getURL: (path: string) => `chrome-extension://knoww/${path}`,
    },
  });
  const permit = issueOnboardingClobSigningPermit(
    {
      id: "knoww",
      url: "chrome-extension://knoww/onboarding.html?embedded=1",
      frameId: 2,
      tab: { id: 11, url } as chrome.tabs.Tab,
    },
    address
  );
  assert.ok(permit);
  return { tabs, executeScript, permit, updated, removed };
}

test.each([
  "https://knoww.app/extension/connect",
  "http://localhost:8000/extension/connect",
])(
  "onboarding signs in the existing tab at %s without opening or closing a tab",
  async (url) => {
    const { tabs, executeScript, permit, updated, removed } =
      installOnboardingTabs(url);
    const signature = await signClobAuthInTrustedTab({
      address,
      sourceTabId: 11,
      sourceDocumentId: "onboarding-document",
      onboardingSigningPermit: permit,
      typedData: "typed-data",
      wallet,
    });
    assert.equal(signature, `0x${"a".repeat(130)}`);
    assert.equal(tabs.create.mock.calls.length, 0);
    assert.equal(tabs.remove.mock.calls.length, 0);
    assert.equal(tabs.update.mock.calls.length, 0);
    const invocation = executeScript.mock.calls[0][0];
    assert.deepEqual(invocation.target, {
      tabId: 11,
      documentIds: ["onboarding-document"],
    });
    assert.equal(invocation.world, "MAIN");
    assert.equal(invocation.func, signClobAuthInPage);
    assert.equal(invocation.args[0].expectedPath, "/extension/connect");
    assert.equal(invocation.args[0].expectedOrigin, new URL(url).origin);
    assert.equal(updated.size, 0);
    assert.equal(removed.size, 0);
  }
);

test("a sidebar request still opens a dedicated signing tab when onboarding is active", async () => {
  const { tabs, executeScript } = installOnboardingTabs();
  await signClobAuthInTrustedTab({
    address,
    sourceTabId: 11,
    typedData: "typed-data",
    wallet,
  });
  assert.equal(tabs.create.mock.calls.length, 1);
  assert.deepEqual(executeScript.mock.calls[0][0].target, {
    tabId: 44,
    frameIds: [0],
  });
  assert.deepEqual(tabs.remove.mock.calls[0], [44]);
});

test("a forged onboarding permit cannot request signing in the current tab", async () => {
  const { tabs, executeScript } = installOnboardingTabs();
  await assert.rejects(
    signClobAuthInTrustedTab({
      address,
      sourceTabId: 11,
      sourceDocumentId: "onboarding-document",
      onboardingSigningPermit: "forged",
      typedData: "typed-data",
      wallet,
    }),
    /expired/
  );
  assert.equal(executeScript.mock.calls.length, 0);
  assert.equal(tabs.create.mock.calls.length, 0);
});

test("onboarding navigation before signing rejects without touching the wallet or closing the tab", async () => {
  const { tabs, executeScript, permit } = installOnboardingTabs();
  tabs.get.mockResolvedValue({
    id: 11,
    windowId: 2,
    url: "https://example.com",
    status: "complete",
  });
  await assert.rejects(
    signClobAuthInTrustedTab({
      address,
      sourceTabId: 11,
      sourceDocumentId: "onboarding-document",
      onboardingSigningPermit: permit,
      typedData: "typed-data",
      wallet,
    }),
    /page changed/
  );
  assert.equal(executeScript.mock.calls.length, 0);
  assert.equal(tabs.create.mock.calls.length, 0);
  assert.equal(tabs.remove.mock.calls.length, 0);
});

test.each(["loading", "removed"])(
  "onboarding %s during signing cancels without closing the source tab",
  async (event) => {
    const { tabs, executeScript, permit, updated, removed } =
      installOnboardingTabs();
    executeScript.mockImplementation(() => new Promise(() => {}));
    const signing = signClobAuthInTrustedTab({
      address,
      sourceTabId: 11,
      sourceDocumentId: "onboarding-document",
      onboardingSigningPermit: permit,
      typedData: "typed-data",
      wallet,
    });
    const rejected = assert.rejects(signing, /changed|cancelled/);
    await vi.waitFor(() => assert.equal(executeScript.mock.calls.length, 1));
    if (event === "loading")
      for (const listener of updated) listener(11, { status: "loading" });
    else for (const listener of removed) listener(11);
    await rejected;
    assert.equal(tabs.remove.mock.calls.length, 0);
    assert.equal(tabs.update.mock.calls.length, 0);
    assert.equal(updated.size, 0);
    assert.equal(removed.size, 0);
  }
);

test("onboarding rejects a signature result from a different browser document", async () => {
  const { tabs, executeScript, permit } = installOnboardingTabs();
  executeScript.mockResolvedValue([
    {
      frameId: 0,
      documentId: "replacement-document",
      result: `0x${"a".repeat(130)}`,
    },
  ]);
  await assert.rejects(
    signClobAuthInTrustedTab({
      address,
      sourceTabId: 11,
      sourceDocumentId: "onboarding-document",
      onboardingSigningPermit: permit,
      typedData: "typed-data",
      wallet,
    }),
    /page changed/
  );
  assert.equal(tabs.remove.mock.calls.length, 0);
});

test("a route change during account checks stops before the wallet signature request", async () => {
  vi.useFakeTimers();
  let accountReads = 0;
  const provider = {
    request: vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_accounts") {
        if (++accountReads === 2) {
          vi.stubGlobal("location", {
            origin: "https://knoww.app",
            pathname: "/different-route",
          });
        }
        return [address];
      }
      if (method === "eth_chainId") return "0x89";
      if (method === "eth_signTypedData_v4") return `0x${"a".repeat(130)}`;
      throw new Error(`Unexpected wallet request: ${method}`);
    }),
  };
  installSigningPage([{ info: wallet, provider }]);
  const rejected = assert.rejects(
    signClobAuthInPage({
      address,
      expectedOrigin: "https://knoww.app",
      expectedPath: TRUSTED_CLOB_SIGNING_PATH,
      typedData: "typed-data",
      wallet,
    }),
    /page.*changed/
  );
  await vi.advanceTimersByTimeAsync(1_500);
  await rejected;
  assert.equal(
    provider.request.mock.calls.some(
      ([request]) => request.method === "eth_signTypedData_v4"
    ),
    false
  );
});

test("background rejects a valid ClobAuth signature from a different wallet", async () => {
  const selected = privateKeyToAccount(generatePrivateKey());
  const different = privateKeyToAccount(generatePrivateKey());
  const auth = buildClobAuthRpcTypedData({ address: selected.address });
  const typedData = {
    domain: auth.typedData.domain,
    types: { ClobAuth: auth.typedData.types.ClobAuth },
    primaryType: "ClobAuth" as const,
    message: {
      ...auth.typedData.message,
      address: selected.address,
      nonce: BigInt(auth.nonce),
    },
  };
  const valid = await selected.signTypedData(typedData);
  const wrongWallet = await different.signTypedData(typedData);

  await assertClobAuthSigner(auth, valid, selected.address);
  await assert.rejects(
    assertClobAuthSigner(auth, wrongWallet, selected.address),
    /different wallet account/
  );
});

test("trusted page signs with the selected account without posting the signature to the page", async () => {
  vi.useFakeTimers();
  const selected = {
    request: vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_accounts") return [address];
      if (method === "eth_chainId") return "0x89";
      if (method === "eth_signTypedData_v4") return `0x${"a".repeat(130)}`;
      throw new Error(`Unexpected wallet request: ${method}`);
    }),
  };
  const other = { request: vi.fn() };
  const page = installSigningPage([
    { info: { name: "Phantom", rdns: "app.phantom" }, provider: other },
    { info: wallet, provider: selected },
  ]);

  const signing = signClobAuthInPage({
    address,
    expectedOrigin: "https://knoww.app",
    expectedPath: TRUSTED_CLOB_SIGNING_PATH,
    typedData: "typed-data",
    wallet,
  });
  await vi.advanceTimersByTimeAsync(1_500);
  assert.equal(await signing, `0x${"a".repeat(130)}`);
  assert.equal(other.request.mock.calls.length, 0);
  assert.equal(page.postMessage.mock.calls.length, 0);
  assert.deepEqual(selected.request.mock.calls.at(-2)?.[0], {
    method: "eth_signTypedData_v4",
    params: [address, "typed-data"],
  });
});

test("legacy MetaMask without an announced name can sign on the trusted page", async () => {
  vi.useFakeTimers();
  const provider = {
    isMetaMask: true,
    request: vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_accounts") return [address];
      if (method === "eth_chainId") return "0x89";
      if (method === "eth_signTypedData_v4") return `0x${"a".repeat(130)}`;
      throw new Error(`Unexpected wallet request: ${method}`);
    }),
  };
  const page = installSigningPage([]) as ReturnType<
    typeof installSigningPage
  > & {
    ethereum: typeof provider;
  };
  page.ethereum = provider;
  const signing = signClobAuthInPage({
    address,
    expectedOrigin: "https://knoww.app",
    expectedPath: TRUSTED_CLOB_SIGNING_PATH,
    typedData: "typed-data",
    wallet: { name: "MetaMask", rdns: "" },
  });
  await vi.advanceTimersByTimeAsync(1_500);
  assert.equal(await signing, `0x${"a".repeat(130)}`);
  assert.equal(page.postMessage.mock.calls.length, 0);
});

test("page origin mismatch stops before contacting an injected wallet", async () => {
  const provider = { request: vi.fn() };
  installSigningPage([{ info: wallet, provider }]);
  vi.stubGlobal("location", {
    origin: "https://untrusted.example",
    pathname: TRUSTED_CLOB_SIGNING_PATH,
  });
  await assert.rejects(
    signClobAuthInPage({
      address,
      expectedOrigin: "https://knoww.app",
      expectedPath: TRUSTED_CLOB_SIGNING_PATH,
      typedData: "typed-data",
      wallet,
    }),
    /page changed/
  );
  assert.equal(provider.request.mock.calls.length, 0);
});

test("account mismatch stops before requesting a ClobAuth signature", async () => {
  vi.useFakeTimers();
  const provider = {
    request: vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_accounts" || method === "eth_requestAccounts") {
        return ["0x000000000000000000000000000000000000dead"];
      }
      throw new Error(`Unexpected wallet request: ${method}`);
    }),
  };
  installSigningPage([{ info: wallet, provider }]);
  const signing = signClobAuthInPage({
    address,
    expectedOrigin: "https://knoww.app",
    expectedPath: TRUSTED_CLOB_SIGNING_PATH,
    typedData: "typed-data",
    wallet,
  });
  const rejected = assert.rejects(signing, /Select/);
  await vi.advanceTimersByTimeAsync(1_500);
  await rejected;
  assert.equal(
    provider.request.mock.calls.some(
      (call) => call[0].method === "eth_signTypedData_v4"
    ),
    false
  );
});

test("ambiguous wallet identity stops before requesting a ClobAuth signature", async () => {
  vi.useFakeTimers();
  const first = { request: vi.fn() };
  const second = { request: vi.fn() };
  installSigningPage([
    { info: wallet, provider: first },
    { info: wallet, provider: second },
  ]);
  const signing = signClobAuthInPage({
    address,
    expectedOrigin: "https://knoww.app",
    expectedPath: TRUSTED_CLOB_SIGNING_PATH,
    typedData: "typed-data",
    wallet,
  });
  const rejected = assert.rejects(signing, /Could not identify/);
  await vi.advanceTimersByTimeAsync(1_500);
  await rejected;
  assert.equal(first.request.mock.calls.length, 0);
  assert.equal(second.request.mock.calls.length, 0);
});

test("background signs only in the dedicated Knoww tab and returns to the source tab", async () => {
  const updated = new Set<TabUpdateListener>();
  const removed = new Set<TabRemoveListener>();
  const executeScript = vi.fn(async () => [
    { frameId: 0, result: `0x${"a".repeat(130)}` },
  ]);
  const tabs = {
    get: vi.fn(async (tabId: number) =>
      tabId === 11
        ? { id: 11, windowId: 2 }
        : { id: 44, url: trustedUrl, status: "complete" }
    ),
    create: vi.fn(async () => ({ id: 44 })),
    remove: vi.fn(async () => {}),
    update: vi.fn(async () => {}),
    onUpdated: {
      addListener: (listener: TabUpdateListener) => updated.add(listener),
      removeListener: (listener: TabUpdateListener) => updated.delete(listener),
    },
    onRemoved: {
      addListener: (listener: TabRemoveListener) => removed.add(listener),
      removeListener: (listener: TabRemoveListener) => removed.delete(listener),
    },
  };
  vi.stubGlobal("chrome", { tabs, scripting: { executeScript } });

  const signature = await signClobAuthInTrustedTab({
    address,
    sourceTabId: 11,
    typedData: "typed-data",
    wallet,
  });
  assert.equal(signature, `0x${"a".repeat(130)}`);
  assert.deepEqual(tabs.create.mock.calls[0][0], {
    url: trustedUrl,
    active: true,
    windowId: 2,
  });
  assert.equal(executeScript.mock.calls[0][0].world, "MAIN");
  assert.deepEqual(executeScript.mock.calls[0][0].target, {
    tabId: 44,
    frameIds: [0],
  });
  assert.equal(executeScript.mock.calls[0][0].func, signClobAuthInPage);
  assert.deepEqual(tabs.remove.mock.calls[0], [44]);
  assert.deepEqual(tabs.update.mock.calls[0], [11, { active: true }]);
  assert.equal(updated.size, 0);
  assert.equal(removed.size, 0);
});

test("background waits while the trusted URL is pending navigation", async () => {
  let onUpdated: TabUpdateListener | undefined;
  let tabLoaded = false;
  const tabs = {
    get: vi.fn(async (tabId: number) =>
      tabId === 11
        ? { id: 11, windowId: 2 }
        : tabLoaded
          ? { id: 44, url: trustedUrl, status: "complete" }
          : {
              id: 44,
              url: "about:blank",
              pendingUrl: trustedUrl,
              status: "loading",
            }
    ),
    create: vi.fn(async () => ({ id: 44 })),
    remove: vi.fn(async () => {}),
    update: vi.fn(async () => {}),
    onUpdated: {
      addListener: (listener: TabUpdateListener) => {
        onUpdated = listener;
      },
      removeListener: () => {
        onUpdated = undefined;
      },
    },
    onRemoved: { addListener: () => {}, removeListener: () => {} },
  };
  const executeScript = vi.fn(async () => [
    { frameId: 0, result: `0x${"a".repeat(130)}` },
  ]);
  vi.stubGlobal("chrome", { tabs, scripting: { executeScript } });

  const signing = signClobAuthInTrustedTab({
    address,
    sourceTabId: 11,
    typedData: "typed-data",
    wallet,
  });
  await vi.waitFor(() => assert.ok(onUpdated));
  tabLoaded = true;
  onUpdated?.(44, { status: "complete", url: trustedUrl });
  assert.equal(await signing, `0x${"a".repeat(130)}`);
  assert.equal(executeScript.mock.calls.length, 1);
});

test("navigation during wallet signing cancels the attempt and closes the trusted tab", async () => {
  let onUpdated:
    | ((tabId: number, change: { url?: string }) => void)
    | undefined;
  const tabs = {
    get: vi.fn(async (tabId: number) =>
      tabId === 11
        ? { id: 11, windowId: 2 }
        : { id: 44, url: trustedUrl, status: "complete" }
    ),
    create: vi.fn(async () => ({ id: 44 })),
    remove: vi.fn(async () => {}),
    update: vi.fn(async () => {}),
    onUpdated: {
      addListener: (listener: typeof onUpdated) => {
        onUpdated = listener;
      },
      removeListener: () => {
        onUpdated = undefined;
      },
    },
    onRemoved: {
      addListener: () => {},
      removeListener: () => {},
    },
  };
  const executeScript = vi.fn(() => new Promise(() => {}));
  vi.stubGlobal("chrome", { tabs, scripting: { executeScript } });

  const signing = signClobAuthInTrustedTab({
    address,
    sourceTabId: 11,
    typedData: "typed-data",
    wallet,
  });
  const rejected = assert.rejects(signing, /page changed/);
  await vi.waitFor(() => {
    assert.equal(executeScript.mock.calls.length, 1);
  });
  onUpdated?.(44, { url: "https://untrusted.example/" });
  await rejected;
  assert.deepEqual(tabs.remove.mock.calls[0], [44]);
  assert.deepEqual(tabs.update.mock.calls[0], [11, { active: true }]);
});
