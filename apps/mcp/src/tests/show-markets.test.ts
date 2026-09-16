import { describe, expect, it } from "vitest";
import { requestContext } from "../context";
import { handleShowMarkets } from "../tools/show-markets";
import { MARKETS_RESOURCE_URI } from "../ui/markets";
import {
  callTool,
  devEnv,
  dispatch,
  expectGammaFetch,
  gammaUrl,
  mcpRequest,
  PROTOCOL_VERSION,
  readJsonRpc,
  setupGammaFetchStub,
  type ToolCallResult,
} from "./helpers";

const market = {
  id: "42",
  slug: "fed-cut-next-month",
  conditionId: `0x${"a".repeat(64)}`,
  question: "Will the Fed cut rates next month?",
  active: true,
  closed: false,
  endDate: "2099-12-31T00:00:00Z",
  outcomes: '["Yes","No"]',
  outcomePrices: '["0.145","0.855"]',
  clobTokenIds: '["111","222"]',
  events: [{ slug: "fed-meeting", title: "Fed meeting" }],
};

function mockMarket(slug: string, value: unknown = { ...market, slug }) {
  expectGammaFetch(slug, gammaUrl("/markets", `slug=${slug}`), () =>
    Response.json([value])
  );
}

async function rpc(method: string, params?: unknown) {
  return readJsonRpc(
    await dispatch(
      mcpRequest(
        { jsonrpc: "2.0", id: 50, method, params },
        {
          headers: { "mcp-protocol-version": PROTOCOL_VERSION },
        }
      ),
      devEnv
    )
  );
}

describe("show_markets MCP App", () => {
  setupGammaFetchStub();

  it("advertises the UI only on the display tool and serves its self-contained resource", async () => {
    const listing = await rpc("tools/list");
    const tools = listing.result?.tools as Array<{
      name: string;
      _meta?: Record<string, unknown>;
      annotations: Record<string, unknown>;
      description: string;
    }>;
    const display = tools.find((tool) => tool.name === "show_markets");
    expect(display?._meta?.ui).toEqual({
      resourceUri: MARKETS_RESOURCE_URI,
      visibility: ["model", "app"],
    });
    expect(display?.annotations.readOnlyHint).toBe(true);
    expect(
      tools.find((tool) => tool.name === "search_markets")?._meta?.ui
    ).toBeUndefined();
    expect(
      tools.find((tool) => tool.name === "search_markets")?.description
    ).toContain("future event");
    const resources = await rpc("resources/list");
    expect(resources.result?.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ uri: MARKETS_RESOURCE_URI }),
      ])
    );
    const resource = await rpc("resources/read", { uri: MARKETS_RESOURCE_URI });
    const contents = resource.result?.contents as Array<{
      mimeType: string;
      text: string;
      _meta: unknown;
    }>;
    expect(contents[0].mimeType).toBe("text/html;profile=mcp-app");
    expect(contents[0].text).toContain("ui/initialize");
    expect(contents[0]._meta).toMatchObject({
      ui: { csp: { connectDomains: [], resourceDomains: [] } },
    });
  });

  it("fetches authoritative prices, deduplicates selection and links to the parent event", async () => {
    mockMarket(market.slug);
    const { message } = await callTool("show_markets", 1, {
      slugs: [market.slug, market.slug],
    });
    const result = message.result as ToolCallResult;
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      markets: [
        {
          id: "42",
          url: `https://knoww.app/events/detail/fed-meeting?conditionId=${market.conditionId}`,
          outcomes: [
            {
              name: "Yes",
              price: "0.145",
              priceLabel: "14.5%",
              tokenId: "111",
            },
            { name: "No", priceLabel: "85.5%" },
          ],
        },
      ],
      omittedCount: 0,
      unavailableCount: 0,
    });
    expect(result.content?.[0].text).toContain("14.5%");
    expect(result.content?.[0].text).toContain(
      "https://knoww.app/events/detail/fed-meeting"
    );
  });

  it("keeps all three selected markets and their own outcome prices and links", async () => {
    const slugs = [
      "bitcoin-above-74k",
      "bitcoin-above-76k",
      "bitcoin-above-78k",
    ];
    for (const [index, slug] of slugs.entries()) {
      mockMarket(slug, {
        ...market,
        slug,
        conditionId: `0x${String(index + 1).repeat(64)}`,
        outcomes: '["No","Yes"]',
        outcomePrices: '["0.66","0.34"]',
        volume: "135415.74727400002",
      });
    }
    const { message } = await callTool("show_markets", 21, { slugs });
    expect(message.result?.structuredContent).toMatchObject({
      markets: slugs.map((slug, index) => ({
        slug,
        url: `https://knoww.app/events/detail/fed-meeting?conditionId=0x${String(index + 1).repeat(64)}`,
        volumeLabel: "135,415.75",
        outcomes: [
          { name: "No", priceLabel: "66.0%", tokenId: "111" },
          { name: "Yes", priceLabel: "34.0%", tokenId: "222" },
        ],
      })),
      selectionSlugs: slugs,
      omittedCount: 0,
      unavailableCount: 0,
    });
  });

  it.each([undefined, "invalid&side=BUY"])(
    "keeps an event-only link without a valid condition id: %s",
    async (conditionId) => {
      mockMarket(market.slug, { ...market, conditionId });
      const { message } = await callTool("show_markets", 22, {
        slugs: [market.slug],
      });
      expect(message.result?.structuredContent).toMatchObject({
        markets: [{ url: "https://knoww.app/events/detail/fed-meeting" }],
      });
    }
  );

  it("preserves nonzero and noncertain probabilities at the display boundaries", async () => {
    mockMarket(market.slug, {
      ...market,
      outcomePrices: '["0.0004","0.9996"]',
    });
    const { message } = await callTool("show_markets", 20, {
      slugs: [market.slug],
    });
    expect(message.result?.structuredContent).toMatchObject({
      markets: [
        { outcomes: [{ priceLabel: "<0.1%" }, { priceLabel: ">99.9%" }] },
      ],
    });
    expect((message.result as ToolCallResult).content?.[0].text).toContain(
      "Yes <0.1%, No >99.9%"
    );
  });

  it.each([
    { closed: true, umaResolutionStatus: "resolved" },
    { active: false },
    { archived: true },
    { closed: true, endDate: "2000-01-01T00:00:00Z" },
  ])("omits an ineligible market: %j", async (overrides) => {
    mockMarket(market.slug, { ...market, ...overrides });
    const { message } = await callTool("show_markets", 2, {
      slugs: [market.slug],
    });
    expect(message.result?.structuredContent).toMatchObject({
      markets: [],
      omittedCount: 1,
    });
  });

  it("shows open Fed contracts even after their date-only end timestamp has passed", async () => {
    const slugs = [
      "will-the-fed-decrease-interest-rates-by-25-bps-after-the-september-2026-meeting-586",
      "will-the-fed-decrease-interest-rates-by-50-bps-after-the-september-2026-meeting-863",
      "will-the-fed-increase-interest-rates-by-25-bps-after-the-september-2026-meeting-649",
    ];
    for (const slug of slugs) {
      mockMarket(slug, {
        ...market,
        slug,
        // Gamma can keep a market open after its listed end date.
        endDate: "2000-01-01T00:00:00Z",
        acceptingOrders: true,
      });
    }
    const { message } = await callTool("show_markets", 23, { slugs });
    expect(message.result?.structuredContent).toMatchObject({
      markets: slugs.map((slug) => ({ slug, status: "active" })),
      omittedCount: 0,
      unavailableCount: 0,
    });
  });

  it("renders an empty selection without fetching upstream", async () => {
    const { message } = await callTool("show_markets", 3, { slugs: [] });
    expect(message.result?.structuredContent).toMatchObject({
      markets: [],
      unavailableCount: 0,
    });
  });

  it.each([
    { slugs: ["../private"] },
    { slugs: ["https://other.example"] },
    { slugs: ["one", "two", "three", "four"] },
    { slugs: "one" },
  ])("rejects invalid selections before upstream calls: %j", async (args) => {
    const { message } = await callTool("show_markets", 4, args);
    expect(
      message.error !== undefined || message.result?.isError === true
    ).toBe(true);
  });

  it("keeps successful cards and reports partial upstream failure", async () => {
    mockMarket(market.slug);
    expectGammaFetch(
      "failed",
      gammaUrl("/markets", "slug=failed"),
      () => new Response("private upstream diagnostics", { status: 503 })
    );
    const { message } = await callTool("show_markets", 5, {
      slugs: [market.slug, "failed"],
    });
    expect(message.result?.structuredContent).toMatchObject({
      unavailableCount: 1,
      meta: { truncated: true },
    });
    expect(JSON.stringify(message)).not.toContain(
      "private upstream diagnostics"
    );
  });

  it("rejects an upstream identifier mismatch and does not expose diagnostics", async () => {
    mockMarket("other", market);
    const { message } = await callTool("show_markets", 6, { slugs: ["other"] });
    expect(message.result?.isError).toBe(true);
    expect((message.result as ToolCallResult).content?.[0].text).toContain(
      "UPSTREAM_UNAVAILABLE"
    );
  });

  it("rechecks authentication, scope and per-tool quota before fetching", async () => {
    const context = {
      mcpReq: { signal: new AbortController().signal },
    } as Parameters<typeof handleShowMarkets>[1];
    expect(await handleShowMarkets({ slugs: [] }, context)).toMatchObject({
      isError: true,
    });
    for (const scopes of [[], ["markets:read"]]) {
      const keys: string[] = [];
      const result = await requestContext.run(
        {
          requestId: "show-test",
          principal: {
            id: "local-test",
            authMethod: "dev-bypass",
            plan: "free",
            scopes,
          },
          toolRateLimiter: {
            limit: async ({ key }: { key: string }) => {
              keys.push(key);
              return { success: false };
            },
          } as RateLimit,
        },
        () => handleShowMarkets({ slugs: [market.slug] }, context)
      );
      expect(result).toMatchObject({ isError: true });
      expect(result.content[0].text).toContain(
        scopes.length ? "RATE_LIMITED" : "FORBIDDEN"
      );
      expect(keys).toEqual(
        scopes.length ? ["free:local-test:show_markets"] : []
      );
    }
  });
});
