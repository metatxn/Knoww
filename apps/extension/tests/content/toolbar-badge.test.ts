// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let badge: typeof import("../../src/content/toolbar-badge");
let send: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  vi.resetModules();
  window.history.replaceState({}, "", "/first");
  document.body.innerHTML = "";
  send = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("chrome", { runtime: { sendMessage: send } });
  badge = await import("../../src/content/toolbar-badge");
});
afterEach(() => vi.unstubAllGlobals());
describe("toolbar match reporting", () => {
  it("counts unique page matches across posts, independently of notification preferences", () => {
    const url = window.location.href;
    badge.recordToolbarMatches(
      [
        { id: "1", source: "polymarket" },
        { id: "1", source: "polymarket" },
      ],
      url
    );
    badge.recordToolbarMatches([{ id: "1", source: "kalshi" }], url);
    badge.finishToolbarMatchRun(url);
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: "matches",
        count: 2,
        floatingOpen: false,
      })
    );
  });
  it("reports zero and whether the floating panel is actually visible", () => {
    document.body.innerHTML = '<div id="knoww-notification-stack"></div>';
    badge.finishToolbarMatchRun(window.location.href);
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({ count: 0, floatingOpen: true })
    );
    document
      .getElementById("knoww-notification-stack")
      ?.style.setProperty("display", "none");
    badge.finishToolbarMatchRun(window.location.href);
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({ floatingOpen: false })
    );
  });
  it("discards previous-page counts and late match results on SPA navigation", () => {
    const oldUrl = window.location.href;
    badge.recordToolbarMatches([{ id: "old" }], oldUrl);
    window.history.pushState({}, "", "/second");
    badge.recordToolbarMatches([{ id: "late" }], oldUrl);
    badge.finishToolbarMatchRun(oldUrl);
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "clear" })
    );
    badge.finishToolbarMatchRun(window.location.href);
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "matches", count: 0 })
    );
  });
  it("starts at one after opening the panel, even when old matches appear again", () => {
    const url = window.location.href;
    const previous = Array.from({ length: 10 }, (_, id) => ({
      id: String(id),
    }));
    badge.recordToolbarMatches(previous, url);
    badge.finishToolbarMatchRun(url);
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({ count: 10 })
    );
    badge.clearToolbarBadge();
    badge.recordToolbarMatches([...previous, { id: "new" }], url);
    badge.finishToolbarMatchRun(url);
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "matches", count: 1 })
    );
    badge.recordToolbarMatches([{ id: "next" }], url);
    badge.finishToolbarMatchRun(url);
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({ count: 2 })
    );
  });
  it("treats matches delivered while the floating panel is open as read", () => {
    const url = window.location.href;
    document.body.innerHTML = '<div id="knoww-notification-stack"></div>';
    badge.recordToolbarMatches([{ id: "visible" }], url);
    document
      .getElementById("knoww-notification-stack")
      ?.style.setProperty("display", "none");
    // Closing before the batch finishes must not make visible matches unread.
    badge.finishToolbarMatchRun(url);
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({ count: 0 })
    );
    badge.recordToolbarMatches([{ id: "visible" }, { id: "new" }], url);
    badge.finishToolbarMatchRun(url);
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({ count: 1 })
    );
  });
  it("does not restore read stream matches and resets read history on navigation", () => {
    const url = window.location.href;
    badge.replaceToolbarMatches([{ id: "old" }], url);
    badge.clearToolbarBadge();
    badge.replaceToolbarMatches([{ id: "old" }, { id: "new" }], url);
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({ count: 1 })
    );
    window.history.pushState({}, "", "/next");
    badge.recordToolbarMatches([{ id: "old" }], window.location.href);
    badge.finishToolbarMatchRun(window.location.href);
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({ count: 1 })
    );
  });
  it("replaces stream results, including zero-match refreshes", () => {
    const url = window.location.href;
    badge.replaceToolbarMatches([{ id: "1" }], url);
    badge.replaceToolbarMatches([], url);
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({ count: 0 })
    );
  });
});
