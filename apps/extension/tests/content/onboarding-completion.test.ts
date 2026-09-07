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
      "3 of 4 complete"
    );
    await clickDemo();
    expect(document.querySelector(".progress-summary")?.textContent).toContain(
      "3 of 4 complete"
    );
    await React.act(async () => finishOpen({ ok: true }));
    expect(document.querySelector(".progress-summary")?.textContent).toContain(
      "4 of 4 complete"
    );
    expect(document.querySelectorAll(".progress-step--complete")).toHaveLength(
      4
    );
    expect(document.querySelector(".progress-fill--4")).not.toBeNull();
    expect(document.querySelector(".stage-progress-fill--4")).not.toBeNull();
    await React.act(async () => mounted.root?.unmount());
    await mount();
    expect(document.querySelector(".progress-summary")?.textContent).toContain(
      "4 of 4 complete"
    );
  });

  it("keeps the step incomplete if opening X fails", async () => {
    await mount();
    await clickDemo();
    await React.act(async () => finishOpen({ ok: false }));
    expect(document.querySelector(".progress-summary")?.textContent).toContain(
      "3 of 4 complete"
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
      "3 of 4 complete"
    );
    await clickDemo();
    await React.act(async () => finishOpen({ ok: true }));
    expect(stored[ONBOARDING_STORAGE_KEY]).toHaveProperty("demoOpenedAt");
    expect(document.querySelector(".progress-summary")?.textContent).toContain(
      "4 of 4 complete"
    );
  });
});
