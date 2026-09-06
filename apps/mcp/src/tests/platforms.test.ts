import { describe, expect, it } from "vitest";
import { KNOWW_MCP_TOOL_NAMES, POLYMARKET_TOOL_ALIASES } from "../tool-catalog";
import {
  callTool,
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

/**
 * Contract tests for the aggregator surface of the MCP server: the platform
 * argument, canonical ids, list_platforms, and the permanent polymarket_*
 * aliases. Decisions come from
 * docs/decisions/2026-09-03-aggregator-platform-adapters.md (M5) and the
 * naming policy in docs/single-api-layer.md.
 */

const CONDITION_ID = `0x${"cd".repeat(32)}`;

/** Copied from the published Polymarket capability table, not from the adapter. */
const POLYMARKET_CAPABILITIES = {
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

interface ListedTool {
  name: string;
  description?: string;
}

async function listTools(id: number): Promise<ListedTool[]> {
  const response = await dispatch(
    mcpRequest(
      { jsonrpc: "2.0", id, method: "tools/list" },
      { headers: { "mcp-protocol-version": PROTOCOL_VERSION } }
    ),
    devEnv
  );
  const message = await readJsonRpc(response);
  expect(message.error).toBeUndefined();
  return message.result?.tools as ListedTool[];
}

/** Drops the per-call request id and timestamp so two calls can be compared. */
function stablePayload(content: Record<string, unknown> | undefined) {
  const { meta, ...rest } = content ?? {};
  const {
    requestId: _requestId,
    asOf: _asOf,
    ...stableMeta
  } = (meta ?? {}) as Record<string, unknown>;
  return { ...rest, meta: stableMeta };
}

function errorText(result: ToolCallResult): string {
  return result.content?.[0]?.text ?? "";
}

describe("tool catalog", () => {
  it("lists every legacy alias right after its canonical name and list_platforms last", () => {
    const names: readonly string[] = KNOWW_MCP_TOOL_NAMES;
    for (const [canonical, alias] of Object.entries(POLYMARKET_TOOL_ALIASES)) {
      const index = names.indexOf(canonical);
      expect(index, canonical).toBeGreaterThanOrEqual(0);
      expect(names[index + 1], canonical).toBe(alias);
    }
    expect(names[names.length - 1]).toBe("list_platforms");
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("aggregator tool surface (dev bypass)", () => {
  setupGammaFetchStub();

  it("advertises each alias with an 'Alias of <canonical>.' description", async () => {
    const tools = await listTools(900);
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    for (const [canonical, alias] of Object.entries(POLYMARKET_TOOL_ALIASES)) {
      const canonicalDescription = byName.get(canonical)?.description;
      expect(canonicalDescription, canonical).toBeTruthy();
      expect(byName.get(alias)?.description, alias).toBe(
        `Alias of ${canonical}. ${canonicalDescription}`
      );
    }
  });

  it("answers an alias call with the same payload as the canonical tool", async () => {
    const openInterest = () =>
      Response.json([{ market: CONDITION_ID, value: "1234.5" }]);
    expectGammaFetch(
      "open interest via canonical name",
      dataUrl("/oi", `market=${CONDITION_ID}`),
      openInterest
    );
    expectGammaFetch(
      "open interest via alias",
      dataUrl("/oi", `market=${CONDITION_ID}`),
      openInterest
    );

    const canonical = await callTool("polymarket_get_open_interest", 901, {
      conditionIds: [CONDITION_ID],
    });
    const alias = await callTool("get_open_interest", 902, {
      conditionIds: [CONDITION_ID],
    });
    const canonicalResult = canonical.message.result as ToolCallResult;
    const aliasResult = alias.message.result as ToolCallResult;

    expect(canonicalResult.isError).toBeFalsy();
    expect(canonicalResult.structuredContent?.markets).toEqual([
      { conditionId: CONDITION_ID, value: "1234.5" },
    ]);
    expect(stablePayload(aliasResult.structuredContent)).toEqual(
      stablePayload(canonicalResult.structuredContent)
    );
    expect(aliasResult.content).toEqual(canonicalResult.content);
  });

  it("reports every known platform and the capabilities of the enabled ones", async () => {
    const { message } = await callTool("list_platforms", 903, {});
    const result = message.result as ToolCallResult;

    expect(result.isError).toBeFalsy();
    expect(result.content).toEqual([
      { type: "text", text: "Enabled platforms: polymarket." },
    ]);
    expect(result.structuredContent?.platforms).toEqual([
      {
        id: "polymarket",
        enabled: true,
        capabilities: POLYMARKET_CAPABILITIES,
      },
      { id: "kalshi", enabled: false },
    ]);
    expect(result.structuredContent?.meta).toMatchObject({ sources: [] });
  });

  const disabledCases: Array<[string, Record<string, unknown>]> = [
    ["search_markets", { query: "bitcoin" }],
    ["get_orderbook", { tokenId: "333" }],
    ["list_events", {}],
    ["get_market", { slug: "some-market" }],
    ["get_event", { slug: "some-event" }],
  ];

  for (const [tool, args] of disabledCases) {
    it(`fails ${tool} with PLATFORM_DISABLED for a disabled platform before any upstream call`, async () => {
      const { message } = await callTool(tool, 904, {
        ...args,
        platform: "kalshi",
      });
      const result = message.result as ToolCallResult;

      expect(result.isError).toBe(true);
      expect(errorText(result)).toContain(
        "PLATFORM_DISABLED: Platform kalshi is not enabled on this server."
      );
    });
  }

  it("rejects a canonical market id whose platform prefix is disabled", async () => {
    const { message } = await callTool("get_market", 905, {
      id: "kalshi:KXBTC-25SEP03",
    });
    const result = message.result as ToolCallResult;

    expect(result.isError).toBe(true);
    expect(errorText(result)).toContain("PLATFORM_DISABLED");
    expect(errorText(result)).toContain("kalshi");
  });

  it("rejects a canonical market id that disagrees with the platform argument", async () => {
    const { message } = await callTool("get_market", 906, {
      id: `polymarket:${CONDITION_ID}`,
      platform: "kalshi",
    });
    const result = message.result as ToolCallResult;

    expect(result.isError).toBe(true);
    expect(errorText(result)).toContain("VALIDATION_ERROR");
    expect(errorText(result)).toContain(
      "platform must match the platform prefix of id."
    );
  });

  it("rejects a canonical market id combined with another identifier", async () => {
    const { message } = await callTool("get_market", 907, {
      id: `polymarket:${CONDITION_ID}`,
      slug: "some-market",
    });
    const result = message.result as ToolCallResult;

    expect(result.isError).toBe(true);
    expect(errorText(result)).toContain(
      "VALIDATION_ERROR: Provide exactly one of id, slug, conditionId, or tokenId."
    );
  });

  it("rejects a canonical event id whose platform prefix is disabled", async () => {
    const { message } = await callTool("get_event", 908, { id: "kalshi:1" });
    const result = message.result as ToolCallResult;

    expect(result.isError).toBe(true);
    expect(errorText(result)).toContain("PLATFORM_DISABLED");
    expect(errorText(result)).toContain("kalshi");
  });

  it("rejects a canonical event id with a non-numeric source id", async () => {
    const { message } = await callTool("get_event", 909, {
      id: "polymarket:abc",
    });
    const result = message.result as ToolCallResult;

    expect(result.isError).toBe(true);
    expect(errorText(result)).toContain(
      "VALIDATION_ERROR: id must be a numeric event id or a canonical id such as polymarket:35908."
    );
  });
});
