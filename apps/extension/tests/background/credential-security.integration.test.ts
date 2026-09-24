import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

// Only unrelated telemetry is replaced. The router, session/claim checks,
// trusted signing, signer recovery, and credential store are real modules.
vi.mock("../../src/background/analytics", () => ({
  flushAnalyticsQueue: vi.fn(async () => {}),
  queueAnalyticsEvent: vi.fn(async () => {}),
  resetAnalyticsIdentity: vi.fn(async () => {}),
  submitSiteSupportRequest: vi.fn(async () => false),
}));
vi.mock("../../src/background/order-analytics", () => ({
  pollConfirmedOrders: vi.fn(async () => {}),
}));

const account = privateKeyToAccount(`0x${"1".repeat(64)}`);
const otherAccount = privateKeyToAccount(`0x${"2".repeat(64)}`);
const wallet = { name: "MetaMask", rdns: "io.metamask" };
const sourceUrl = "https://knoww.app/extension/connect";
const signingUrl = "https://knoww.app/extension-credentials.html";
const credsKey = `knoww_clob_creds_${account.address.toLowerCase()}`;
const credentials = {
  apiKey: "synthetic-api-key",
  apiSecret: "synthetic-api-secret",
  apiPassphrase: "synthetic-passphrase",
};
type Reply = { ok: boolean; error?: string; data?: Record<string, unknown> };
type MessageListener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  reply: (value: Reply) => void
) => unknown;

function event<T extends (...args: never[]) => unknown>() {
  const listeners = new Set<T>();
  return {
    listeners,
    addListener: (listener: T) => listeners.add(listener),
    removeListener: (listener: T) => listeners.delete(listener),
    emit: (...args: Parameters<T>) => {
      for (const listener of listeners) listener(...args);
    },
  };
}

function storageArea() {
  const values: Record<string, unknown> = {};
  return {
    values,
    get: vi.fn(
      async (
        key: string,
        callback?: (result: Record<string, unknown>) => void
      ) => {
        const result = { [key]: values[key] };
        callback?.(result);
        return result;
      }
    ),
    set: vi.fn(async (data: Record<string, unknown>, callback?: () => void) => {
      Object.assign(values, data);
      callback?.();
    }),
    remove: vi.fn(async (key: string, callback?: () => void) => {
      delete values[key];
      callback?.();
    }),
  };
}

function sessionToken(address = account.address, exp = Date.now() + 900_000) {
  // The worker decodes session facts from trusted storage; server HMAC
  // validation is covered by the web session tests, not this browser fixture.
  return `${btoa(JSON.stringify({ sub: address, exp }))}.synthetic-session`;
}

async function installBackground() {
  const session = storageArea();
  const local = storageArea();
  session.values.knoww_extension_access_token = sessionToken();
  const onMessage = event<MessageListener>();
  const onUpdated =
    event<(id: number, change: { status?: string; url?: string }) => void>();
  const onRemoved = event<(id: number) => void>();
  const offscreen = vi.fn(
    async (_message: unknown): Promise<Reply> => ({
      ok: true,
      data: { ...credentials, method: "derive" },
    })
  );
  const broadcasts: unknown[] = [];
  const executeScript = vi.fn(
    async (input: { args: Array<{ typedData: string }> }) => {
      const data = JSON.parse(input.args[0].typedData);
      const signature = await account.signTypedData({
        ...data,
        types: { ClobAuth: data.types.ClobAuth },
      });
      return [{ frameId: 0, documentId: "source-document", result: signature }];
    }
  );
  const tabs = {
    get: vi.fn(async (id: number) => ({
      id,
      windowId: 2,
      url: id === 11 ? sourceUrl : signingUrl,
      status: "complete",
    })),
    create: vi.fn(async () => ({ id: 44 })),
    update: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    query: vi.fn(async () => []),
    onUpdated,
    onRemoved,
    onActivated: event(),
  };
  vi.stubGlobal("__DEV_MODE__", false);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Unexpected network access in credential test");
    })
  );
  vi.stubGlobal("chrome", {
    runtime: {
      id: "knoww",
      onMessage,
      onConnect: event(),
      onInstalled: event(),
      getURL: (path: string) => `chrome-extension://knoww/${path}`,
      getContexts: vi.fn(async () => [{ contextType: "OFFSCREEN_DOCUMENT" }]),
      sendMessage: vi.fn(
        async (message: { type: string }, callback?: () => void) => {
          if (message.type === "offscreen:trading") return offscreen(message);
          broadcasts.push(message);
          callback?.();
        }
      ),
    },
    storage: { session, local, sync: storageArea(), onChanged: event() },
    tabs,
    scripting: {
      executeScript,
      getRegisteredContentScripts: vi.fn(async () => []),
      registerContentScripts: vi.fn(async () => {}),
    },
    alarms: { create: vi.fn(), onAlarm: event() },
    action: { onClicked: event(), setBadgeText: vi.fn(async () => {}) },
    windows: { onFocusChanged: event() },
  });
  await import("../../src/background");
  const sender = {
    id: "knoww",
    frameId: 0,
    documentId: "source-document",
    url: sourceUrl,
    tab: { id: 11, windowId: 2, url: sourceUrl },
  } as chrome.runtime.MessageSender;
  const send = (message: unknown, from = sender) =>
    new Promise<Reply>((resolve, reject) => {
      let handled = false;
      for (const listener of onMessage.listeners) {
        handled = listener(message, from, resolve) === true || handled;
      }
      if (!handled) reject(new Error("Message was not handled"));
    });
  const claim = async () => {
    const result = await send({ type: "creds:derive-begin", key: credsKey });
    expect(result.ok).toBe(true);
    expect(result.data?.status).toBe("claimed");
    return result.data?.token as string;
  };
  const request = (
    claimToken: string,
    extra: Record<string, unknown> = {}
  ) => ({
    type: "trading:derive-credentials-trusted",
    address: account.address,
    wallet,
    claimToken,
    ...extra,
  });
  const expectNoCredentials = () => {
    expect(session.values[credsKey]).toBeUndefined();
    expect(offscreen).not.toHaveBeenCalled();
  };
  return {
    session,
    local,
    offscreen,
    executeScript,
    tabs,
    broadcasts,
    sender,
    send,
    claim,
    request,
    expectNoCredentials,
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("routes a real test signature to offscreen and returns only the method", async () => {
  const h = await installBackground();
  const result = await h.send(h.request(await h.claim()));
  expect(result).toEqual({ ok: true, data: { method: "derive" } });
  expect(h.offscreen).toHaveBeenCalledOnce();
  expect(h.session.values[credsKey]).toEqual(credentials);
  for (const secret of Object.values(credentials)) {
    expect(
      JSON.stringify([result, h.broadcasts, h.local.values])
    ).not.toContain(secret);
  }
  expect(h.tabs.create).toHaveBeenCalledOnce();
  expect(h.tabs.remove).toHaveBeenCalledWith(44);
  expect(await h.send({ type: "creds:has", key: credsKey })).toEqual({
    ok: true,
    data: { hasCredentials: true },
  });
});

it.each([
  ["external extension", { id: "untrusted" }],
  ["missing extension identity", { id: undefined }],
  ["subframe", { frameId: 2 }],
  ["no tab", { tab: undefined }],
  ["different tab", { tab: { id: 12 } }],
])(
  "rejects %s before signing or credential creation",
  async (_label, override) => {
    const h = await installBackground();
    const result = await h.send(h.request(await h.claim()), {
      ...h.sender,
      ...override,
    } as chrome.runtime.MessageSender);
    expect(result).toEqual({
      ok: false,
      error: "Invalid credential setup request.",
    });
    expect(h.executeScript).not.toHaveBeenCalled();
    h.expectNoCredentials();
  }
);

it.each(["forged", "expired", "released"])(
  "rejects a %s derivation claim",
  async (kind) => {
    const h = await installBackground();
    const token = await h.claim();
    if (kind === "expired") vi.setSystemTime(Date.now() + 86_400_001);
    if (kind === "released")
      await h.send({ type: "creds:derive-end", key: credsKey, token });
    expect(
      await h.send(h.request(kind === "forged" ? "forged" : token))
    ).toEqual({ ok: false, error: "Invalid credential setup request." });
    expect(h.executeScript).not.toHaveBeenCalled();
    h.expectNoCredentials();
  }
);

it.each(["missing", "expired", "malformed", "wrong-wallet"])(
  "rejects a %s session before signing",
  async (kind) => {
    const h = await installBackground();
    h.session.values.knoww_extension_access_token = {
      missing: undefined,
      expired: sessionToken(account.address, Date.now() - 1),
      malformed: "not-a-session",
      "wrong-wallet": sessionToken(otherAccount.address),
    }[kind];
    expect(await h.send(h.request(await h.claim()))).toEqual({
      ok: false,
      error: "Sign in with the selected wallet and retry.",
    });
    expect(h.executeScript).not.toHaveBeenCalled();
    h.expectNoCredentials();
    h.session.values.knoww_extension_access_token = sessionToken();
    expect((await h.send(h.request(await h.claim()))).ok).toBe(true);
  }
);

it.each(["session-expired", "account-changed", "claim-released"])(
  "rechecks %s after wallet signing",
  async (kind) => {
    const h = await installBackground();
    const token = await h.claim();
    const sign = h.executeScript.getMockImplementation();
    h.executeScript.mockImplementationOnce(async (input) => {
      const result = await sign?.(input);
      if (kind === "session-expired")
        h.session.values.knoww_extension_access_token = sessionToken(
          account.address,
          Date.now() - 1
        );
      if (kind === "account-changed")
        h.session.values.knoww_extension_access_token = sessionToken(
          otherAccount.address
        );
      if (kind === "claim-released")
        await h.send({ type: "creds:derive-end", key: credsKey, token });
      return result ?? [];
    });
    expect((await h.send(h.request(token))).ok).toBe(false);
    h.expectNoCredentials();
  }
);

it.each([
  "wallet-rejected",
  "malformed-signature",
  "wrong-signer",
  "credential-api-failure",
])("cleans up after %s and permits a successful retry", async (kind) => {
  const h = await installBackground();
  if (kind === "wallet-rejected")
    h.executeScript.mockRejectedValueOnce(
      new Error("User rejected the request.")
    );
  if (kind === "malformed-signature")
    h.executeScript.mockResolvedValueOnce([
      { frameId: 0, documentId: "source-document", result: "0x1234" },
    ]);
  if (kind === "wrong-signer")
    h.executeScript.mockImplementationOnce(async (input) => {
      const data = JSON.parse(input.args[0].typedData);
      return [
        {
          frameId: 0,
          documentId: "source-document",
          result: await otherAccount.signTypedData({
            ...data,
            types: { ClobAuth: data.types.ClobAuth },
          }),
        },
      ];
    });
  if (kind === "credential-api-failure")
    h.offscreen.mockResolvedValueOnce({
      ok: false,
      error: "Credential creation unavailable",
    });
  const failed = await h.send(h.request(await h.claim()));
  expect(failed.ok).toBe(false);
  expect(h.session.values[credsKey]).toBeUndefined();
  expect(h.offscreen).toHaveBeenCalledTimes(
    kind === "credential-api-failure" ? 1 : 0
  );
  expect(h.tabs.remove).toHaveBeenCalledWith(44);
  expect((await h.send(h.request(await h.claim()))).ok).toBe(true);
});

it("times out signing, ignores its late result, and permits a fresh attempt", async () => {
  const h = await installBackground();
  let complete:
    | ((
        result: Array<{ frameId: number; documentId: string; result: string }>
      ) => void)
    | undefined;
  h.executeScript.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      })
  );
  const attempt = h.send(h.request(await h.claim()));
  await vi.advanceTimersByTimeAsync(180_001);
  expect(await attempt).toMatchObject({
    ok: false,
    error: expect.stringMatching(/timed out/),
  });
  complete?.([
    {
      frameId: 0,
      documentId: "source-document",
      result: `0x${"a".repeat(130)}`,
    },
  ]);
  await vi.advanceTimersByTimeAsync(0);
  h.expectNoCredentials();
  expect((await h.send(h.request(await h.claim()))).ok).toBe(true);
});

it("coalesces duplicate requests and rejects replay after completion", async () => {
  const h = await installBackground();
  const token = await h.claim();
  const request = h.request(token);
  const responses = await Promise.all([h.send(request), h.send(request)]);
  expect(responses).toEqual([
    { ok: true, data: { method: "derive" } },
    { ok: true, data: { method: "derive" } },
  ]);
  expect(h.executeScript).toHaveBeenCalledOnce();
  expect(h.offscreen).toHaveBeenCalledOnce();
  expect((await h.send(request)).ok).toBe(false);
  expect(h.offscreen).toHaveBeenCalledOnce();
});

it.each([
  { address: "not-an-address" },
  { wallet: null },
  { wallet: { name: "", rdns: "io.metamask" } },
  { wallet: { name: "MetaMask", rdns: "x".repeat(256) } },
  { claimToken: undefined },
  { address: otherAccount.address },
])(
  "rejects invalid request data %j before contacting the wallet",
  async (override) => {
    const h = await installBackground();
    expect((await h.send(h.request(await h.claim(), override))).ok).toBe(false);
    expect(h.executeScript).not.toHaveBeenCalled();
    h.expectNoCredentials();
  }
);

async function onboardingPermit(
  h: Awaited<ReturnType<typeof installBackground>>,
  tabId = 11
) {
  const { issueOnboardingClobSigningPermit } = await import(
    "../../src/background/onboarding-clob-signing"
  );
  const permit = issueOnboardingClobSigningPermit(
    {
      ...h.sender,
      frameId: 2,
      url: "chrome-extension://knoww/onboarding.html?embedded=1",
      tab: { ...h.sender.tab, id: tabId } as chrome.tabs.Tab,
    },
    account.address
  );
  expect(permit).toBeTypeOf("string");
  return permit;
}

it("onboarding uses a real permit to sign in its bound document without opening a tab", async () => {
  const h = await installBackground();
  const onboardingSigningPermit = await onboardingPermit(h);
  const result = await h.send(
    h.request(await h.claim(), { onboardingSigningPermit })
  );
  expect(result).toEqual({ ok: true, data: { method: "derive" } });
  expect(h.executeScript).toHaveBeenCalledWith(
    expect.objectContaining({
      target: { tabId: 11, documentIds: ["source-document"] },
      world: "MAIN",
    })
  );
  expect(h.tabs.create).not.toHaveBeenCalled();
  expect(h.tabs.remove).not.toHaveBeenCalled();
});

it.each(["forged", "expired", "wrong-tab", "reused"])(
  "blocks a %s onboarding permit through the router",
  async (kind) => {
    const h = await installBackground();
    const permit = await onboardingPermit(h, kind === "wrong-tab" ? 12 : 11);
    if (kind === "expired") vi.setSystemTime(Date.now() + 240_001);
    if (kind === "reused") {
      h.executeScript.mockRejectedValueOnce(
        new Error("User rejected the request.")
      );
      expect(
        (
          await h.send(
            h.request(await h.claim(), { onboardingSigningPermit: permit })
          )
        ).ok
      ).toBe(false);
      h.executeScript.mockClear();
    }
    const result = await h.send(
      h.request(await h.claim(), {
        onboardingSigningPermit: kind === "forged" ? "forged" : permit,
      })
    );
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringMatching(/expired/),
    });
    expect(h.executeScript).not.toHaveBeenCalled();
    expect(h.tabs.create).not.toHaveBeenCalled();
    h.expectNoCredentials();
  }
);

it.each([
  "source-navigation",
  "signing-navigation",
  "tab-closed",
  "wrong-document",
])("blocks %s during signing and releases the claim", async (kind) => {
  const h = await installBackground();
  const permit = await onboardingPermit(h);
  const sign = h.executeScript.getMockImplementation();
  h.executeScript.mockImplementationOnce(async (input) => {
    const result = await sign?.(input);
    if (kind === "source-navigation")
      h.tabs.onUpdated.emit(11, { status: "loading" });
    if (kind === "signing-navigation")
      h.tabs.onUpdated.emit(11, { url: "https://untrusted.example/" });
    if (kind === "tab-closed") h.tabs.onRemoved.emit(11);
    return (result ?? []).map((entry) => ({
      ...entry,
      documentId:
        kind === "wrong-document" ? "replacement-document" : entry.documentId,
    }));
  });
  expect(
    (
      await h.send(
        h.request(await h.claim(), { onboardingSigningPermit: permit })
      )
    ).ok
  ).toBe(false);
  h.expectNoCredentials();
  expect(h.tabs.remove).not.toHaveBeenCalled();
  expect(
    await h.send({ type: "creds:derive-status", key: credsKey })
  ).toMatchObject({ data: { status: "idle" } });
});

it.each([
  "creds:has",
  "creds:derive-begin",
  "creds:derive-status",
  "creds:remove",
])("%s cannot access the bearer-token storage namespace", async (type) => {
  const h = await installBackground();
  const token = h.session.values.knoww_extension_access_token;
  const response = await h.send({ type, key: "knoww_extension_access_token" });
  expect(response).toMatchObject({
    ok: false,
    error: expect.stringMatching(/namespace/),
  });
  expect(h.session.values.knoww_extension_access_token).toBe(token);
  expect(JSON.stringify(response)).not.toContain(token);
});

it("ignores late credential creation after the overall request times out", async () => {
  const h = await installBackground();
  let complete: ((value: Reply) => void) | undefined;
  h.offscreen.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      })
  );
  const attempt = h.send(h.request(await h.claim()));
  await vi.advanceTimersByTimeAsync(230_001);
  expect(await attempt).toMatchObject({
    ok: false,
    error: expect.stringMatching(/timed out/),
  });
  complete?.({ ok: true, data: { ...credentials, method: "create" } });
  await vi.advanceTimersByTimeAsync(0);
  expect(h.session.values[credsKey]).toBeUndefined();
  expect(h.broadcasts).toEqual([]);
  expect((await h.send(h.request(await h.claim()))).ok).toBe(true);
});

it.each(["expired-session", "account-changed", "replaced-claim"])(
  "does not store an offscreen result after %s",
  async (kind) => {
    const h = await installBackground();
    const token = await h.claim();
    h.offscreen.mockImplementationOnce(async () => {
      if (kind === "expired-session")
        h.session.values.knoww_extension_access_token = sessionToken(
          account.address,
          Date.now() - 1
        );
      else if (kind === "account-changed")
        h.session.values.knoww_extension_access_token = sessionToken(
          otherAccount.address
        );
      else {
        await h.send({ type: "creds:derive-end", key: credsKey, token });
        await h.claim();
      }
      return { ok: true, data: { ...credentials, method: "create" } };
    });
    expect(await h.send(h.request(token))).toEqual({
      ok: false,
      error: "Trading credential setup expired. Try again.",
    });
    expect(h.session.values[credsKey]).toBeUndefined();
    expect(h.broadcasts).toEqual([]);
    if (kind === "replaced-claim") {
      expect(
        await h.send({ type: "creds:derive-status", key: credsKey })
      ).toMatchObject({ data: { status: "busy" } });
    }
  }
);

it("rejects incomplete credential responses without exposing partial secrets and permits a retry", async () => {
  const h = await installBackground();
  h.offscreen.mockResolvedValueOnce({
    ok: true,
    data: { apiKey: credentials.apiKey, apiSecret: credentials.apiSecret },
  });
  const result = await h.send(h.request(await h.claim()));
  expect(result).toEqual({
    ok: false,
    error: "Invalid trading credential response. Try again.",
  });
  expect(h.session.values[credsKey]).toBeUndefined();
  expect(h.broadcasts).toEqual([]);
  expect(JSON.stringify(result)).not.toContain(credentials.apiSecret);
  expect((await h.send(h.request(await h.claim()))).ok).toBe(true);
});
