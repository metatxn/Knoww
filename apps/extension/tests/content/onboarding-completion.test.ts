// @vitest-environment jsdom
import * as React from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ONBOARDING_STORAGE_KEY } from "../../src/onboarding-state";

const mounted = vi.hoisted(() => ({ root: null as Root | null }));
vi.mock("react-dom/client", async (original) => {
  const actual = await original<typeof import("react-dom/client")>();
  return {
    ...actual,
    createRoot: (...args: Parameters<typeof actual.createRoot>) => {
      mounted.root = actual.createRoot(...args);
      return mounted.root;
    },
  };
});

let stored: Record<string, unknown>;
let finishOpen: (response: { ok: boolean }) => void;
let loggedIn: boolean;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  loggedIn = true;
  stored = {
    [ONBOARDING_STORAGE_KEY]: {
      startedAt: "2026-09-07T06:00:00.000Z",
      welcomeCompletedAt: "2026-09-07T06:00:00.000Z",
      completedAt: "2026-09-07T06:01:00.000Z",
      pinCompletedAt: "2026-09-07T06:02:00.000Z",
      walletCheckResult: "connected",
    },
  };
  vi.stubGlobal("chrome", {
    runtime: {
      id: "test-extension",
      getManifest: () => ({ version: "test" }),
      sendMessage: (message: { type: string }, callback: typeof finishOpen) => {
        if (message.type === "KNOWW_OPEN_ONBOARDING_DEMO") {
          finishOpen = callback;
          return;
        }
        const response = {
          ok: true,
          data: {
            loggedIn,
            address: "0x0000000000000000000000000000000000000001",
            tradingWalletDeployed: true,
            hasCredentials: true,
            hasApproval: true,
            tradingReady: true,
          },
        };
        callback(response);
      },
    },
    storage: {
      local: {
        get: (key: string, callback: (data: object) => void) =>
          callback({ [key]: stored[key] }),
        set: (data: object, callback: () => void) => {
          Object.assign(stored, data);
          callback();
        },
      },
    },
  });
});

async function mount() {
  document.body.innerHTML = '<div id="root"></div>';
  vi.resetModules();
  await React.act(async () => {
    await import("../../src/onboarding");
  });
}

afterEach(async () => {
  await React.act(async () => mounted.root?.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function clickDemo() {
  const button = [...document.querySelectorAll("button")].find((element) =>
    element.textContent?.includes("Open x.com and try it")
  );
  if (!button) throw new Error("Demo button missing");
  await React.act(async () => button.click());
}

describe("the final onboarding step", () => {
  it.each([true, false])(
    "serializes overlapping progress patches when the first write succeeds: %s",
    async (firstWriteSucceeds) => {
      await mount();
      const writes: Array<(succeed?: boolean) => void> = [];
      vi.spyOn(chrome.storage.local, "set").mockImplementation(
        (data, callback) => {
          writes.push((succeed = true) => {
            if (succeed) Object.assign(stored, data);
            Object.defineProperty(chrome.runtime, "lastError", {
              configurable: true,
              value: succeed ? undefined : { message: "Storage unavailable" },
            });
            callback?.();
            Object.defineProperty(chrome.runtime, "lastError", {
              value: undefined,
            });
          });
        }
      );

      await clickDemo();
      loggedIn = false;
      await React.act(async () => window.dispatchEvent(new Event("focus")));
      expect(writes).toHaveLength(1);
      await React.act(async () => finishOpen({ ok: true }));
      expect(writes).toHaveLength(1);

      await React.act(async () => writes[0]?.(firstWriteSucceeds));
      expect(writes).toHaveLength(2);
      await React.act(async () => writes[1]?.());
      expect(stored[ONBOARDING_STORAGE_KEY]).toMatchObject({
        walletCheckResult: firstWriteSucceeds ? "not_connected" : "connected",
        demoOpenedAt: expect.any(String),
      });
    }
  );

  it("completes after opening X and stays complete after reloading", async () => {
    await mount();
    expect(document.querySelector(".progress-summary")?.textContent).toContain(
      "4 of 5 complete"
    );
    await clickDemo();
    expect(document.querySelector(".progress-summary")?.textContent).toContain(
      "4 of 5 complete"
    );
    await React.act(async () => finishOpen({ ok: true }));
    expect(document.querySelector(".progress-summary")?.textContent).toContain(
      "5 of 5 complete"
    );
    expect(document.querySelectorAll(".progress-step--complete")).toHaveLength(
      5
    );
    expect(document.querySelector(".progress-fill--5")).not.toBeNull();
    expect(document.querySelector(".stage-progress-fill--5")).not.toBeNull();
    expect(document.querySelector("h1")?.textContent).toBe("You're all set.");
    expect(document.activeElement).toBe(document.querySelector("h1"));
    expect(
      Array.from(
        document.querySelectorAll<HTMLAnchorElement>(".explore-site"),
        (link) => link.href
      )
    ).toEqual([
      "https://x.com/",
      "https://www.reddit.com/",
      "https://kalshi.com/",
    ]);
    expect(document.querySelector(".live-preview")).toBeNull();
    await React.act(async () => mounted.root?.unmount());
    await mount();
    expect(document.querySelector("h1")?.textContent).toBe("You're all set.");
    expect(document.querySelector(".progress-summary")?.textContent).toContain(
      "5 of 5 complete"
    );
  });

  it("keeps the step incomplete if opening X fails", async () => {
    await mount();
    await clickDemo();
    await React.act(async () => finishOpen({ ok: false }));
    expect(document.querySelector(".progress-summary")?.textContent).toContain(
      "4 of 5 complete"
    );
    expect(document.body.textContent).toContain(
      "Knoww couldn't open X. Try again."
    );
    expect(stored[ONBOARDING_STORAGE_KEY]).not.toHaveProperty("demoOpenedAt");
  });

  it("retries saving completion after a storage failure", async () => {
    await mount();
    vi.spyOn(chrome.storage.local, "set").mockImplementationOnce(
      (_data, callback) => {
        Object.defineProperty(chrome.runtime, "lastError", {
          configurable: true,
          value: { message: "Storage unavailable" },
        });
        callback?.();
        Object.defineProperty(chrome.runtime, "lastError", {
          value: undefined,
        });
      }
    );
    await clickDemo();
    await React.act(async () => finishOpen({ ok: true }));
    expect(document.querySelector(".progress-summary")?.textContent).toContain(
      "4 of 5 complete"
    );
    await clickDemo();
    await React.act(async () => finishOpen({ ok: true }));
    expect(stored[ONBOARDING_STORAGE_KEY]).toHaveProperty("demoOpenedAt");
    expect(document.querySelector(".progress-summary")?.textContent).toContain(
      "5 of 5 complete"
    );
  });
});

describe("pinning before the demo", () => {
  function clearPinProgress() {
    delete (stored[ONBOARDING_STORAGE_KEY] as Record<string, unknown>)
      .pinCompletedAt;
  }

  function pinApi(initiallyPinned = false) {
    const getUserSettings = vi
      .fn()
      .mockResolvedValue({ isOnToolbar: initiallyPinned });
    const listeners = new Set<(change: { isOnToolbar?: boolean }) => void>();
    const action = {
      getUserSettings,
      onUserSettingsChanged: {
        addListener: vi.fn((listener) => listeners.add(listener)),
        removeListener: vi.fn((listener) => listeners.delete(listener)),
      },
    };
    Object.assign(chrome, { action });
    return { action, listeners, getUserSettings };
  }

  async function click(label: string) {
    const button = [...document.querySelectorAll("button")].find((element) =>
      element.textContent?.trim().startsWith(label)
    );
    if (!button) throw new Error(`Missing ${label} button`);
    await React.act(async () => button.click());
  }

  it("detects pin and unpin changes, then persists verified completion", async () => {
    clearPinProgress();
    const { listeners, action } = pinApi();
    await mount();
    expect(document.querySelector("h1")?.textContent).toBe(
      "Keep Knoww one click away."
    );
    expect(document.querySelector(".progress-summary")?.textContent).toContain(
      "3 of 5 complete"
    );
    await click("Continue");
    expect(stored[ONBOARDING_STORAGE_KEY]).not.toHaveProperty("pinCompletedAt");
    await React.act(async () =>
      listeners.forEach((listener) => {
        listener({ isOnToolbar: true });
      })
    );
    expect(document.body.textContent).toContain("Knoww is pinned.");
    await React.act(async () =>
      listeners.forEach((listener) => {
        listener({ isOnToolbar: false });
      })
    );
    await click("Continue");
    expect(document.querySelector("h1")?.textContent).toBe(
      "Keep Knoww one click away."
    );
    await React.act(async () =>
      listeners.forEach((listener) => {
        listener({ isOnToolbar: true });
      })
    );
    await click("Continue");
    expect(stored[ONBOARDING_STORAGE_KEY]).toHaveProperty("pinCompletedAt");
    expect(document.querySelector("h1")?.textContent).toBe(
      "Try it on a live post."
    );
    expect(action.onUserSettingsChanged.removeListener).toHaveBeenCalledOnce();
    expect(listeners.size).toBe(0);
    await React.act(async () => mounted.root?.unmount());
    await mount();
    expect(document.querySelector("h1")?.textContent).toBe(
      "Try it on a live post."
    );
  });

  it("recognizes an already pinned extension", async () => {
    clearPinProgress();
    pinApi(true);
    await mount();
    expect(document.body.textContent).toContain("Knoww is pinned.");
    await click("Continue");
    expect(document.querySelector("h1")?.textContent).toBe(
      "Try it on a live post."
    );
  });

  it("polls when the browser has no settings change event and stops on unmount", async () => {
    vi.useFakeTimers();
    clearPinProgress();
    const { getUserSettings } = pinApi();
    Object.assign(chrome, { action: { getUserSettings } });
    await mount();
    getUserSettings.mockResolvedValue({ isOnToolbar: true });
    await React.act(async () => vi.advanceTimersByTimeAsync(1500));
    expect(document.body.textContent).toContain("Knoww is pinned.");
    await React.act(async () => mounted.root?.unmount());
    const calls = getUserSettings.mock.calls.length;
    await React.act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(getUserSettings).toHaveBeenCalledTimes(calls);
  });

  it("does not overwrite a pin event with an older settings response", async () => {
    clearPinProgress();
    const { getUserSettings, listeners } = pinApi();
    let resolveCheck!: (value: { isOnToolbar: boolean }) => void;
    getUserSettings.mockReturnValue(
      new Promise((resolve) => {
        resolveCheck = resolve;
      })
    );
    await mount();
    await React.act(async () =>
      listeners.forEach((listener) => {
        listener({ isOnToolbar: true });
      })
    );
    await React.act(async () => resolveCheck({ isOnToolbar: false }));
    expect(document.body.textContent).toContain("Knoww is pinned.");
  });

  it.each(["missing", "failure"])(
    "allows an unverified continuation when pin detection is %s",
    async (mode) => {
      clearPinProgress();
      if (mode === "failure")
        pinApi().getUserSettings.mockRejectedValue(new Error("Unavailable"));
      await mount();
      expect(document.body.textContent).toContain("We can't check pin status");
      await click("Continue without verification");
      expect(stored[ONBOARDING_STORAGE_KEY]).toHaveProperty("pinSkippedAt");
      expect(stored[ONBOARDING_STORAGE_KEY]).not.toHaveProperty(
        "pinCompletedAt"
      );
      expect(document.querySelector("h1")?.textContent).toBe(
        "Try it on a live post."
      );
    }
  );

  it("remembers a skip without claiming the extension was pinned", async () => {
    clearPinProgress();
    pinApi();
    await mount();
    await click("Skip for now");
    expect(stored[ONBOARDING_STORAGE_KEY]).toHaveProperty("pinSkippedAt");
    expect(stored[ONBOARDING_STORAGE_KEY]).not.toHaveProperty("pinCompletedAt");
    await React.act(async () => mounted.root?.unmount());
    await mount();
    expect(document.querySelector("h1")?.textContent).toBe(
      "Try it on a live post."
    );
    expect(
      document.querySelectorAll(".progress-step")[3]?.textContent
    ).toContain("Skipped for now");
  });

  it("keeps users who finished the old flow on the completion page", async () => {
    clearPinProgress();
    Object.assign(stored[ONBOARDING_STORAGE_KEY] as object, {
      demoOpenedAt: "2026-09-07T06:03:00.000Z",
    });
    await mount();
    expect(document.querySelector("h1")?.textContent).toBe("You're all set.");
  });
});
