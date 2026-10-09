import type { McpServer } from "@modelcontextprotocol/server";
import { afterEach, expect, it, vi } from "vitest";
import type { z } from "zod";
import { requestContext } from "../context";
import { registerPublicWalletTools } from "./public-wallets";

const wallet = `0x${"1".repeat(40)}`;
const condition = `0x${"2".repeat(64)}`;
const position = {
  proxy_wallet: wallet,
  token_id: "123",
  condition_id: condition,
  current_size: 10,
  avg_price: 0.4,
  entry_cost_usdc: 4,
  current_value: 10,
  current_price: 1,
  total_size: 10,
  realized_pnl: 0,
  unrealized_pnl: 6,
  percent_pnl: 150,
  percent_realized_pnl: 0,
  redeemable: true,
  mergeable: false,
  first_entry_at: 0,
  last_event_at: 1_800_000_000,
};
const page = (data: unknown[], cursor: string | null = null) =>
  Response.json({ data, pagination: { next_cursor: cursor } });
type Tool = {
  schema: z.ZodType;
  call: (args: unknown, context: unknown) => Promise<unknown>;
};
type Result = {
  isError?: boolean;
  structuredContent: {
    positions?: Record<string, unknown>[];
    activity?: Record<string, unknown>[];
    meta: { nextCursor?: string };
  };
};
function catalog() {
  const tools = new Map<string, Tool>();
  registerPublicWalletTools({
    registerTool(
      name: string,
      definition: { inputSchema: z.ZodType },
      call: Tool["call"]
    ) {
      tools.set(name, { schema: definition.inputSchema, call });
    },
  } as unknown as McpServer);
  return tools;
}
async function call(tool: Tool | undefined, input: unknown): Promise<Result> {
  if (!tool) throw new Error("Wallet tool was not registered");
  return requestContext.run(
    {
      requestId: "oct7-test",
      principal: {
        authMethod: "dev-bypass",
        id: "oct7-test",
        plan: "free",
        scopes: ["markets:read"],
      },
      toolRateLimiter: { limit: async () => ({ success: true }) },
    },
    async () =>
      (await tool.call(tool.schema.parse(input), {
        mcpReq: { signal: new AbortController().signal },
      })) as Result
  );
}
afterEach(() => vi.unstubAllGlobals());
it.each([0, 1_800_000_000])(
  "exposes firstEntryAt %i without replacing last-event timestamp",
  async (firstEntryAt) => {
    vi.stubGlobal("fetch", async () =>
      page([{ ...position, first_entry_at: firstEntryAt }])
    );
    const tools = catalog();
    const open = await call(tools.get("polymarket_get_wallet_positions"), {
      walletAddress: wallet,
    });
    const closed = await call(tools.get("polymarket_get_closed_positions"), {
      walletAddress: wallet,
    });
    expect(open.structuredContent.positions?.[0].firstEntryAt).toBe(
      firstEntryAt
    );
    expect(closed.structuredContent.positions?.[0]).toMatchObject({
      firstEntryAt,
      timestamp: 1_800_000_000,
    });
  }
);
it.each([0, 1])(
  "preserves combo outcome index %i and zero payout",
  async (outcomeIndex) => {
    vi.stubGlobal("fetch", async () =>
      page([
        {
          proxy_wallet: wallet,
          condition_id: condition,
          token_id: "123",
          type: "REDEEM",
          timestamp: 1_800_000_000,
          side: "",
          size: 10,
          price: 0,
          usdc_size: 0,
          outcome: outcomeIndex ? "No" : "Yes",
          outcome_index: outcomeIndex,
        },
      ])
    );
    const result = await call(catalog().get("polymarket_get_wallet_activity"), {
      walletAddress: wallet,
    });
    expect(result.structuredContent.activity?.[0]).toMatchObject({
      outcomeIndex,
      usdcSize: "0",
    });
  }
);
it("rejects affected closed sorts and restarts upstream cursor walking on continuation", async () => {
  const tool = catalog().get("polymarket_get_closed_positions");
  if (!tool) throw new Error("Closed positions tool was not registered");
  for (const sortBy of ["TOKENS", "CURRENT_VALUE", "PRICE", "UNREALIZED_PNL"])
    expect(
      tool.schema.safeParse({ walletAddress: wallet, sortBy }).success
    ).toBe(false);
  const cursors: (string | null)[] = [];
  let starts = 0;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    expect(url.searchParams.get("sort_by")).toBe("REALIZED_PNL");
    const cursor = url.searchParams.get("cursor");
    cursors.push(cursor);
    if (!cursor) return page([position], `fresh-${++starts}`);
    expect(cursor).toBe("fresh-2");
    return page([{ ...position, token_id: "124" }]);
  });
  const first = await call(tool, { walletAddress: wallet, limit: 1 });
  expect(first.structuredContent.meta.nextCursor).toBeTruthy();
  const next = await call(tool, {
    walletAddress: wallet,
    limit: 1,
    cursor: first.structuredContent.meta.nextCursor,
  });
  expect(next.structuredContent.positions?.[0].tokenId).toBe("124");
  expect(cursors).toEqual([null, null, "fresh-2"]);
});
