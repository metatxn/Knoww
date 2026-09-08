import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ info: vi.fn() }));
vi.mock("../../src/background/extension-session", () => ({
  getKnowwAppUrl: () => "https://knoww.app",
  getExtensionSessionInfo: mocks.info,
}));
const address = "0x1111111111111111111111111111111111111111";
const request = {
  type: "auth:open-sign-in",
  address,
  wallet: { rdns: "app.phantom", name: "Phantom" },
};
const source = {
  id: "extension",
  frameId: 0,
  url: "https://x.com/",
  tab: { id: 1, windowId: 1, url: "https://x.com/" },
} as chrome.runtime.MessageSender;
function event() {
  return { addListener: vi.fn(), removeListener: vi.fn() };
}
const tabs = {
  create: vi.fn(),
  remove: vi.fn(),
  update: vi.fn(),
  onRemoved: event(),
  onUpdated: event(),
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("chrome", { runtime: { id: "extension" }, tabs });
  tabs.create.mockResolvedValue({ id: 2 });
  tabs.remove.mockResolvedValue(undefined);
  tabs.update.mockResolvedValue(undefined);
  mocks.info.mockResolvedValue({ loggedIn: true, address });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.clearAllMocks();
});

async function start() {
  const api = await import("../../src/background/session-sign-in");
  const reply = vi.fn();
  api.handleSessionSignInMessage(request, source, reply);
  await Promise.resolve();
  const url = tabs.create.mock.calls[0][0].url as string;
  const requestId = url.split("#knoww-sign-in=")[1];
  const target = {
    id: "extension",
    frameId: 0,
    url,
    tab: { id: 2, url },
  } as chrome.runtime.MessageSender;
  return { api, reply, url, requestId, target };
}

it("opens only Knoww and returns the session to the original tab after sign-in", async () => {
  const { api, reply, url, requestId, target } = await start();
  expect(
    url.startsWith("https://knoww.app/extension/connect#knoww-sign-in=")
  ).toBe(true);
  const details = vi.fn();
  api.handleSessionSignInMessage(
    { type: "auth:sign-in-details", requestId },
    target,
    details
  );
  expect(details).toHaveBeenCalledWith({
    ok: true,
    data: { address, wallet: request.wallet },
  });
  api.handleSessionSignInMessage(
    { type: "auth:sign-in-complete", requestId },
    target,
    vi.fn()
  );
  await vi.advanceTimersByTimeAsync(0);
  expect(reply).toHaveBeenCalledWith({
    ok: true,
    data: { loggedIn: true, address },
  });
  expect(tabs.remove).toHaveBeenCalledWith(2);
  expect(tabs.update).toHaveBeenCalledWith(1, { active: true });
  expect(vi.getTimerCount()).toBe(0);
  expect(tabs.onRemoved.removeListener).toHaveBeenCalled();
});

it("rejects another tab, frame, origin, or request id attempting to complete sign-in", async () => {
  const { api, target, requestId, reply } = await start();
  for (const sender of [
    source,
    { ...target, frameId: 1 },
    { ...target, url: "https://x.com" },
    { ...target, id: "other" },
  ]) {
    const response = vi.fn();
    api.handleSessionSignInMessage(
      { type: "auth:sign-in-complete", requestId },
      sender,
      response
    );
    expect(response.mock.calls[0][0].ok).toBe(false);
  }
  const response = vi.fn();
  api.handleSessionSignInMessage(
    { type: "auth:sign-in-complete", requestId: "wrong" },
    target,
    response
  );
  expect(response.mock.calls[0][0].ok).toBe(false);
  expect(reply).not.toHaveBeenCalled();
  api.cancelSessionSignIn();
});

it("coalesces the same wallet but rejects a competing account", async () => {
  const { api } = await start();
  const second = vi.fn();
  api.handleSessionSignInMessage(request, source, second);
  const other = vi.fn();
  api.handleSessionSignInMessage(
    { ...request, address: `0x${"2".repeat(40)}` },
    source,
    other
  );
  expect(other.mock.calls[0][0].ok).toBe(false);
  expect(tabs.create).toHaveBeenCalledTimes(1);
  api.cancelSessionSignIn();
  await vi.advanceTimersByTimeAsync(0);
  expect(second.mock.calls[0][0].ok).toBe(false);
});

it.each(["timeout", "closed", "navigated", "logout"])(
  "settles and cleans up when sign-in is %s",
  async (reason) => {
    const { api, reply, target } = await start();
    if (reason === "timeout") await vi.advanceTimersByTimeAsync(180_000);
    if (reason === "closed") tabs.onRemoved.addListener.mock.calls[0][0](2);
    if (reason === "navigated")
      tabs.onUpdated.addListener.mock.calls[0][0](2, { url: "https://x.com" });
    if (reason === "logout") api.cancelSessionSignIn();
    await vi.advanceTimersByTimeAsync(0);
    expect(reply.mock.calls[0][0].ok).toBe(false);
    expect(api.isSessionSignInSender(target)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  }
);

it("does not report success when the session account differs", async () => {
  const { api, target, reply, requestId } = await start();
  mocks.info.mockResolvedValue({
    loggedIn: true,
    address: `0x${"2".repeat(40)}`,
  });
  api.handleSessionSignInMessage(
    { type: "auth:sign-in-complete", requestId },
    target,
    vi.fn()
  );
  await vi.advanceTimersByTimeAsync(0);
  expect(reply.mock.calls[0][0].ok).toBe(false);
});

it("cleans up even if the source response channel has closed", async () => {
  const { api, reply } = await start();
  reply.mockImplementation(() => {
    throw new Error("Disconnected port");
  });
  api.cancelSessionSignIn();
  await vi.advanceTimersByTimeAsync(0);
  expect(tabs.remove).toHaveBeenCalledWith(2);
  expect(vi.getTimerCount()).toBe(0);
});

it("rejects invalid addresses and wallet metadata before opening a tab", async () => {
  const api = await import("../../src/background/session-sign-in");
  for (const value of [
    { ...request, address: "invalid" },
    { ...request, wallet: { name: "Phantom" } },
  ]) {
    const reply = vi.fn();
    api.handleSessionSignInMessage(value, source, reply);
    expect(reply.mock.calls[0][0].ok).toBe(false);
  }
  expect(tabs.create).not.toHaveBeenCalled();
});
