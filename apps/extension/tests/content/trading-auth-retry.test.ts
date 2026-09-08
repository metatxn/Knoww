import { afterEach, expect, it, vi } from "vitest";
import { EXTENSION_AUTH_REQUIRED_ERROR } from "../../src/types/chrome-messages";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
});

it("retries approval using a session another tab already renewed without signing in again", async () => {
  const address = `0x${"1".repeat(40)}`;
  const messages: string[] = [];
  let approvalRequests = 0;
  vi.stubGlobal("__DEV_MODE__", false);
  vi.stubGlobal("window", { location: { origin: "https://x.com" } });
  vi.stubGlobal("chrome", {
    runtime: {
      sendMessage: (
        message: { type: string },
        callback: (response: unknown) => void
      ) => {
        messages.push(message.type);
        if (message.type === "auth:get-session-info") {
          callback({ ok: true, data: { loggedIn: true, address } });
        } else if (message.type === "trading:relayer-approve") {
          approvalRequests++;
          callback(
            approvalRequests === 1
              ? { ok: false, error: EXTENSION_AUTH_REQUIRED_ERROR }
              : { ok: true, data: { txHash: "test-approval" } }
          );
        } else
          callback({ ok: false, error: `Unexpected request: ${message.type}` });
      },
    },
  });
  const { TradingService } = await import(
    "../../src/content/trading/trading-service"
  );
  TradingService.getContext().address = address;
  vi.spyOn(TradingService, "refreshBalance").mockResolvedValue(undefined);
  expect(await TradingService.approveUsdc()).toBe("test-approval");
  expect(approvalRequests).toBe(2);
  expect(messages).not.toContain("auth:clear-token");
  expect(messages).not.toContain("auth:open-sign-in");
});
