import type {
  MarketCapabilities,
  MarketDataAdapter,
  PlatformId,
  RegionPolicy,
  TradingAdapter,
} from "@knoww/services/core";
import { createPlatformRegistry } from "@knoww/services/registry";
import { describe, expect, it } from "vitest";
import {
  evaluateFeatureFlags,
  type FeatureFlagsRegistry,
  readRequestLocation,
} from "./feature-flags";

const TRADABLE: MarketCapabilities = {
  marketData: true,
  orderbook: true,
  priceHistory: true,
  publicTrades: true,
  accountPositions: true,
  accountOrders: true,
  createOrder: true,
  cancelOrder: true,
  redeem: false,
  withdrawals: false,
};

const READ_ONLY: MarketCapabilities = {
  ...TRADABLE,
  accountPositions: false,
  accountOrders: false,
  createOrder: false,
  cancelOrder: false,
};

const POLICY: RegionPolicy = {
  blocked: ["IR"],
  closeOnly: ["US", "CA-ON"],
};

function fakeRegistry(
  platforms: Partial<
    Record<
      PlatformId,
      { capabilities: MarketCapabilities; policy: RegionPolicy | null }
    >
  >
): FeatureFlagsRegistry {
  const ids = Object.keys(platforms) as PlatformId[];
  return {
    getEnabledPlatforms: () => ids,
    getMarketDataAdapter: (platform) =>
      ({
        capabilities: () => platforms[platform]?.capabilities,
      }) as unknown as MarketDataAdapter,
    getTradingAdapter: (platform) => {
      const policy = platforms[platform]?.policy;
      return policy
        ? ({ regionPolicy: () => policy } as unknown as TradingAdapter)
        : null;
    },
  };
}

describe("evaluateFeatureFlags", () => {
  const registry = fakeRegistry({
    polymarket: { capabilities: TRADABLE, policy: POLICY },
  });

  it("lets a visitor in an open country open and close positions", () => {
    const flags = evaluateFeatureFlags({
      registry,
      location: { country: "IN" },
      environment: "production",
    });

    expect(flags.location).toEqual({ country: "IN", subdivision: null });
    expect(flags.platforms.polymarket).toMatchObject({
      enabled: true,
      regionTrading: "open",
      canOpenPositions: true,
      canClosePositions: true,
    });
    expect(flags.platforms.polymarket?.capabilities).toEqual(TRADABLE);
  });

  it("keeps a close-only visitor to reducing positions", () => {
    const flags = evaluateFeatureFlags({
      registry,
      location: { country: "US", subdivision: "NY" },
      environment: "production",
    });

    expect(flags.platforms.polymarket).toMatchObject({
      regionTrading: "close_only",
      canOpenPositions: false,
      canClosePositions: true,
    });
  });

  it("refuses both for a blocked visitor", () => {
    const flags = evaluateFeatureFlags({
      registry,
      location: { country: "IR" },
      environment: "production",
    });

    expect(flags.platforms.polymarket).toMatchObject({
      regionTrading: "blocked",
      canOpenPositions: false,
      canClosePositions: false,
    });
  });

  it("treats an unplaceable visitor as close-only in production only", () => {
    const unknown = { country: "T1" };

    expect(
      evaluateFeatureFlags({
        registry,
        location: unknown,
        environment: "production",
      }).platforms.polymarket
    ).toMatchObject({
      regionTrading: "unknown",
      canOpenPositions: false,
      canClosePositions: true,
    });
    expect(
      evaluateFeatureFlags({
        registry,
        location: unknown,
        environment: "development",
      }).platforms.polymarket
    ).toMatchObject({
      regionTrading: "unknown",
      canOpenPositions: true,
      canClosePositions: true,
    });
  });

  it("never offers trading on a read-only platform", () => {
    const flags = evaluateFeatureFlags({
      registry: fakeRegistry({
        kalshi: { capabilities: READ_ONLY, policy: null },
      }),
      location: { country: "IN" },
      environment: "production",
    });

    expect(flags.platforms.kalshi).toMatchObject({
      enabled: true,
      regionTrading: "open",
      canOpenPositions: false,
      canClosePositions: false,
    });
    expect(flags.platforms.polymarket).toBeUndefined();
  });

  it("reads the real registry's declaration for Polymarket", () => {
    const flags = evaluateFeatureFlags({
      registry: createPlatformRegistry({
        env: { KNOWW_ENABLED_PLATFORMS: "polymarket" },
        fetchImpl: () => Promise.reject(new Error("no network in tests")),
      }),
      location: { country: "GB" },
      environment: "production",
    });

    expect(flags.platforms.polymarket).toMatchObject({
      enabled: true,
      regionTrading: "close_only",
      canOpenPositions: false,
      canClosePositions: true,
    });
  });
});

describe("readRequestLocation", () => {
  const headersOf = (values: Record<string, string>) => ({
    get: (name: string) => values[name.toLowerCase()] ?? null,
  });

  it("takes the country from Cloudflare's header and the subdivision from cf", () => {
    expect(
      readRequestLocation(headersOf({ "cf-ipcountry": "US" }), {
        country: "US",
        regionCode: "NY",
      })
    ).toEqual({ country: "US", subdivision: "NY" });
  });

  it("falls back to the cf country when the header is missing", () => {
    expect(
      readRequestLocation(headersOf({}), { country: "CA", regionCode: "ON" })
    ).toEqual({ country: "CA", subdivision: "ON" });
  });

  it("reports nothing when neither source knows", () => {
    expect(readRequestLocation(headersOf({}), undefined)).toEqual({
      country: null,
      subdivision: null,
    });
  });
});
