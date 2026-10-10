import { afterEach, expect, it, vi } from "vitest";
import { createPolymarketClient } from "./client";

const condition = `0x${"a".repeat(64)}`;
const token = {
  token_id: "123",
  condition_id: condition,
  structural_condition_id: null,
  module: "v1_ctf",
  outcome_index: 0,
  clob_index: 0,
  outcome: "Yes",
  opposite_token_id: "124",
  resolved: false,
  final_price: null,
  title: "Example market",
  market_slug: "example-market",
  event_id: 42,
  event_slug: "example-event",
  closed: false,
  neg_risk: false,
  neg_risk_market_id: null,
  question_index: null,
};
afterEach(() => vi.unstubAllGlobals());
it("looks up known tokens in one non-paginated request and keeps identity when unknown IDs are omitted", async () => {
  const fetchImpl = vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    expect(url.pathname).toBe("/v2/tokens");
    expect(url.searchParams.get("token_id")).toBe("123,999,124");
    expect(url.searchParams.has("condition")).toBe(false);
    return Response.json({
      data: [
        token,
        {
          ...token,
          token_id: "124",
          outcome_index: 1,
          outcome: "No",
          resolved: true,
          final_price: 0,
        },
      ],
    });
  });
  const client = createPolymarketClient({ fetchImpl });
  expect(
    await client.fetchTokenLookup({ tokenIds: ["123", "999", "124"] })
  ).toMatchObject([
    {
      tokenId: "123",
      conditionId: condition,
      eventId: "42",
      structuralConditionId: null,
      finalPrice: null,
      outcomeIndex: 0,
    },
    { tokenId: "124", outcomeIndex: 1, resolved: true, finalPrice: "0" },
  ]);
  expect(fetchImpl).toHaveBeenCalledOnce();
});
it.each([`0x${"b".repeat(62)}`, condition])(
  "accepts condition selector %s without changing its form",
  async (selector) => {
    const client = createPolymarketClient({
      fetchImpl: async (input) => {
        const url = new URL(String(input));
        expect(url.searchParams.get("condition")).toBe(selector);
        expect(url.searchParams.has("token_id")).toBe(false);
        return Response.json({
          data: [
            {
              ...token,
              module: "future_module",
              structural_condition_id: condition,
              question_index: 2,
            },
          ],
        });
      },
    });
    expect(
      await client.fetchTokenLookup({ conditionIds: [selector] })
    ).toMatchObject([
      {
        module: "future_module",
        questionIndex: 2,
        structuralConditionId: condition,
      },
    ]);
  }
);
it("accepts settled neg-risk tokens without a CLOB mapping", async () => {
  const client = createPolymarketClient({
    fetchImpl: async () =>
      Response.json({
        data: [
          {
            ...token,
            module: "neg_risk",
            structural_condition_id: condition,
            clob_index: null,
            neg_risk: true,
            neg_risk_market_id: condition,
            question_index: 1,
            resolved: true,
            final_price: 0,
          },
        ],
      }),
  });
  expect(
    await client.fetchTokenLookup({ conditionIds: [condition] })
  ).toMatchObject([
    { module: "neg_risk", clobIndex: null, outcomeIndex: 0, finalPrice: "0" },
  ]);
});
it.each([
  {},
  { tokenIds: ["123"], conditionIds: [condition] },
  { tokenIds: [] },
  { tokenIds: Array(51).fill("123") },
  { conditionIds: Array(11).fill(condition) },
  { tokenIds: ["-1"] },
  { tokenIds: [(2n ** 256n).toString()] },
  { conditionIds: ["not-a-condition"] },
])("rejects invalid selectors before upstream I/O: %j", async (input) => {
  const fetchImpl = vi.fn<typeof fetch>();
  const client = createPolymarketClient({ fetchImpl });
  await expect(client.fetchTokenLookup(input)).rejects.toMatchObject({
    status: 400,
  });
  expect(fetchImpl).not.toHaveBeenCalled();
});
it.each([
  { final_price: 2 },
  { outcome_index: -1 },
  { token_id: "not-a-token" },
])("rejects malformed token metadata: %j", async (override) => {
  const client = createPolymarketClient({
    fetchImpl: async () => Response.json({ data: [{ ...token, ...override }] }),
  });
  await expect(client.fetchTokenLookup({ tokenIds: ["123"] })).rejects.toThrow(
    "invalid response"
  );
});
it("accepts unknown-only results and does not retry invalid selector HTTP errors", async () => {
  const empty = createPolymarketClient({
    fetchImpl: async () => Response.json({ data: [] }),
  });
  expect(await empty.fetchTokenLookup({ tokenIds: ["999"] })).toEqual([]);
  const fetchImpl = vi.fn<typeof fetch>(
    async () => new Response(null, { status: 400 })
  );
  await expect(
    createPolymarketClient({ fetchImpl }).fetchTokenLookup({
      tokenIds: ["123"],
    })
  ).rejects.toMatchObject({ status: 400 });
  expect(fetchImpl).toHaveBeenCalledOnce();
});
