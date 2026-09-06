import {
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { createMcpHandler } from "agents/mcp/server";
import { describe, expect, it } from "vitest";
import {
  FREE_MCP_PLAN,
  MARKETS_READ_SCOPE,
  RESERVED_TRADING_SCOPES,
  resolveRequestedScopes,
  validateMcpAuthProps,
} from "../auth/scopes";
import { requestContext } from "../context";
import { toolLimiterFor } from "../quota";
import { createKnowwMcpServer } from "../server";
import { KNOWW_MCP_TOOL_NAMES, TRADING_TOOL_NAMES } from "../tool-catalog";
import {
  clobUrl,
  dataUrl,
  devEnv,
  dispatch,
  expectGammaFetch,
  mcpRequest,
  PROTOCOL_VERSION,
  readJsonRpc,
  setupGammaFetchStub,
  type ToolCallResult,
} from "./helpers";

// Hardhat account #1: a public throwaway key that never holds funds.
const WALLET = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8";
const CONDITION_ID = `0x${"c".repeat(64)}`;
const YES_TOKEN = "111111111111111111111";
const NO_TOKEN = "222222222222222222222";
const IDENTITY = {
  kind: "wallet",
  address: WALLET,
  accountType: "eoa",
} as const;
const MARKET_ID = `polymarket:${CONDITION_ID}`;
const YES_OUTCOME_ID = `polymarket:${YES_TOKEN}`;
const TRADING_SCOPES = [...RESERVED_TRADING_SCOPES];

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const CLOB_MARKET = {
  condition_id: CONDITION_ID,
  active: true,
  closed: false,
  archived: false,
  accepting_orders: true,
  enable_order_book: true,
  minimum_order_size: 5,
  minimum_tick_size: 0.01,
  neg_risk: false,
  tokens: [
    { token_id: YES_TOKEN, outcome: "Yes", price: 0.4 },
    { token_id: NO_TOKEN, outcome: "No", price: 0.6 },
  ],
};

const POSITION = {
  proxyWallet: WALLET,
  asset: YES_TOKEN,
  conditionId: CONDITION_ID,
  size: 10,
  avgPrice: 0.4,
  initialValue: 4,
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

/** The same Worker handler, but with the trading tools registered. */
const exposedHandler = createMcpHandler(
  () => createKnowwMcpServer({ exposeTradingTools: true }),
  {
    route: "/mcp",
    allowedHostnames: ["localhost", "127.0.0.1"],
    allowedOriginHostnames: ["localhost", "127.0.0.1"],
  }
);

async function exposedRpc(body: unknown, scopes: readonly string[]) {
  const ctx = createExecutionContext();
  const response = await requestContext.run(
    {
      requestId: "trading-test",
      principal: {
        authMethod: "dev-bypass",
        id: "local-development",
        plan: FREE_MCP_PLAN,
        scopes: [...scopes],
      },
      toolRateLimiter: toolLimiterFor(devEnv, FREE_MCP_PLAN),
    },
    () =>
      exposedHandler(
        mcpRequest(body, {
          headers: { "mcp-protocol-version": PROTOCOL_VERSION },
        }),
        devEnv,
        ctx
      )
  );
  await waitOnExecutionContext(ctx);
  return readJsonRpc(response);
}

let nextId = 9000;

async function callExposed(
  name: string,
  args: Record<string, unknown>,
  scopes: readonly string[] = TRADING_SCOPES
): Promise<ToolCallResult> {
  const body = await exposedRpc(
    {
      jsonrpc: "2.0",
      id: nextId++,
      method: "tools/call",
      params: { name, arguments: args },
    },
    scopes
  );
  return body.result as ToolCallResult;
}

function firstText(result: ToolCallResult): string {
  return result.content?.[0]?.text ?? "";
}

describe("trading tools", () => {
  setupGammaFetchStub();

  it("stay off the public tool list", async () => {
    const response = await dispatch(
      mcpRequest(
        { jsonrpc: "2.0", id: 9001, method: "tools/list" },
        { headers: { "mcp-protocol-version": PROTOCOL_VERSION } }
      ),
      devEnv
    );
    const body = await readJsonRpc(response);
    const names = (body.result as { tools: { name: string }[] }).tools.map(
      (tool) => tool.name
    );
    for (const tradingTool of TRADING_TOOL_NAMES) {
      expect(names).not.toContain(tradingTool);
    }
    expect(names).toEqual(KNOWW_MCP_TOOL_NAMES);
  });

  it("cannot be called on the public server", async () => {
    const response = await dispatch(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 9002,
          method: "tools/call",
          params: {
            name: "get_trading_connection",
            arguments: { platform: "polymarket", identity: IDENTITY },
          },
        },
        { headers: { "mcp-protocol-version": PROTOCOL_VERSION } }
      ),
      devEnv
    );
    const body = await readJsonRpc(response);
    const rendered = JSON.stringify(body);
    expect(rendered).toMatch(/not found|unknown/i);
    expect(rendered).not.toContain("connected");
  });

  it("are advertised in order when exposed, with honest annotations", async () => {
    const body = await exposedRpc(
      { jsonrpc: "2.0", id: 9003, method: "tools/list" },
      TRADING_SCOPES
    );
    const tools = (
      body.result as {
        tools: { name: string; annotations?: Record<string, unknown> }[];
      }
    ).tools;
    expect(tools.map((tool) => tool.name)).toEqual([
      ...KNOWW_MCP_TOOL_NAMES,
      ...TRADING_TOOL_NAMES,
    ]);
    const placeOrder = tools.find((tool) => tool.name === "place_order");
    expect(placeOrder?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
    });
    const positions = tools.find(
      (tool) => tool.name === "get_account_positions"
    );
    expect(positions?.annotations).toMatchObject({ readOnlyHint: true });
  });

  it("refuse a caller that only holds markets:read", async () => {
    const result = await callExposed(
      "get_account_positions",
      { platform: "polymarket", identity: IDENTITY },
      [MARKETS_READ_SCOPE]
    );
    expect(result.isError).toBe(true);
    expect(firstText(result)).toContain("FORBIDDEN");
    expect(firstText(result)).toContain("account:read");
  });

  it("report an unbound wallet as connected=false without calling upstream", async () => {
    const result = await callExposed("get_trading_connection", {
      platform: "polymarket",
      identity: IDENTITY,
    });
    expect(result.isError).toBeFalsy();
    const structured = result.structuredContent as {
      connection: {
        connected: boolean;
        canTrade: boolean;
        reasons: string[];
        platformDetails?: { tradingAddress?: string };
      };
      regionPolicy: { blocked: string[]; closeOnly: string[] };
    };
    expect(structured.connection.connected).toBe(false);
    expect(structured.connection.canTrade).toBe(false);
    expect(structured.connection.reasons).toEqual([
      "no_signer",
      "no_credentials",
    ]);
    expect(
      structured.connection.platformDetails?.tradingAddress?.toLowerCase()
    ).toBe(WALLET);
    expect(Array.isArray(structured.regionPolicy.blocked)).toBe(true);
  });

  it("read positions for an identity through the public Data API", async () => {
    expectGammaFetch("positions", dataUrl("/positions"), () =>
      jsonResponse([POSITION])
    );
    const result = await callExposed("get_account_positions", {
      platform: "polymarket",
      identity: IDENTITY,
    });
    expect(result.isError).toBeFalsy();
    const structured = result.structuredContent as {
      platform: string;
      positions: { marketId: string; outcomeId: string; size: string }[];
    };
    expect(structured.platform).toBe("polymarket");
    expect(structured.positions).toHaveLength(1);
    expect(structured.positions[0]?.marketId).toBe(MARKET_ID);
    expect(structured.positions[0]?.outcomeId).toBe(YES_OUTCOME_ID);
    expect(structured.positions[0]?.size).toBe("10");
  });

  it("page activity for an identity", async () => {
    expectGammaFetch("activity", dataUrl("/activity"), () => jsonResponse([]));
    const result = await callExposed("get_account_activity", {
      platform: "polymarket",
      identity: IDENTITY,
      limit: 5,
    });
    expect(result.isError).toBeFalsy();
    const structured = result.structuredContent as {
      activity: unknown[];
      meta: { nextCursor?: string; truncated?: boolean };
    };
    expect(structured.activity).toEqual([]);
    expect(structured.meta.nextCursor).toBeUndefined();
  });

  it("answer UNAUTHENTICATED for orders and cancels without a bound signer", async () => {
    const orders = await callExposed("get_account_orders", {
      platform: "polymarket",
      identity: IDENTITY,
    });
    expect(orders.isError).toBe(true);
    expect(firstText(orders)).toContain("UNAUTHENTICATED");

    const cancel = await callExposed("cancel_order", {
      platform: "polymarket",
      identity: IDENTITY,
      orderId: "0xorder",
      idempotencyKey: "trading-test-cancel-0001",
    });
    expect(cancel.isError).toBe(true);
    expect(firstText(cancel)).toContain("UNAUTHENTICATED");
  });

  it("preview a limit order into a draft, then refuse to place it unsigned", async () => {
    expectGammaFetch("clob market", clobUrl(`/markets/${CONDITION_ID}`), () =>
      jsonResponse(CLOB_MARKET)
    );
    const preview = await callExposed("preview_order", {
      platform: "polymarket",
      identity: IDENTITY,
      marketId: MARKET_ID,
      outcomeId: YES_OUTCOME_ID,
      side: "buy",
      orderType: "limit",
      timeInForce: "gtc",
      price: "0.40",
      quantity: { kind: "shares", value: "10" },
    });
    expect(preview.isError).toBeFalsy();
    const { draft } = preview.structuredContent as {
      draft: {
        draftId: string;
        platform: string;
        marketStatus: string;
        eligibility: { eligible: boolean; reasons: string[] };
        quote: { notional: { value: string; unit: string } };
        intent: { schemaVersion: string; identity: { platform: string } };
      };
    };
    expect(draft.platform).toBe("polymarket");
    expect(draft.marketStatus).toBe("active");
    expect(draft.eligibility.eligible).toBe(true);
    expect(Number(draft.quote.notional.value)).toBe(4);
    expect(draft.intent.identity.platform).toBe("polymarket");
    expect(firstText(preview)).toContain(draft.draftId);

    const placed = await callExposed("place_order", {
      platform: "polymarket",
      draftId: draft.draftId,
      idempotencyKey: "trading-test-place-0001",
    });
    expect(placed.isError).toBe(true);
    expect(firstText(placed)).toContain("UNAUTHENTICATED");
  });

  it("reject malformed order input before touching the adapter", async () => {
    const result = await callExposed("preview_order", {
      platform: "polymarket",
      identity: IDENTITY,
      marketId: MARKET_ID,
      outcomeId: YES_OUTCOME_ID,
      side: "buy",
      orderType: "limit",
      timeInForce: "gtc",
      price: "0.4",
      quantity: { kind: "shares", value: "ten" },
    });
    expect(result.isError).toBe(true);
  });

  it("refuse a platform that is not enabled", async () => {
    const result = await callExposed("get_account_positions", {
      platform: "kalshi",
      identity: IDENTITY,
    });
    expect(result.isError).toBe(true);
    expect(firstText(result)).toContain("PLATFORM_DISABLED");
  });

  it("keep the reserved scopes ungranted", () => {
    for (const scope of RESERVED_TRADING_SCOPES) {
      expect(() => resolveRequestedScopes([scope])).toThrow(
        /Unsupported OAuth scope/
      );
      expect(
        validateMcpAuthProps({
          authMethod: "google-oidc",
          googleSubject: "subject",
          principalId: "principal",
          plan: FREE_MCP_PLAN,
          scopes: [scope],
        })
      ).toBeNull();
    }
  });
});
