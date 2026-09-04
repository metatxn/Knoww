import { describe, expect, it, vi } from "vitest";
import { isPlatformError, type PlatformError } from "../../core";
import { UpstreamEventError } from "../../errors";
import clobBookFixture from "../../fixtures/polymarket/clob-book.json";
import clobPricesHistoryFixture from "../../fixtures/polymarket/clob-prices-history.json";
import dataTradesFixture from "../../fixtures/polymarket/data-trades.json";
import gammaEventFixture from "../../fixtures/polymarket/gamma-event.json";
import gammaMarketFixture from "../../fixtures/polymarket/gamma-market.json";
import gammaTagsFixture from "../../fixtures/polymarket/gamma-tags.json";
import type { PolymarketEventDetails } from "./mappers";
import { createPolymarketMarketDataAdapter } from "./market-data-adapter";

const NOW = new Date("2026-09-03T12:00:00.000Z");
const FETCHED_AT = "2026-09-03T12:00:00.000Z";
const FED_EVENT_ID = "481717";
const FED_EVENT_SLUG = "fed-decision-in-september-762";
const CUT_50_CONDITION_ID =
  "0x5e464d85eb49f22d876f3ed6168a7db5e2288e9ae1eb91effd2758e994676f86";
const CUT_50_YES_TOKEN =
  "97186030785608128217926542396950266594898339988989015155120280107165449433603";
const CUT_50_NO_TOKEN =
  "81470465080656150088482886298356783621062802919110096763062861781139262816347";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

interface RecordedFetch {
  fetchImpl: typeof fetch;
  calls: { url: string; init: RequestInit | undefined }[];
}

function recordingFetch(
  respond: (url: string) => Response | Promise<Response>
): RecordedFetch {
  const calls: RecordedFetch["calls"] = [];
  const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    return respond(url);
  });
  return { fetchImpl, calls };
}

function hangingFetch(): typeof fetch {
  return ((_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(init.signal?.reason ?? new Error("aborted"));
      });
    })) as typeof fetch;
}

function createAdapter(respond: (url: string) => Response | Promise<Response>) {
  const recorded = recordingFetch(respond);
  const adapter = createPolymarketMarketDataAdapter({
    fetchImpl: recorded.fetchImpl,
    now: () => NOW,
  });
  return { adapter, calls: recorded.calls };
}

async function expectPlatformError(
  promise: Promise<unknown>
): Promise<PlatformError> {
  try {
    await promise;
  } catch (error) {
    if (isPlatformError(error)) {
      return error;
    }
    throw error;
  }
  throw new Error("expected a PlatformError");
}

describe("createPolymarketMarketDataAdapter", () => {
  it("identifies itself and reports market-data capabilities", () => {
    const { adapter } = createAdapter(() => jsonResponse({}));
    expect(adapter.platform).toBe("polymarket");
    expect(adapter.capabilities()).toEqual({
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
    });
  });

  describe("getEvent", () => {
    it("fetches the event by id from Gamma and maps it", async () => {
      const { adapter, calls } = createAdapter(() =>
        jsonResponse(gammaEventFixture)
      );
      const event = await adapter.getEvent(FED_EVENT_ID);
      expect(calls.map((call) => call.url)).toEqual([
        `https://gamma-api.polymarket.com/events/${FED_EVENT_ID}`,
      ]);
      expect(event.id).toBe(`polymarket:${FED_EVENT_ID}`);
      expect(event.markets).toHaveLength(5);
      expect(event.fetchedAt).toBe(FETCHED_AT);
    });

    it("maps the event from the record Gamma sent, not the parsed copy", async () => {
      const { adapter } = createAdapter(() => jsonResponse(gammaEventFixture));
      const event = await adapter.getEvent(FED_EVENT_ID);
      const details = event.platformDetails as PolymarketEventDetails;
      expect(details.gamma).toEqual(gammaEventFixture);
    });

    it("throws not_found when Gamma returns 404", async () => {
      const { adapter } = createAdapter(() =>
        jsonResponse({ error: "not found" }, 404)
      );
      const error = await expectPlatformError(adapter.getEvent("0"));
      expect(error).toMatchObject({
        platform: "polymarket",
        operation: "getEvent",
        kind: "not_found",
      });
    });

    it("wraps upstream failures with the upstream status", async () => {
      const { adapter } = createAdapter(() =>
        jsonResponse({ error: "boom" }, 503)
      );
      const error = await expectPlatformError(adapter.getEvent(FED_EVENT_ID));
      expect(error).toMatchObject({
        platform: "polymarket",
        operation: "getEvent",
        kind: "upstream",
        upstreamStatus: 503,
      });
      expect(error.cause).toBeInstanceOf(UpstreamEventError);
    });

    it("reports a timeout as a timeout error", async () => {
      const adapter = createPolymarketMarketDataAdapter({
        fetchImpl: hangingFetch(),
        now: () => NOW,
      });
      const error = await expectPlatformError(
        adapter.getEvent(FED_EVENT_ID, { timeoutMs: 5 })
      );
      expect(error).toMatchObject({
        platform: "polymarket",
        operation: "getEvent",
        kind: "timeout",
      });
    });
  });

  describe("getEventBySlug", () => {
    it("fetches the event by slug from Gamma", async () => {
      const { adapter, calls } = createAdapter(() =>
        jsonResponse(gammaEventFixture)
      );
      const event = await adapter.getEventBySlug(FED_EVENT_SLUG);
      expect(calls.map((call) => call.url)).toEqual([
        `https://gamma-api.polymarket.com/events/slug/${FED_EVENT_SLUG}`,
      ]);
      expect(event.slug).toBe(FED_EVENT_SLUG);
    });
  });

  describe("getMarket", () => {
    it("looks the market up by condition id", async () => {
      const { adapter, calls } = createAdapter(() =>
        jsonResponse(gammaMarketFixture)
      );
      const market = await adapter.getMarket(CUT_50_CONDITION_ID);
      expect(calls.map((call) => call.url)).toEqual([
        `https://gamma-api.polymarket.com/markets?condition_ids=${CUT_50_CONDITION_ID}`,
      ]);
      expect(market.id).toBe(`polymarket:${CUT_50_CONDITION_ID}`);
      expect(market.outcomes.map((outcome) => outcome.sourceOutcomeId)).toEqual(
        [CUT_50_YES_TOKEN, CUT_50_NO_TOKEN]
      );
    });

    it("retries closed markets and throws not_found when both lookups are empty", async () => {
      const { adapter, calls } = createAdapter(() => jsonResponse([]));
      const error = await expectPlatformError(adapter.getMarket("0xabc"));
      expect(calls.map((call) => call.url)).toEqual([
        "https://gamma-api.polymarket.com/markets?condition_ids=0xabc",
        "https://gamma-api.polymarket.com/markets?condition_ids=0xabc&closed=true",
      ]);
      expect(error).toMatchObject({
        operation: "getMarket",
        kind: "not_found",
      });
    });
  });

  describe("searchMarkets", () => {
    it("runs a full-record public search and maps the events", async () => {
      const { adapter, calls } = createAdapter(() =>
        jsonResponse({
          events: [gammaEventFixture],
          pagination: { hasMore: false, totalResults: 1 },
        })
      );
      const page = await adapter.searchMarkets({
        query: "fed decision",
        limit: 5,
      });
      expect(calls.map((call) => call.url)).toEqual([
        "https://gamma-api.polymarket.com/public-search?q=fed+decision&limit=5&limit_per_type=5&cache=true&search_tags=true&optimized=false&events_status=active&keep_closed_markets=0&closed=false",
      ]);
      expect(page.items.map((event) => event.id)).toEqual([
        `polymarket:${FED_EVENT_ID}`,
      ]);
      expect(page.nextCursor).toBeUndefined();
    });
  });

  describe("listEvents", () => {
    it("pages Gamma's keyset endpoint with the canonical filters", async () => {
      const { adapter, calls } = createAdapter(() =>
        jsonResponse({ events: [gammaEventFixture], next_cursor: "MjA=" })
      );
      const page = await adapter.listEvents({
        tag: "fomc",
        sort: "volume24h",
        limit: 20,
        status: "active",
        live: true,
      });
      expect(calls.map((call) => call.url)).toEqual([
        "https://gamma-api.polymarket.com/events/keyset?limit=20&closed=false&live=true&tag_slug=fomc&order=volume24hr&ascending=false",
      ]);
      expect(page.items.map((event) => event.id)).toEqual([
        `polymarket:${FED_EVENT_ID}`,
      ]);
      expect(page.nextCursor).toBe("MjA=");
    });

    it("passes the cursor through and asks for ending-soon ordering", async () => {
      const { adapter, calls } = createAdapter(() =>
        jsonResponse({ events: [], next_cursor: null })
      );
      const page = await adapter.listEvents({
        cursor: "MjA=",
        sort: "endingSoon",
        status: "all",
      });
      expect(calls.map((call) => call.url)).toEqual([
        "https://gamma-api.polymarket.com/events/keyset?limit=20&after_cursor=MjA%3D&order=endDate&ascending=true",
      ]);
      expect(page.items).toEqual([]);
      expect(page.nextCursor).toBeUndefined();
      expect(page.totalResults).toBeUndefined();
    });

    it("maps each event from the record Gamma sent, so numbers stay numbers", async () => {
      const { adapter } = createAdapter(() =>
        jsonResponse({ events: [gammaEventFixture], next_cursor: null })
      );
      const page = await adapter.listEvents({ tag: "fomc" });
      const details = page.items[0]?.platformDetails as PolymarketEventDetails;
      expect(details.gamma).toEqual(gammaEventFixture);
      expect(details.gamma.volume).toBe(gammaEventFixture.volume);
    });

    it("reports the total result count when Gamma sends one", async () => {
      const { adapter } = createAdapter(() =>
        jsonResponse({
          events: [gammaEventFixture],
          next_cursor: null,
          total_results: 42,
        })
      );
      const page = await adapter.listEvents({ tag: "fomc" });
      expect(page.totalResults).toBe(42);
    });
  });

  describe("listTags", () => {
    it("lists native tags with an offset cursor", async () => {
      const { adapter, calls } = createAdapter(() =>
        jsonResponse(gammaTagsFixture)
      );
      const page = await adapter.listTags({ limit: 2 });
      expect(calls.map((call) => call.url)).toEqual([
        "https://gamma-api.polymarket.com/tags?limit=2&offset=0",
      ]);
      expect(page.items).toEqual([
        {
          platform: "polymarket",
          slug: "product-marekt-fit",
          label: "product marekt fit",
          kind: "native",
          sourceTagId: "101867",
        },
        {
          platform: "polymarket",
          slug: "caitlin-clark",
          label: "caitlin clark",
          kind: "native",
          sourceTagId: "1512",
        },
      ]);
      expect(page.nextCursor).toBe("2");
    });

    it("continues from the offset cursor and stops when the page is short", async () => {
      const { adapter, calls } = createAdapter(() => jsonResponse([]));
      const page = await adapter.listTags({ limit: 2, cursor: "2" });
      expect(calls.map((call) => call.url)).toEqual([
        "https://gamma-api.polymarket.com/tags?limit=2&offset=2",
      ]);
      expect(page.items).toEqual([]);
      expect(page.nextCursor).toBeUndefined();
    });
  });

  describe("getOrderbook", () => {
    it("fetches the CLOB book for the outcome token and sorts both sides best-first", async () => {
      const { adapter, calls } = createAdapter(() =>
        jsonResponse(clobBookFixture)
      );
      const book = await adapter.getOrderbook({
        sourceMarketId: CUT_50_CONDITION_ID,
        sourceOutcomeId: CUT_50_YES_TOKEN,
      });
      expect(calls.map((call) => call.url)).toEqual([
        `https://clob.polymarket.com/book?token_id=${CUT_50_YES_TOKEN}`,
      ]);
      expect(book).toMatchObject({
        marketId: `polymarket:${CUT_50_CONDITION_ID}`,
        outcomeId: `polymarket:${CUT_50_YES_TOKEN}`,
        platform: "polymarket",
        fetchedAt: FETCHED_AT,
      });
      expect(book.bids).toEqual([{ price: "0.001", size: "1882882.44" }]);
      expect(book.asks).toHaveLength(108);
      expect(book.asks[0]).toEqual({ price: "0.002", size: "1523312.73" });
      expect(book.asks[107]).toEqual({ price: "0.999", size: "21078266" });
    });

    it("rejects a request without an outcome token before calling upstream", async () => {
      const { adapter, calls } = createAdapter(() =>
        jsonResponse(clobBookFixture)
      );
      const error = await expectPlatformError(
        adapter.getOrderbook({ sourceMarketId: CUT_50_CONDITION_ID })
      );
      expect(error).toMatchObject({
        operation: "getOrderbook",
        kind: "invalid_input",
      });
      expect(calls).toEqual([]);
    });

    it("throws not_found when the CLOB has no book for the token", async () => {
      const { adapter } = createAdapter(() =>
        jsonResponse({ error: "no book" }, 404)
      );
      const error = await expectPlatformError(
        adapter.getOrderbook({
          sourceMarketId: CUT_50_CONDITION_ID,
          sourceOutcomeId: "1",
        })
      );
      expect(error).toMatchObject({
        operation: "getOrderbook",
        kind: "not_found",
      });
    });
  });

  describe("getPriceHistory", () => {
    it("requests a one-day window ending now and maps the points to ISO times", async () => {
      const recorded = recordingFetch(() =>
        jsonResponse(clobPricesHistoryFixture)
      );
      const adapter = createPolymarketMarketDataAdapter({
        fetchImpl: recorded.fetchImpl,
        now: () => new Date(1788444600 * 1000),
      });
      const history = await adapter.getPriceHistory({
        sourceMarketId: CUT_50_CONDITION_ID,
        sourceOutcomeId: CUT_50_YES_TOKEN,
        interval: "1d",
      });
      expect(recorded.calls.map((call) => call.url)).toEqual([
        `https://clob.polymarket.com/prices-history?market=${CUT_50_YES_TOKEN}&startTs=1788358200&endTs=1788444600&fidelity=15`,
      ]);
      expect(history).toMatchObject({
        marketId: `polymarket:${CUT_50_CONDITION_ID}`,
        outcomeId: `polymarket:${CUT_50_YES_TOKEN}`,
        platform: "polymarket",
        fetchedAt: "2026-09-03T14:10:00.000Z",
      });
      expect(history.points).toEqual([
        { time: "2026-09-03T12:30:18.000Z", price: "0.0015" },
        { time: "2026-09-03T13:00:18.000Z", price: "0.0015" },
        { time: "2026-09-03T13:30:20.000Z", price: "0.0015" },
        { time: "2026-09-03T14:00:19.000Z", price: "0.0015" },
        { time: "2026-09-03T14:08:15.000Z", price: "0.0015" },
      ]);
    });

    it("honours an explicit fidelity on a one-hour window", async () => {
      const recorded = recordingFetch(() => jsonResponse({ history: [] }));
      const adapter = createPolymarketMarketDataAdapter({
        fetchImpl: recorded.fetchImpl,
        now: () => new Date(1788444600 * 1000),
      });
      const history = await adapter.getPriceHistory({
        sourceMarketId: CUT_50_CONDITION_ID,
        sourceOutcomeId: CUT_50_YES_TOKEN,
        interval: "1h",
        fidelityMinutes: 5,
      });
      expect(recorded.calls.map((call) => call.url)).toEqual([
        `https://clob.polymarket.com/prices-history?market=${CUT_50_YES_TOKEN}&startTs=1788441000&endTs=1788444600&fidelity=5`,
      ]);
      expect(history.points).toEqual([]);
    });
  });

  describe("getMarketTrades", () => {
    it("lists public trades for the market from the Data API", async () => {
      const { adapter, calls } = createAdapter(() =>
        jsonResponse(dataTradesFixture)
      );
      const page = await adapter.getMarketTrades({
        sourceMarketId: CUT_50_CONDITION_ID,
        limit: 2,
      });
      expect(calls.map((call) => call.url)).toEqual([
        `https://data-api.polymarket.com/trades?market=${CUT_50_CONDITION_ID}&limit=2&offset=0`,
      ]);
      expect(page.items).toEqual([
        {
          id: "0xc718b1a3740ac74f87dfa9b9a9980399cd88cd804c4dd2bcda340b9d0a73a60d",
          marketId: `polymarket:${CUT_50_CONDITION_ID}`,
          outcomeId: `polymarket:${CUT_50_NO_TOKEN}`,
          platform: "polymarket",
          side: "buy",
          price: "0.999",
          size: "550",
          time: "2026-09-03T13:59:01.000Z",
          trader: "0xb0c85813a7a4428f1139ff91d3118a92c391fe7f",
        },
        {
          id: "0x35e46696133b15025ec2a54a2f2d226fbaf0e5e8cd18f7d10a964b6199a77ec1",
          marketId: `polymarket:${CUT_50_CONDITION_ID}`,
          outcomeId: `polymarket:${CUT_50_NO_TOKEN}`,
          platform: "polymarket",
          side: "buy",
          price: "0.999",
          size: "487.107",
          time: "2026-09-03T13:59:00.000Z",
          trader: "0xb0c85813a7a4428f1139ff91d3118a92c391fe7f",
        },
      ]);
      expect(page.nextCursor).toBe("2");
    });
  });
});
