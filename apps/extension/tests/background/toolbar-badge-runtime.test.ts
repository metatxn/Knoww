import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installToolbarBadge } from "../../src/background/toolbar-badge";

function event() {
  const addListener = vi.fn();
  return {
    addListener,
    emit: (...args: unknown[]) =>
      addListener.mock.calls.forEach(([listener]) => {
        listener(...args);
      }),
  };
}

const url = "https://x.com/home";
let api: ReturnType<typeof setup>;
function setup() {
  return {
    action: {
      setBadgeText: vi.fn().mockResolvedValue(undefined),
      setBadgeBackgroundColor: vi.fn().mockResolvedValue(undefined),
      setBadgeTextColor: vi.fn().mockResolvedValue(undefined),
    },
    tabs: {
      get: vi.fn().mockResolvedValue({ id: 1, url, status: "complete" }),
      onUpdated: event(),
      onRemoved: event(),
    },
    runtime: {
      id: "test",
      getURL: (path: string) => `chrome-extension://test/${path}`,
      onMessage: event(),
      onConnect: event(),
    },
  };
}
function send(patch: Record<string, unknown> = {}, senderPatch = {}) {
  api.runtime.onMessage.emit(
    {
      type: "KNOWW_TOOLBAR_BADGE",
      kind: "matches",
      pageUrl: url,
      count: 3,
      floatingOpen: false,
      ...patch,
    },
    { id: "test", frameId: 0, tab: { id: 1 }, ...senderPatch }
  );
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
beforeEach(() => {
  api = setup();
  vi.stubGlobal("chrome", api);
  installToolbarBadge();
});
afterEach(() => vi.unstubAllGlobals());

describe("toolbar badge browser events", () => {
  it("sets a red badge on the sender's tab", async () => {
    send({ count: 120 });
    await flush();
    expect(api.action.setBadgeText).toHaveBeenLastCalledWith({
      tabId: 1,
      text: "99+",
    });
    expect(api.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
      tabId: 1,
      color: "#DC2626",
    });
  });
  it.each(["https://example.org/", "https://mail.zoho.com/"])(
    "rejects counts on %s",
    async (pageUrl) => {
      api.tabs.get.mockResolvedValue({
        id: 1,
        url: pageUrl,
        status: "complete",
      });
      send({ pageUrl });
      await flush();
      expect(api.action.setBadgeText).not.toHaveBeenCalled();
    }
  );
  it("rejects frames, external senders, malformed counts and stale URLs", async () => {
    send({}, { frameId: 1 });
    send({}, { id: "other" });
    send({ count: -1 });
    send({ count: "3" });
    send({ pageUrl: "https://x.com/previous" });
    await flush();
    expect(api.action.setBadgeText).not.toHaveBeenCalled();
  });
  it.each(["navigation", "floating panel"])(
    "discards a count pending before %s clears it",
    async (reason) => {
      let release!: (tab: object) => void;
      api.tabs.get.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          })
      );
      send();
      await flush();
      if (reason === "navigation")
        api.tabs.onUpdated.emit(1, { status: "loading" });
      else send({ kind: "clear" });
      release({ id: 1, url, status: "complete" });
      await flush();
      expect(api.action.setBadgeText.mock.calls).toEqual([
        [{ tabId: 1, text: "" }],
      ]);
    }
  );
  it("tracks a trusted side panel across tabs and clears without restoring on disconnect", async () => {
    const port = {
      name: "knoww-sidepanel-badge",
      sender: { id: "test", url: "chrome-extension://test/sidepanel.html" },
      onMessage: event(),
      onDisconnect: event(),
    };
    api.runtime.onConnect.emit(port);
    port.onMessage.emit({ tabId: 1, open: true });
    send();
    await flush();
    expect(api.action.setBadgeText).toHaveBeenLastCalledWith({
      tabId: 1,
      text: "",
    });
    port.onMessage.emit({ tabId: 2, open: true });
    send();
    await flush();
    expect(api.action.setBadgeText).toHaveBeenLastCalledWith({
      tabId: 1,
      text: "3",
    });
    api.action.setBadgeText.mockClear();
    port.onDisconnect.emit();
    await flush();
    expect(api.action.setBadgeText).not.toHaveBeenCalled();
  });
});
