import { describe, expect, it, vi } from "vitest";
import { isPlatformError } from "./core";
import gammaEventFixture from "./fixtures/polymarket/gamma-event.json";
import {
  createPlatformRegistry,
  POLYMARKET_BASE_URLS,
  parseCanonicalId,
} from "./registry";

const FED_EVENT_ID = "481717";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function recordingFetch(respond: (url: string) => Response) {
  const calls: string[] = [];
  const fetchImpl = vi.fn<typeof fetch>(async (input) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    calls.push(url);
    return respond(url);
  });
  return { fetchImpl, calls };
}

function catchError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to throw");
}

describe("createPlatformRegistry", () => {
  it("enables Polymarket alone when no flags are set", () => {
    const registry = createPlatformRegistry({ env: {} });

    expect(registry.getEnabledPlatforms()).toEqual(["polymarket"]);
    const adapter = registry.getMarketDataAdapter("polymarket");
    expect(adapter.platform).toBe("polymarket");
    expect(adapter.capabilities()).toMatchObject({
      marketData: true,
      orderbook: true,
      createOrder: false,
    });
    expect(registry.getTradingAdapter("polymarket")).toBeNull();
  });

  it("keeps the environment's order and drops platforms without an adapter", () => {
    const registry = createPlatformRegistry({
      env: { KNOWW_ENABLED_PLATFORMS: "kalshi, polymarket" },
    });

    expect(registry.getEnabledPlatforms()).toEqual(["polymarket"]);
  });

  it("throws a disabled PlatformError for a platform the environment turned off", () => {
    const registry = createPlatformRegistry({
      env: { KNOWW_ENABLED_PLATFORMS: "kalshi" },
    });

    expect(registry.getEnabledPlatforms()).toEqual([]);
    const error = catchError(() => registry.getMarketDataAdapter("polymarket"));
    expect(isPlatformError(error)).toBe(true);
    expect(error).toMatchObject({
      platform: "polymarket",
      operation: "resolveAdapter",
      kind: "disabled",
    });
    expect(
      catchError(() => registry.getPlatformAdapter("polymarket"))
    ).toMatchObject({ kind: "disabled" });
    expect(
      catchError(() => registry.getTradingAdapter("polymarket"))
    ).toMatchObject({ kind: "disabled" });
  });

  it("applies capability overrides to the adapter and to the payloads it maps", async () => {
    const { fetchImpl } = recordingFetch(() =>
      jsonResponse({ events: [gammaEventFixture] })
    );
    const registry = createPlatformRegistry({
      env: { KNOWW_PLATFORM_CAPABILITY_OVERRIDES: "polymarket.orderbook=off" },
      fetchImpl,
    });

    const adapter = registry.getMarketDataAdapter("polymarket");
    expect(adapter.capabilities()).toMatchObject({
      marketData: true,
      orderbook: false,
      priceHistory: true,
    });
    const page = await adapter.searchMarkets({ query: "fed" });
    expect(page.items[0]?.capabilities.orderbook).toBe(false);
    expect(page.items[0]?.markets[0]?.capabilities.orderbook).toBe(false);
  });

  it("hands the injected fetch and base URLs to the Polymarket adapter", async () => {
    const { fetchImpl, calls } = recordingFetch(() =>
      jsonResponse(gammaEventFixture)
    );
    const registry = createPlatformRegistry({
      env: {},
      fetchImpl,
      polymarket: { baseUrls: { gamma: "https://gamma.test" } },
    });

    const polymarket = registry.getPlatformAdapter("polymarket");
    expect(polymarket.baseUrls).toEqual({
      gamma: "https://gamma.test",
      clob: "https://clob.polymarket.com",
      dataApi: "https://data-api.polymarket.com",
    });
    const event = await polymarket.getEvent(FED_EVENT_ID);
    expect(event.id).toBe(`polymarket:${FED_EVENT_ID}`);
    expect(calls).toEqual([`https://gamma.test/events/${FED_EVENT_ID}`]);
    expect(registry.getMarketDataAdapter("polymarket")).toBe(polymarket);
  });
});

describe("registry exports", () => {
  it("owns the production Polymarket base URLs", () => {
    expect(POLYMARKET_BASE_URLS).toEqual({
      gamma: "https://gamma-api.polymarket.com",
      clob: "https://clob.polymarket.com",
      dataApi: "https://data-api.polymarket.com",
    });
  });

  it("re-exports parseCanonicalId", () => {
    expect(parseCanonicalId("polymarket:0xabc")).toEqual({
      platform: "polymarket",
      sourceId: "0xabc",
    });
  });
});
