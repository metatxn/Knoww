// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";

vi.mock("../../src/onboarding-state", () => ({
  isOnboardingWalletSetupUrl: () => true,
}));

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.resetModules();
});

test("theme is sent only after the packaged iframe reports its height", async () => {
  vi.stubGlobal("chrome", {
    runtime: {
      getURL: (path: string) => `chrome-extension://test/${path}`,
    },
  });
  document.body.innerHTML =
    '<div id="knoww-extension-onboarding" data-ready="true"></div>';
  await import("../../src/onboarding-host");
  const frame = document.querySelector("iframe");
  const frameWindow = frame?.contentWindow;
  if (!frame || !frameWindow)
    throw new Error("onboarding iframe did not mount");
  const postMessage = vi.spyOn(frameWindow, "postMessage");

  frame.dispatchEvent(new Event("load"));
  document.documentElement.classList.add("theme-check");
  await Promise.resolve();
  expect(postMessage).not.toHaveBeenCalled();

  window.dispatchEvent(
    new MessageEvent("message", {
      source: frameWindow,
      origin: "chrome-extension://other",
      data: { type: "knoww:onboarding-height", height: 500 },
    })
  );
  expect(postMessage).not.toHaveBeenCalled();

  window.dispatchEvent(
    new MessageEvent("message", {
      source: frameWindow,
      origin: "chrome-extension://test",
      data: { type: "knoww:onboarding-height", height: 500 },
    })
  );
  expect(postMessage).toHaveBeenCalledWith(
    expect.objectContaining({ type: "knoww:onboarding-theme" }),
    "chrome-extension://test"
  );
});
