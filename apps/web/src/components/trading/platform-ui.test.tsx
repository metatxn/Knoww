import type {
  CanonicalMarket,
  CanonicalOutcome,
  MarketCapabilities,
} from "@knoww/services/core";
import { MARKET_CAPABILITY_KEYS } from "@knoww/services/core";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getPlatformTradingUi } from "./platform-ui";

vi.mock("./split-shares-modal", () => ({ SplitSharesModal: () => null }));
vi.mock("./merge-shares-modal", () => ({ MergeSharesModal: () => null }));

const capabilities = {} as MarketCapabilities;
for (const key of MARKET_CAPABILITY_KEYS) {
  capabilities[key] = true;
}

const outcomes: CanonicalOutcome[] = [
  {
    id: "polymarket:yes-token",
    sourceOutcomeId: "yes-token",
    label: "Yes",
    price: "0.6",
  },
  {
    id: "polymarket:no-token",
    sourceOutcomeId: "no-token",
    label: "No",
    price: "0.4",
  },
];

const market: CanonicalMarket = {
  schemaVersion: "1",
  id: "polymarket:0xcondition",
  platform: "polymarket",
  sourceMarketId: "0xcondition",
  title: "Will it rain?",
  status: "active",
  outcomes,
  capabilities,
  fetchedAt: "2024-01-01T00:00:00.000Z",
};

describe("platform trading UI map", () => {
  it("registers Polymarket with a market badge and trading extras", () => {
    const ui = getPlatformTradingUi("polymarket");
    expect(ui?.MarketBadge).toBeTypeOf("function");
    expect(ui?.TradingExtras).toBeTypeOf("function");
  });

  it("has no entry for a platform without optional trading UI", () => {
    expect(getPlatformTradingUi("kalshi")).toBeUndefined();
  });

  it("renders Polymarket's Neg Risk badge only from the platform details", () => {
    const Badge = getPlatformTradingUi("polymarket")?.MarketBadge;
    if (!Badge) {
      throw new Error("Polymarket registers a MarketBadge");
    }
    const negRisk = render(
      <Badge
        market={market}
        outcome={outcomes[0]}
        details={{
          platform: "polymarket",
          conditionId: "0xcondition",
          negRisk: true,
        }}
      />
    );
    expect(negRisk.container.textContent).toBe("Neg Risk");
    negRisk.unmount();

    const plain = render(
      <Badge
        market={market}
        outcome={outcomes[0]}
        details={{
          platform: "polymarket",
          conditionId: "0xcondition",
          negRisk: false,
        }}
      />
    );
    expect(plain.container.textContent).toBe("");
  });
});
