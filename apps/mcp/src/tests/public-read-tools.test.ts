import { describe, expect, it } from "vitest";
import {
  callTool,
  clobUrl,
  dataUrl,
  dataV2Page,
  dataV2PositionFixture,
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

const CONDITION_ID = `0x${"a".repeat(64)}`;
const WALLET = `0x${"b".repeat(40)}`;
const TOKEN_ID = "123456789";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const POSITION = {
  proxyWallet: WALLET,
  asset: TOKEN_ID,
  conditionId: CONDITION_ID,
  size: 10,
  avgPrice: 0.4,
  initialValue: 4,
  grossInitialValue: 4.1,
  entryFeesUsdc: 0.1,
  currentValue: 6,
  cashPnl: 2,
  percentPnl: 50,
  totalBought: 10,
  realizedPnl: 0.5,
  percentRealizedPnl: 12.5,
  curPrice: 0.6,
  redeemable: false,
  mergeable: false,
  title: "Quoted upstream title",
  slug: "market",
  eventSlug: "event",
  outcome: "Yes",
  outcomeIndex: 0,
};

describe("public read tools", () => {
  setupGammaFetchStub();

  it("publishes every getter as a read-only tool", async () => {
    const response = await dispatch(
      mcpRequest(
        { jsonrpc: "2.0", id: 200, method: "tools/list" },
        { headers: { "mcp-protocol-version": PROTOCOL_VERSION } }
      ),
      devEnv
    );
    const message = await readJsonRpc(response);
    const tools = message.result?.tools as Array<{
      name: string;
      annotations?: Record<string, unknown>;
      inputSchema?: { properties?: Record<string, unknown> };
      outputSchema?: { properties?: Record<string, unknown> };
    }>;
    const expected = [
      "list_events",
      "get_market_trades",
      "get_market_quotes",
      "get_market_holders",
      "get_open_interest",
      "get_event_live_volume",
      "get_trader_leaderboard",
      "list_tags",
      "list_sports_markets",
      "get_public_profile",
      "get_wallet_positions",
      "get_wallet_activity",
      "get_closed_positions",
      "get_wallet_pnl",
      "get_wallet_portfolio_value",
    ];

    for (const name of expected) {
      const tool = tools.find((entry) => entry.name === name);
      expect(tool, name).toBeDefined();
      expect(tool?.annotations, name).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      });
    }
    for (const name of expected.filter(
      (entry) =>
        entry.includes("wallet") ||
        entry === "get_public_profile" ||
        entry === "get_closed_positions"
    )) {
      const tool = tools.find((entry) => entry.name === name);
      expect(tool?.inputSchema?.properties, name).toHaveProperty(
        "walletAddress"
      );
    }
    const listEvents = tools.find((entry) => entry.name === "list_events");
    expect(listEvents?.inputSchema?.properties).toHaveProperty("live");
    expect(listEvents?.inputSchema?.properties).not.toHaveProperty("active");

    for (const name of [
      "search_markets",
      "get_event",
      "list_events",
      "get_market_trades",
      "get_trader_leaderboard",
      "list_tags",
      "list_sports_markets",
      "get_wallet_positions",
      "get_wallet_activity",
      "get_closed_positions",
    ]) {
      const tool = tools.find((entry) => entry.name === name);
      expect(tool?.inputSchema?.properties, name).toHaveProperty("cursor");
      expect(tool?.outputSchema?.properties, name).toHaveProperty("page");
    }
  });

  it("lists event data with decimal strings and cursor metadata", async () => {
    expectGammaFetch("events", gammaUrl("/events/keyset", "limit=1"), () =>
      jsonResponse({
        events: [
          {
            id: "7",
            title: "Fed decision",
            volume: 1200.5,
            liquidity: "900.25",
            markets: [],
            tags: [],
          },
        ],
        next_cursor: "next-page",
      })
    );

    const { message } = await callTool("list_events", 201, { limit: 1 });
    const result = message.result as ToolCallResult;
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent?.events).toMatchObject([
      { volume: "1200.5", liquidity: "900.25" },
    ]);
    expect(result.structuredContent?.page).toEqual({
      returnedResults: 1,
      hasMore: true,
    });
    const cursor = (result.structuredContent?.meta as { nextCursor?: string })
      ?.nextCursor;
    expect(cursor).toEqual(expect.any(String));
    expect(cursor).not.toBe("next-page");

    expectGammaFetch(
      "events continuation",
      gammaUrl("/events/keyset", "after_cursor=next-page"),
      () => jsonResponse({ events: [], next_cursor: null })
    );
    const second = await callTool("list_events", 214, {
      limit: 1,
      cursor,
    });
    const secondResult = second.message.result as ToolCallResult;
    expect(secondResult.structuredContent?.events).toEqual([]);
    expect(secondResult.structuredContent?.page).toEqual({
      returnedResults: 0,
      hasMore: false,
    });
  });

  it("accepts a list_events cursor issued without platform when polymarket is passed explicitly", async () => {
    expectGammaFetch("events", gammaUrl("/events/keyset", "limit=1"), () =>
      jsonResponse({
        events: [
          {
            id: "7",
            title: "Fed decision",
            volume: 1200.5,
            liquidity: "900.25",
            markets: [],
            tags: [],
          },
        ],
        next_cursor: "next-page",
      })
    );
    const first = await callTool("list_events", 217, { limit: 1 });
    const firstResult = first.message.result as ToolCallResult;
    expect(firstResult.isError).toBeFalsy();
    const cursor = (
      firstResult.structuredContent?.meta as { nextCursor?: string }
    )?.nextCursor;
    expect(cursor).toEqual(expect.any(String));

    expectGammaFetch(
      "events continuation",
      gammaUrl("/events/keyset", "after_cursor=next-page"),
      () => jsonResponse({ events: [], next_cursor: null })
    );
    const second = await callTool("list_events", 218, {
      limit: 1,
      cursor,
      platform: "polymarket",
    });
    const secondResult = second.message.result as ToolCallResult;
    expect(secondResult.isError).toBeFalsy();
    expect(secondResult.structuredContent?.page).toEqual({
      returnedResults: 0,
      hasMore: false,
    });
  });

  it("combines all CLOB quote sources", async () => {
    expectGammaFetch("prices", clobUrl("/prices"), () =>
      jsonResponse({ [TOKEN_ID]: { BUY: 0.44, SELL: 0.46 } })
    );
    expectGammaFetch("midpoints", clobUrl("/midpoints"), () =>
      jsonResponse({ [TOKEN_ID]: 0.45 })
    );
    expectGammaFetch("spreads", clobUrl("/spreads"), () =>
      jsonResponse({ [TOKEN_ID]: 0.02 })
    );
    expectGammaFetch("last trade", clobUrl("/last-trades-prices"), () =>
      jsonResponse([{ token_id: TOKEN_ID, price: 0.43, side: "SELL" }])
    );

    const { message } = await callTool("get_market_quotes", 202, {
      tokenIds: [TOKEN_ID],
    });
    const result = message.result as ToolCallResult;
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent?.quotes).toEqual([
      {
        tokenId: TOKEN_ID,
        buyPrice: "0.44",
        sellPrice: "0.46",
        midpoint: "0.45",
        spread: "0.02",
        lastTradePrice: "0.43",
        lastTradeSide: "SELL",
      },
    ]);
  });

  it("returns an opaque continuation cursor for public market trades", async () => {
    expectGammaFetch("first trade page", dataUrl("/v2/trades"), () =>
      jsonResponse(
        dataV2Page([
          {
            proxy_wallet: WALLET,
            side: "BUY",
            token_id: TOKEN_ID,
            condition_id: CONDITION_ID,
            size: 10,
            price: 0.42,
            timestamp: 1_800_000_000,
          },
        ])
      )
    );

    const { message } = await callTool("get_market_trades", 207, {
      conditionIds: [CONDITION_ID],
      limit: 1,
    });
    const result = message.result as ToolCallResult;

    expect(result.structuredContent?.page).toEqual({
      returnedResults: 1,
      hasMore: true,
    });
    expect(result.structuredContent?.meta).toMatchObject({
      nextCursor: expect.any(String),
    });

    const cursor = (result.structuredContent?.meta as { nextCursor?: string })
      ?.nextCursor;
    expectGammaFetch(
      "second trade page replay",
      (url) => dataUrl("/v2/trades")(url) && !url.searchParams.has("cursor"),
      () =>
        jsonResponse(
          dataV2Page(
            [
              {
                proxy_wallet: WALLET,
                side: "BUY",
                token_id: TOKEN_ID,
                condition_id: CONDITION_ID,
                size: 10,
                price: 0.42,
                timestamp: 1_800_000_000,
              },
            ],
            "upstream-next"
          )
        )
    );
    expectGammaFetch(
      "second trade page continuation",
      dataUrl("/v2/trades", "cursor=upstream-next"),
      () => jsonResponse(dataV2Page([]))
    );
    const second = await callTool("get_market_trades", 210, {
      conditionIds: [CONDITION_ID],
      limit: 1,
      cursor,
    });
    const secondResult = second.message.result as ToolCallResult;
    expect(secondResult.structuredContent?.page).toEqual({
      returnedResults: 0,
      hasMore: false,
    });
    expect(secondResult.structuredContent?.meta).not.toHaveProperty(
      "nextCursor"
    );
  });

  it("returns an opaque continuation cursor for the trader leaderboard", async () => {
    expectGammaFetch("first leaderboard page", dataUrl("/v2/leaderboard"), () =>
      jsonResponse(
        dataV2Page([
          {
            rank: "1",
            user_id: WALLET,
            user_name: "alice",
            volume: 1000.5,
            pnl: 12.25,
          },
        ])
      )
    );

    const { message } = await callTool("get_trader_leaderboard", 208, {
      limit: 1,
    });
    const result = message.result as ToolCallResult;

    expect(result.structuredContent?.page).toEqual({
      returnedResults: 1,
      hasMore: true,
    });
    expect(result.structuredContent?.meta).toMatchObject({
      nextCursor: expect.any(String),
    });

    const cursor = (result.structuredContent?.meta as { nextCursor?: string })
      ?.nextCursor;
    expectGammaFetch(
      "second leaderboard page replay",
      (url) =>
        dataUrl("/v2/leaderboard")(url) && !url.searchParams.has("cursor"),
      () =>
        jsonResponse(
          dataV2Page(
            [
              {
                rank: "1",
                user_id: WALLET,
                user_name: "alice",
                volume: 1000.5,
                pnl: 12.25,
              },
            ],
            "upstream-next"
          )
        )
    );
    expectGammaFetch(
      "second leaderboard page continuation",
      dataUrl("/v2/leaderboard", "cursor=upstream-next"),
      () => jsonResponse(dataV2Page([]))
    );
    const second = await callTool("get_trader_leaderboard", 2080, {
      limit: 1,
      cursor,
    });
    const secondResult = second.message.result as ToolCallResult;
    expect(secondResult.structuredContent?.page).toEqual({
      returnedResults: 0,
      hasMore: false,
    });
    expect(secondResult.structuredContent?.meta).not.toHaveProperty(
      "nextCursor"
    );
  });

  it("returns an opaque continuation cursor for tags", async () => {
    expectGammaFetch("first tag page", gammaUrl("/tags", "offset=0"), () =>
      jsonResponse([{ id: "1", label: "Economics", slug: "economics" }])
    );

    const { message } = await callTool("list_tags", 209, { limit: 1 });
    const result = message.result as ToolCallResult;

    expect(result.structuredContent?.page).toEqual({
      returnedResults: 1,
      hasMore: true,
    });
    expect(result.structuredContent?.meta).toMatchObject({
      nextCursor: expect.any(String),
    });

    const cursor = (result.structuredContent?.meta as { nextCursor?: string })
      ?.nextCursor;
    expectGammaFetch("second tag page", gammaUrl("/tags", "offset=1"), () =>
      jsonResponse([])
    );
    const second = await callTool("list_tags", 2090, {
      limit: 1,
      cursor,
    });
    const secondResult = second.message.result as ToolCallResult;
    expect(secondResult.structuredContent?.page).toEqual({
      returnedResults: 0,
      hasMore: false,
    });
    expect(secondResult.structuredContent?.meta).not.toHaveProperty(
      "nextCursor"
    );
  });

  it("continues sports teams and markets with one composite cursor", async () => {
    const metadata = () =>
      jsonResponse([{ sport: "football", tags: "4", series: "8" }]);
    const marketTypes = () => jsonResponse({ marketTypes: ["moneyline"] });
    const tag = () => jsonResponse({ id: "4", label: "NFL", slug: "nfl" });
    expectGammaFetch("sports metadata first", gammaUrl("/sports"), metadata);
    expectGammaFetch(
      "sports market types first",
      gammaUrl("/sports/market-types"),
      marketTypes
    );
    expectGammaFetch("sports teams first", gammaUrl("/teams", "offset=0"), () =>
      jsonResponse([
        { id: "1", name: "Team A", league: "nfl", abbreviation: "A" },
      ])
    );
    expectGammaFetch("sports tag first", gammaUrl("/tags/slug/nfl"), tag);
    expectGammaFetch(
      "sports markets first",
      gammaUrl("/markets/keyset", "limit=1"),
      () =>
        jsonResponse({
          markets: [
            {
              id: "5",
              slug: "team-a-win",
              question: "Will Team A win?",
              conditionId: CONDITION_ID,
              outcomes: '["Yes","No"]',
              outcomePrices: '["0.6","0.4"]',
              clobTokenIds: `["${TOKEN_ID}","987654321"]`,
            },
          ],
          next_cursor: "sports-next",
        })
    );

    const first = await callTool("list_sports_markets", 215, {
      league: "nfl",
      limit: 1,
    });
    const firstResult = first.message.result as ToolCallResult;
    expect(firstResult.structuredContent?.page).toEqual({
      returnedResults: 2,
      hasMore: true,
    });
    const cursor = (
      firstResult.structuredContent?.meta as { nextCursor?: string }
    )?.nextCursor;
    expect(cursor).toEqual(expect.any(String));
    expect(cursor).not.toBe("sports-next");

    expectGammaFetch("sports metadata second", gammaUrl("/sports"), metadata);
    expectGammaFetch(
      "sports market types second",
      gammaUrl("/sports/market-types"),
      marketTypes
    );
    expectGammaFetch(
      "sports teams second",
      gammaUrl("/teams", "offset=1"),
      () => jsonResponse([])
    );
    expectGammaFetch("sports tag second", gammaUrl("/tags/slug/nfl"), tag);
    expectGammaFetch(
      "sports markets second",
      gammaUrl("/markets/keyset", "after_cursor=sports-next"),
      () => jsonResponse({ markets: [], next_cursor: null })
    );

    const second = await callTool("list_sports_markets", 216, {
      league: "nfl",
      limit: 1,
      cursor,
    });
    const secondResult = second.message.result as ToolCallResult;
    expect(secondResult.structuredContent?.page).toEqual({
      returnedResults: 0,
      hasMore: false,
    });
    expect(secondResult.structuredContent?.meta).not.toHaveProperty(
      "nextCursor"
    );
  });

  it("requires an explicit wallet address for public wallet data", async () => {
    const { message } = await callTool("get_wallet_positions", 203, {});
    const result = message.result as ToolCallResult;
    expect(result.isError).toBe(true);
    expect(result.content?.[0]?.text).toContain("Input validation error");
  });

  it("returns projected positions with decimal strings", async () => {
    expectGammaFetch(
      "positions",
      dataUrl("/v2/positions", `user=${WALLET}`),
      () => jsonResponse(dataV2Page([dataV2PositionFixture(POSITION)]))
    );

    const { message } = await callTool("get_wallet_positions", 204, {
      walletAddress: WALLET,
    });
    const result = message.result as ToolCallResult;
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent?.positions).toMatchObject([
      {
        size: "10",
        avgPrice: "0.4",
        currentValue: "6",
        cashPnl: "2",
        grossInitialValue: "4.1",
        entryFeesUsdc: "0.1",
      },
    ]);
  });

  it("paginates wallet positions with an opaque cursor", async () => {
    expectGammaFetch(
      "first wallet position page",
      dataUrl("/v2/positions", "status=OPEN"),
      () => jsonResponse(dataV2Page([dataV2PositionFixture(POSITION)]))
    );

    const { message } = await callTool("get_wallet_positions", 211, {
      walletAddress: WALLET,
      limit: 1,
    });
    const result = message.result as ToolCallResult;

    expect(result.structuredContent?.page).toEqual({
      returnedResults: 1,
      hasMore: true,
    });
    expect(result.structuredContent?.meta).toMatchObject({
      nextCursor: expect.any(String),
    });

    const cursor = (result.structuredContent?.meta as { nextCursor?: string })
      ?.nextCursor;
    expectGammaFetch(
      "second wallet position page replay",
      (url) =>
        dataUrl("/v2/positions", "status=OPEN")(url) &&
        !url.searchParams.has("cursor"),
      () =>
        jsonResponse(
          dataV2Page([dataV2PositionFixture(POSITION)], "upstream-next")
        )
    );
    expectGammaFetch(
      "second wallet position page continuation",
      dataUrl("/v2/positions", "cursor=upstream-next"),
      () => jsonResponse(dataV2Page([]))
    );
    const second = await callTool("get_wallet_positions", 2110, {
      walletAddress: WALLET,
      limit: 1,
      cursor,
    });
    const secondResult = second.message.result as ToolCallResult;
    expect(secondResult.structuredContent?.page).toEqual({
      returnedResults: 0,
      hasMore: false,
    });
    expect(secondResult.structuredContent?.meta).not.toHaveProperty(
      "nextCursor"
    );
  });

  it("paginates wallet activity with an opaque cursor", async () => {
    expectGammaFetch(
      "first wallet activity page",
      dataUrl("/v2/activity"),
      () =>
        jsonResponse(
          dataV2Page([
            {
              proxy_wallet: WALLET,
              timestamp: 1_800_000_000,
              type: "TRADE",
              condition_id: CONDITION_ID,
              token_id: TOKEN_ID,
              size: 2,
              price: 0.5,
            },
          ])
        )
    );

    const { message } = await callTool("get_wallet_activity", 212, {
      walletAddress: WALLET,
      limit: 1,
    });
    const result = message.result as ToolCallResult;

    expect(result.structuredContent?.page).toEqual({
      returnedResults: 1,
      hasMore: true,
    });
    expect(result.structuredContent?.meta).toMatchObject({
      nextCursor: expect.any(String),
    });

    const cursor = (result.structuredContent?.meta as { nextCursor?: string })
      ?.nextCursor;
    expectGammaFetch(
      "second wallet activity page replay",
      (url) => dataUrl("/v2/activity")(url) && !url.searchParams.has("cursor"),
      () =>
        jsonResponse(
          dataV2Page(
            [
              {
                proxy_wallet: WALLET,
                timestamp: 1_800_000_000,
                type: "TRADE",
                condition_id: CONDITION_ID,
                token_id: TOKEN_ID,
                size: 2,
                price: 0.5,
              },
            ],
            "upstream-next"
          )
        )
    );
    expectGammaFetch(
      "second wallet activity page continuation",
      dataUrl("/v2/activity", "cursor=upstream-next"),
      () => jsonResponse(dataV2Page([]))
    );
    const second = await callTool("get_wallet_activity", 2120, {
      walletAddress: WALLET,
      limit: 1,
      cursor,
    });
    const secondResult = second.message.result as ToolCallResult;
    expect(secondResult.structuredContent?.page).toEqual({
      returnedResults: 0,
      hasMore: false,
    });
    expect(secondResult.structuredContent?.meta).not.toHaveProperty(
      "nextCursor"
    );
  });

  it("paginates closed wallet positions with an opaque cursor", async () => {
    expectGammaFetch(
      "first closed position page",
      dataUrl("/v2/positions", "status=CLOSED"),
      () =>
        jsonResponse(
          dataV2Page([
            {
              proxy_wallet: WALLET,
              token_id: TOKEN_ID,
              condition_id: CONDITION_ID,
              avg_price: 0.4,
              total_size: 10,
              realized_pnl: 2,
              current_price: 1,
              last_event_at: 1_800_000_000,
            },
          ])
        )
    );

    const { message } = await callTool("get_closed_positions", 213, {
      walletAddress: WALLET,
      limit: 1,
    });
    const result = message.result as ToolCallResult;

    expect(result.structuredContent?.page).toEqual({
      returnedResults: 1,
      hasMore: true,
    });
    expect(result.structuredContent?.meta).toMatchObject({
      nextCursor: expect.any(String),
    });

    const cursor = (result.structuredContent?.meta as { nextCursor?: string })
      ?.nextCursor;
    expectGammaFetch(
      "second closed position page replay",
      (url) =>
        dataUrl("/v2/positions", "status=CLOSED")(url) &&
        !url.searchParams.has("cursor"),
      () =>
        jsonResponse(
          dataV2Page(
            [
              {
                proxy_wallet: WALLET,
                token_id: TOKEN_ID,
                condition_id: CONDITION_ID,
                avg_price: 0.4,
                total_size: 10,
                realized_pnl: 2,
                current_price: 1,
                last_event_at: 1_800_000_000,
              },
            ],
            "upstream-next"
          )
        )
    );
    expectGammaFetch(
      "second closed position page continuation",
      dataUrl("/v2/positions", "cursor=upstream-next"),
      () => jsonResponse(dataV2Page([]))
    );
    const second = await callTool("get_closed_positions", 2130, {
      walletAddress: WALLET,
      limit: 1,
      cursor,
    });
    const secondResult = second.message.result as ToolCallResult;
    expect(secondResult.structuredContent?.page).toEqual({
      returnedResults: 0,
      hasMore: false,
    });
    expect(secondResult.structuredContent?.meta).not.toHaveProperty(
      "nextCursor"
    );
  });

  it("separates all-time PnL from current-position metrics", async () => {
    expectGammaFetch(
      "pnl positions",
      dataUrl("/v2/positions", "limit=500"),
      () =>
        jsonResponse(
          dataV2Page(
            [
              POSITION,
              {
                ...POSITION,
                asset: "987654321",
                initialValue: 3,
                currentValue: 2,
                cashPnl: -1,
                realizedPnl: 0.25,
              },
            ].map(dataV2PositionFixture)
          )
        )
    );
    expectGammaFetch(
      "all-time PnL",
      dataUrl("/v2/leaderboard", "time_period=ALL"),
      () =>
        jsonResponse({
          data: {
            rank_pnl: 7,
            rank_volume: 9,
            user_id: WALLET,
            volume: 100.5,
            pnl: 9.25,
          },
        })
    );

    const { message } = await callTool("get_wallet_pnl", 205, {
      walletAddress: WALLET,
    });
    const result = message.result as ToolCallResult;
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent?.pnl).toEqual({
      walletAddress: WALLET,
      allTime: {
        available: true,
        category: "OVERALL",
        timePeriod: "ALL",
        rank: "7",
        totalPnl: "9.25",
        volume: "100.5",
      },
      currentPositions: {
        positionCount: 2,
        initialValue: "7",
        currentValue: "8",
        cashPnl: "1",
        realizedPnl: "0.75",
        totalPnl: "1.75",
        roiPercent: "25",
        winningPositions: 1,
        losingPositions: 1,
      },
    });
  });

  it("reports all-time PnL when a wallet has no current positions", async () => {
    expectGammaFetch(
      "empty current positions",
      dataUrl("/v2/positions", "limit=500"),
      () => jsonResponse(dataV2Page([]))
    );
    expectGammaFetch(
      "all-time leaderboard PnL",
      dataUrl("/v2/leaderboard", "time_period=ALL"),
      () =>
        jsonResponse({
          data: {
            rank_pnl: 2303533,
            rank_volume: 2000000,
            user_id: WALLET,
            user_name: "tagme",
            volume: 1083.804636,
            pnl: -37.906702304018,
            profile_image: "",
            x_username: "",
            verified: false,
          },
        })
    );

    const { message } = await callTool("get_wallet_pnl", 206, {
      walletAddress: WALLET,
    });
    const result = message.result as ToolCallResult;
    expect(result.isError).toBeFalsy();
    expect(result.content?.[0]?.text).toBe(
      "Wallet all-time PnL is -37.906702304018. It currently has 0 open positions."
    );
    expect(result.structuredContent?.pnl).toEqual({
      walletAddress: WALLET,
      allTime: {
        available: true,
        category: "OVERALL",
        timePeriod: "ALL",
        rank: "2303533",
        totalPnl: "-37.906702304018",
        volume: "1083.804636",
      },
      currentPositions: {
        positionCount: 0,
        initialValue: "0",
        currentValue: "0",
        cashPnl: "0",
        realizedPnl: "0",
        totalPnl: "0",
        roiPercent: "0",
        winningPositions: 0,
        losingPositions: 0,
      },
    });
  });
});
