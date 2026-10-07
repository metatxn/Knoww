import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  fetchCalls: 0,
  shownOptions: [] as Array<Record<string, unknown>>,
}));

vi.mock("../../src/content/trading/trading-panel", () => ({
  TradingPanel: {
    show: (options: Record<string, unknown>) =>
      runtime.shownOptions.push(options),
  },
}));

vi.mock("../../src/content/trading/trading-service", () => ({
  TradingService: {
    getContext: () => ({}),
  },
}));

vi.mock("../../src/content/trading/bridge", () => ({
  WALLETCONNECT_WALLET_UUID: "walletconnect",
  WalletBridge: {},
}));

vi.mock("../../src/content/trading/extension-session", () => ({
  ExtensionSession: {},
}));

vi.mock("../../src/content/trading/setup-gates", () => ({
  isTradingWalletDeploymentRequired: () => false,
}));

vi.mock("../../src/content/ui/stream-bet-ui", () => ({
  buildStreamBetting: () => ({}),
  configureStreamTradingPort: () => undefined,
  disposeStreamBetting: () => undefined,
  resetStreamTradingPort: () => undefined,
}));

vi.mock("../../src/content/trading/walletconnect-qr", () => ({
  renderWalletConnectQrSvg: () => "",
}));

beforeEach(() => {
  runtime.fetchCalls = 0;
  runtime.shownOptions.length = 0;
  vi.stubGlobal("window", {
    KNOWW_API: {
      fetchClobTokenIds: async () => {
        runtime.fetchCalls += 1;
        return "live-england-yes";
      },
    },
    KNOWW_ANALYTICS: { track: async () => undefined },
    KNOWW_UTILS: {
      log: () => undefined,
      safeSendMessage: async () => ({ ok: true }),
    },
  });
});

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

test("refreshes a present Polymarket token before opening the trading panel", async () => {
  const { openTradingPanel } = await import(
    "../../src/content/trading/trading-glue"
  );
  const anchor = {
    closest: () => null,
    style: { opacity: "", pointerEvents: "" },
  } as unknown as HTMLElement;

  openTradingPanel({
    market: {
      id: "30615",
      title: "World Cup Winner",
      slug: "world-cup-winner",
      source: "polymarket",
      markets: [
        {
          conditionId: "condition-england",
          clobTokenIds: '["stale-england-yes","stale-england-no"]',
        },
      ],
    },
    outcomeName: "England",
    outcomeIndex: 0,
    price: 0.21,
    anchorElement: anchor,
    isMultiOutcome: true,
    marketIndex: 0,
  });

  await vi.waitFor(() => assert.equal(runtime.shownOptions.length, 1));

  assert.equal(runtime.fetchCalls, 1);
  assert.equal(runtime.shownOptions[0]?.tokenId, "live-england-yes");
});

test("uses V2 position IDs for the panel and paired balances", async () => {
  const conditionId = `0x01${"11".repeat(17)}${"00".repeat(13)}`;
  const positionIds = [0, 1].map((index) =>
    BigInt(`${conditionId}0${index}`).toString()
  );
  const { openTradingPanel } = await import(
    "../../src/content/trading/trading-glue"
  );
  const anchor = {
    closest: () => null,
    style: { opacity: "", pointerEvents: "" },
  } as unknown as HTMLElement;
  vi.stubGlobal("window", {
    KNOWW_API: { fetchClobTokenIds: async () => positionIds[0] },
    KNOWW_ANALYTICS: { track: async () => undefined },
    KNOWW_UTILS: {
      log: () => undefined,
      safeSendMessage: async () => ({ ok: true }),
    },
  });

  openTradingPanel({
    market: {
      id: "30616",
      title: "V2 market",
      slug: "v2-market",
      source: "polymarket",
      markets: [
        {
          conditionId,
          outcomes: ["Yes", "No"],
          version: "v2",
          positionIds,
          clobTokenIds: '["11","12"]',
        },
      ],
    } as Parameters<typeof openTradingPanel>[0]["market"],
    outcomeName: "Yes",
    outcomeIndex: 0,
    price: 0.5,
    anchorElement: anchor,
    isMultiOutcome: false,
    marketIndex: 0,
  });

  await vi.waitFor(() => assert.equal(runtime.shownOptions.length, 1));
  assert.equal(runtime.shownOptions[0]?.tokenId, positionIds[0]);
  assert.equal(runtime.shownOptions[0]?.yesTokenId, positionIds[0]);
  assert.equal(runtime.shownOptions[0]?.noTokenId, positionIds[1]);
});
