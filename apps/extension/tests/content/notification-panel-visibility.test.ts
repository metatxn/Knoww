// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let ui: typeof import("../../src/content/ui/notifications");
let badge: typeof import("../../src/content/toolbar-badge");
let send: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  document.body.innerHTML = "";
  send = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("chrome", {
    runtime: { sendMessage: send },
    storage: { local: { get: vi.fn((_key, callback) => callback({})) } },
  });
  window.KNOWW_UTILS = { log: vi.fn() } as unknown as typeof window.KNOWW_UTILS;
  window.KNOWW_CONFIG = {
    isNotificationStackEnabled: () => false,
  } as typeof window.KNOWW_CONFIG;
  ui = await import("../../src/content/ui/notifications");
  badge = await import("../../src/content/toolbar-badge");
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("notification panel automatic visibility", () => {
  it("keeps a disabled panel unmounted when market updates arrive, allowing a badge", () => {
    expect(() => ui.updateNotificationStack([])).not.toThrow();
    expect(document.getElementById("knoww-notification-stack")).toBeNull();
    const url = window.location.href;
    badge.recordToolbarMatches([{ id: "a" }, { id: "b" }, { id: "c" }], url);
    badge.finishToolbarMatchRun(url);
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: "matches",
        count: 3,
        floatingOpen: false,
      })
    );
  });
  it("does not bypass the setting when another caller initializes the panel", async () => {
    ui.initNotificationStack();
    await vi.advanceTimersByTimeAsync(0);
    expect(document.getElementById("knoww-notification-stack")).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });
  it("still opens on a toolbar action with automatic display disabled", () => {
    const url = window.location.href;
    const previous = Array.from({ length: 10 }, (_, id) => ({
      id: String(id),
    }));
    badge.recordToolbarMatches(previous, url);
    badge.finishToolbarMatchRun(url);
    const respond = vi.fn();
    ui.handleNotificationMessage({ type: "KNOWW_OPEN_EXTENSION" }, respond);
    expect(document.getElementById("knoww-notification-stack")).not.toBeNull();
    expect(respond).toHaveBeenCalledWith({ success: true });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "clear" })
    );
    ui.setNotificationStackVisibility(false);
    ui.updateNotificationStack([]);
    expect(
      document.getElementById("knoww-notification-stack")?.style.display
    ).toBe("none");
    badge.recordToolbarMatches([...previous, { id: "new" }], url);
    badge.finishToolbarMatchRun(url);
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({ count: 1 })
    );
  });
  it("opens on page load when enabled, despite a dismissal saved by an older version", async () => {
    window.KNOWW_CONFIG.isNotificationStackEnabled = () => true;
    vi.mocked(chrome.storage.local.get).mockImplementation((_key, callback) => {
      if (typeof callback === "function")
        callback({ "knoww-stack-dismissed": true });
    });
    ui.initNotificationStack();
    await vi.advanceTimersByTimeAsync(0);
    expect(document.getElementById("knoww-notification-stack")).not.toBeNull();
  });
  it("respects closing on this page, and an explicit enable can reopen it", async () => {
    window.KNOWW_CONFIG.isNotificationStackEnabled = () => true;
    ui.initNotificationStack();
    await vi.advanceTimersByTimeAsync(0);
    document.getElementById("knoww-stack-close")?.click();
    ui.initNotificationStack();
    await vi.advanceTimersByTimeAsync(0);
    expect(
      document.getElementById("knoww-notification-stack")?.style.display
    ).toBe("none");
    ui.setNotificationStackVisibility(true);
    expect(
      document.getElementById("knoww-notification-stack")?.style.display
    ).not.toBe("none");
  });
});
