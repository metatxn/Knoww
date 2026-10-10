import { createPlatformRegistry } from "@knoww/services/registry";
import { NextRequest, NextResponse } from "next/server";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/lib/api-rate-limit", () => ({ checkRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/platform-registry", () => ({
  getPlatformRegistry: () =>
    createPlatformRegistry({ enabledPlatforms: ["polymarket"] }),
}));

import { checkRateLimit } from "@/lib/api-rate-limit";
import { GET } from "./route";

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
  resolved: true,
  final_price: 1,
  title: "Example",
  market_slug: "example",
  event_id: "42",
  event_slug: "example-event",
  closed: true,
  neg_risk: false,
  neg_risk_market_id: null,
  question_index: null,
};
const request = (query: string) =>
  new NextRequest(`https://knoww.app/api/polymarket/markets/tokens?${query}`);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("returns camel-case metadata without requiring a pagination envelope", async () => {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    expect(url.pathname).toBe("/v2/tokens");
    expect(url.searchParams.get("token_id")).toBe("123,999");
    return Response.json({ data: [token] });
  });
  const response = await GET(request("tokenIds=123,999"));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toMatchObject({
    success: true,
    tokens: [{ tokenId: "123", outcomeIndex: 0, finalPrice: "1" }],
  });
});
it("forwards condition selectors unchanged", async () => {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    expect(new URL(String(input)).searchParams.get("condition")).toBe(
      condition
    );
    return Response.json({ data: [] });
  });
  expect((await GET(request(`conditionIds=${condition}`))).status).toBe(200);
});
it("returns settled neg-risk metadata with a null CLOB index", async () => {
  vi.stubGlobal("fetch", async () =>
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
          final_price: 0,
        },
      ],
    })
  );
  const response = await GET(request(`conditionIds=${condition}`));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    success: true,
    tokens: [
      { module: "neg_risk", clobIndex: null, outcomeIndex: 0, finalPrice: "0" },
    ],
  });
});
it.each([
  "",
  "tokenIds=",
  "tokenIds=-1",
  `tokenIds=123&conditionIds=${condition}`,
  "tokenIds=123&tokenIds=124",
  "tokenIds=123&limit=1000",
  `tokenIds=${Array(51).fill("123").join(",")}`,
  `conditionIds=${Array(11).fill(condition).join(",")}`,
])("rejects invalid input before upstream I/O: %s", async (query) => {
  const fetchImpl = vi.fn();
  vi.stubGlobal("fetch", fetchImpl);
  expect((await GET(request(query))).status).toBe(400);
  expect(fetchImpl).not.toHaveBeenCalled();
});
it("returns the existing rate limiter's response before fetching", async () => {
  vi.mocked(checkRateLimit).mockReturnValueOnce(
    NextResponse.json({ error: "Too many requests" }, { status: 429 })
  );
  const fetchImpl = vi.fn();
  vi.stubGlobal("fetch", fetchImpl);
  expect((await GET(request("tokenIds=123"))).status).toBe(429);
  expect(fetchImpl).not.toHaveBeenCalled();
});
it("does not expose upstream diagnostics on failure", async () => {
  vi.stubGlobal(
    "fetch",
    async () => new Response("internal stack trace", { status: 400 })
  );
  const response = await GET(request("tokenIds=123"));
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({
    success: false,
    error: "Unable to load token metadata",
  });
});
