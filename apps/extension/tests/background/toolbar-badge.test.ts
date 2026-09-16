import { describe, expect, it, vi } from "vitest";
import {
  formatMatchBadge,
  ToolbarBadgeController,
} from "../../src/background/toolbar-badge";

describe("matched-market toolbar badge", () => {
  it.each([
    [0, ""],
    [1, "1"],
    [99, "99"],
    [100, "99+"],
  ])("formats %s matches", (count, text) => {
    expect(formatMatchBadge(Number(count))).toBe(text);
  });
  it("keeps tab counts separate and suppresses visible floating panels", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const badge = new ToolbarBadgeController(write);
    await badge.matches(1, 3, false);
    await badge.matches(2, 5, false);
    await badge.matches(3, 8, true);
    expect(write.mock.calls).toEqual([
      [1, "3"],
      [2, "5"],
      [3, ""],
    ]);
  });
  it("clears when a side panel opens and waits for a new match run after closing", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const badge = new ToolbarBadgeController(write);
    const panel = {};
    await badge.matches(1, 4, false);
    await badge.panel(1, panel, true);
    await badge.matches(1, 6, false);
    await badge.panel(1, panel, false);
    expect(write.mock.calls).toEqual([
      [1, "4"],
      [1, ""],
      [1, ""],
    ]);
    await badge.matches(1, 6, false);
    expect(write).toHaveBeenLastCalledWith(1, "6");
  });
  it("clears the newly active tab when a global side panel follows it", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const badge = new ToolbarBadgeController(write);
    const panel = {};
    await badge.panel(1, panel, true);
    await badge.panel(1, panel, false);
    await badge.panel(2, panel, true);
    await badge.matches(1, 2, false);
    await badge.matches(2, 8, false);
    expect(write.mock.calls).toEqual([
      [1, ""],
      [2, ""],
      [1, "2"],
      [2, ""],
    ]);
  });
  it("orders a navigation clear after a pending count write and recovers from failures", async () => {
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const write = vi
      .fn()
      .mockImplementationOnce(() => wait)
      .mockRejectedValueOnce(new Error("Tab closed"))
      .mockResolvedValue(undefined);
    const badge = new ToolbarBadgeController(write);
    const count = badge.matches(1, 4, false);
    const clear = badge.clear(1);
    const later = badge.matches(1, 2, false);
    release();
    await count;
    await expect(clear).rejects.toThrow("Tab closed");
    await later;
    expect(write.mock.calls).toEqual([
      [1, "4"],
      [1, ""],
      [1, "2"],
    ]);
  });
});
