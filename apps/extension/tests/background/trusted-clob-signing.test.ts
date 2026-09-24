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
const otherAddress = "0x000000000000000000000000000000000000dead";
const accountPermissions = (accounts: string[]) => [
  {
    parentCapability: "eth_accounts",
    caveats: [{ type: "restrictReturnedAccounts", value: accounts }],
  },
];
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

async function expectPageFailure(
  result: ReturnType<typeof signClobAuthInPage>,
  message: RegExp
) {
  const response = await result;
  assert.equal(typeof response, "object");
  assert.match((response as { error: string }).error, message);
}

async function signWithProvider(request: ReturnType<typeof vi.fn>) {
  vi.useFakeTimers();
  installSigningPage([{ info: wallet, provider: { request } }]);
  const signing = signClobAuthInPage({
    address,
    expectedOrigin: "https://knoww.app",
    expectedPath: TRUSTED_CLOB_SIGNING_PATH,
    typedData: "typed-data",
    wallet,
  });
  await vi.advanceTimersByTimeAsync(1_500);
  return signing;
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
  const rejected = expectPageFailure(
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

test.each([wallet, { name: "Phantom", rdns: "app.phantom" }])(
  "trusted page selects $name without posting the signature to the page",
  async (selectedWallet) => {
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
      {
        info:
          selectedWallet.rdns === "io.metamask"
            ? { name: "Phantom", rdns: "app.phantom" }
            : wallet,
        provider: other,
      },
      { info: selectedWallet, provider: selected },
    ]);

    const signing = signClobAuthInPage({
      address,
      expectedOrigin: "https://knoww.app",
      expectedPath: TRUSTED_CLOB_SIGNING_PATH,
      typedData: "typed-data",
      wallet: selectedWallet,
    });
    await vi.advanceTimersByTimeAsync(1_500);
    assert.equal(await signing, `0x${"a".repeat(130)}`);
    assert.equal(other.request.mock.calls.length, 0);
    assert.equal(page.postMessage.mock.calls.length, 0);
    assert.deepEqual(selected.request.mock.calls.at(-2)?.[0], {
      method: "eth_signTypedData_v4",
      params: [address, "typed-data"],
    });
  }
);

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

test.each([true, false])(
  "signs with the requested MetaMask account while another is active (already permitted: %s)",
  async (alreadyPermitted) => {
    vi.useFakeTimers();
    let permitted = alreadyPermitted;
    const provider = {
      request: vi.fn(async ({ method }: { method: string }) => {
        if (method === "eth_accounts" || method === "eth_requestAccounts")
          return [otherAddress];
        if (method === "wallet_getPermissions")
          return accountPermissions(
            permitted ? [address, otherAddress] : [otherAddress]
          );
        if (method === "wallet_requestPermissions") {
          permitted = true;
          return accountPermissions([address]);
        }
        if (method === "eth_chainId") return "0x89";
        if (method === "eth_signTypedData_v4") return `0x${"a".repeat(130)}`;
        throw new Error(`Unexpected wallet request: ${method}`);
      }),
    };
    const page = installSigningPage([{ info: wallet, provider }]);
    const signing = signClobAuthInPage({
      address,
      expectedOrigin: "https://knoww.app",
      expectedPath: TRUSTED_CLOB_SIGNING_PATH,
      typedData: "typed-data",
      wallet,
    });
    await vi.advanceTimersByTimeAsync(1_500);
    assert.equal(await signing, `0x${"a".repeat(130)}`);
    const requests = provider.request.mock.calls.map(([request]) => request);
    assert.deepEqual(
      requests.filter(({ method }) => method === "wallet_requestPermissions"),
      alreadyPermitted
        ? []
        : [
            {
              method: "wallet_requestPermissions",
              params: [{ eth_accounts: {} }],
            },
          ]
    );
    assert.deepEqual(
      requests.filter(({ method }) => method === "eth_signTypedData_v4"),
      [{ method: "eth_signTypedData_v4", params: [address, "typed-data"] }]
    );
    assert.equal(
      requests.some(({ method }) => method === "eth_requestAccounts"),
      false
    );
    assert.equal(page.postMessage.mock.calls.length, 0);
  }
);

test.each([
  ["wallet_getPermissions", 4200],
  ["wallet_getPermissions", -32601],
  ["wallet_requestPermissions", 4200],
  ["wallet_requestPermissions", -32601],
])("connects once when %s is unsupported (%s)", async (unsupported, code) => {
  let connected = false;
  const request = vi.fn(async ({ method }: { method: string }) => {
    if (method === unsupported) throw { code };
    if (method === "eth_accounts") return connected ? [address] : [];
    if (method === "wallet_getPermissions") return [];
    if (method === "eth_requestAccounts") {
      connected = true;
      return [address];
    }
    if (method === "eth_chainId") return "0x89";
    if (method === "eth_signTypedData_v4") return `0x${"a".repeat(130)}`;
    throw new Error(`Unexpected wallet request: ${method}`);
  });
  assert.equal(await signWithProvider(request), `0x${"a".repeat(130)}`);
  assert.equal(
    request.mock.calls.filter(([call]) => call.method === "eth_requestAccounts")
      .length,
    1
  );
});

test.each([
  [4001, "User rejected the request."],
  [-32002, "A wallet request is already pending. Open MetaMask to continue."],
  [-32603, "Could not connect to your wallet. Open MetaMask and try again."],
])(
  "does not open a second prompt after a permission request fails (%s)",
  async (code, error) => {
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_accounts") return [otherAddress];
      if (method === "wallet_getPermissions") return [];
      if (method === "wallet_requestPermissions")
        throw { code, message: "Private provider diagnostics" };
      throw new Error(`Unexpected wallet request: ${method}`);
    });
    assert.deepEqual(await signWithProvider(request), { error });
    assert.deepEqual(
      request.mock.calls.map(([call]) => call.method),
      ["eth_accounts", "wallet_getPermissions", "wallet_requestPermissions"]
    );
  }
);

test.each([
  { name: "missing caveats", grant: [{ parentCapability: "eth_accounts" }] },
  {
    name: "missing account restriction",
    grant: [{ parentCapability: "eth_accounts", caveats: [] }],
  },
  {
    name: "wrong capability",
    grant: [
      { ...accountPermissions([address])[0], parentCapability: "eth_sign" },
    ],
  },
  {
    name: "conflicting restrictions",
    grant: [
      {
        parentCapability: "eth_accounts",
        caveats: [
          ...accountPermissions([address])[0].caveats,
          ...accountPermissions([otherAddress])[0].caveats,
        ],
      },
    ],
  },
])("rejects an account grant with $name before signing", async ({ grant }) => {
  const request = vi.fn(async ({ method }: { method: string }) => {
    if (method === "eth_accounts") return [otherAddress];
    if (
      method === "wallet_getPermissions" ||
      method === "wallet_requestPermissions"
    )
      return grant;
    throw new Error(`Unexpected wallet request: ${method}`);
  });
  assert.deepEqual(await signWithProvider(request), {
    error: `Select ${address} in MetaMask's connection prompt for https://knoww.app, then retry.`,
  });
  assert.equal(
    request.mock.calls.some(([call]) => call.method === "eth_signTypedData_v4"),
    false
  );
});

test.each(["eth_chainId", "eth_signTypedData_v4"])(
  "rejects a permission revoked during %s without prompting again",
  async (revokeDuring) => {
    let permitted = true;
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === revokeDuring) permitted = false;
      if (method === "eth_accounts") return [otherAddress];
      if (method === "wallet_getPermissions")
        return accountPermissions(permitted ? [address] : [otherAddress]);
      if (method === "eth_chainId") return "0x89";
      if (method === "eth_signTypedData_v4") return `0x${"a".repeat(130)}`;
      throw new Error(`Unexpected wallet request: ${method}`);
    });
    const result = await signWithProvider(request);
    assert.equal(typeof result, "object");
    assert.match((result as { error: string }).error, /account changed/);
    assert.equal(
      request.mock.calls.filter(
        ([call]) => call.method === "eth_signTypedData_v4"
      ).length,
      revokeDuring === "eth_chainId" ? 0 : 1
    );
    assert.equal(
      request.mock.calls.some(
        ([call]) =>
          call.method === "wallet_requestPermissions" ||
          call.method === "eth_requestAccounts"
      ),
      false
    );
  }
);

test("navigation while reading permissions stops before a wallet prompt", async () => {
  const request = vi.fn(async ({ method }: { method: string }) => {
    if (method === "eth_accounts") return [];
    if (method === "wallet_getPermissions") {
      vi.stubGlobal("location", {
        origin: "https://knoww.app",
        pathname: "/different-route",
      });
      return [];
    }
    throw new Error(`Unexpected wallet request: ${method}`);
  });
  assert.deepEqual(await signWithProvider(request), {
    error: "The Knoww signing page changed. Try again.",
  });
  assert.deepEqual(
    request.mock.calls.map(([call]) => call.method),
    ["eth_accounts", "wallet_getPermissions"]
  );
});

test.each([
  [4001, "User rejected the request."],
  [-32002, "A wallet request is already pending. Open MetaMask to continue."],
  [4902, "Add the Polygon network in MetaMask, then try again."],
  [-32603, "Could not connect to your wallet. Open MetaMask and try again."],
])(
  "preserves a safe wallet failure through Chrome's injection result: %s",
  async (code, message) => {
    vi.useFakeTimers();
    const provider = {
      request: vi.fn(async () => {
        throw Object.assign(
          new Error("Private provider diagnostics that must not reach the UI"),
          { code }
        );
      }),
    };
    installSigningPage([{ info: wallet, provider }]);
    const { executeScript } = installOnboardingTabs();
    // Chrome resolves an injected-function rejection with a null result.
    // The injected function must return its safe failure as serializable data.
    executeScript.mockImplementation(async (invocation) => [
      {
        frameId: 0,
        documentId: "signing-document",
        result: await invocation.func(invocation.args[0]).catch(() => null),
      },
    ]);
    const signing = signClobAuthInTrustedTab({
      address,
      sourceTabId: 11,
      typedData: "typed-data",
      wallet,
    });
    const rejected = assert.rejects(signing, { message });
    await vi.advanceTimersByTimeAsync(1_500);
    await rejected;
  }
);

test("page origin mismatch stops before contacting an injected wallet", async () => {
  const provider = { request: vi.fn() };
  installSigningPage([{ info: wallet, provider }]);
  vi.stubGlobal("location", {
    origin: "https://untrusted.example",
    pathname: TRUSTED_CLOB_SIGNING_PATH,
  });
  await expectPageFailure(
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
      if (
        method === "wallet_getPermissions" ||
        method === "wallet_requestPermissions"
      )
        return accountPermissions([otherAddress]);
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
  const rejected = expectPageFailure(signing, /Select/);
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
  const rejected = expectPageFailure(signing, /Could not identify/);
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
