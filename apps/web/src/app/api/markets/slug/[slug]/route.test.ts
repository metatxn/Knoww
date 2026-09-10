import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-rate-limit", () => ({
  checkRateLimit: vi.fn(() => null),
}));

import { GET } from "./route";

const SLUG = "will-the-fed-cut-rates";

function stubGamma(payload: unknown, status = 200) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(JSON.stringify(payload), {
        status,
        statusText: status === 503 ? "Service Unavailable" : "OK",
        headers: { "Content-Type": "application/json" },
      });
    })
  );
  return calls;
}

function get() {
  return GET(new NextRequest(`https://knoww.app/api/markets/slug/${SLUG}`), {
    params: Promise.resolve({ slug: SLUG }),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("GET /api/markets/slug/[slug]", () => {
  it("serves the open market for the slug as Gamma sent it", async () => {
    const record = {
      id: "12345",
      slug: SLUG,
      question: "Will the Fed cut rates?",
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.62", "0.38"]',
      volume: "1234.5",
      events: [{ id: "9", slug: "fed-decision" }],
    };
    const calls = stubGamma([record]);

    const response = await get();

    expect(calls).toHaveLength(1);
    const upstream = new URL(calls[0]);
    expect(upstream.pathname).toBe("/markets");
    expect(Object.fromEntries(upstream.searchParams)).toEqual({
      slug: SLUG,
      closed: "false",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      market: record,
    });
  });

  it("returns 404 when no open market carries the slug", async () => {
    stubGamma([]);

    const response = await get();

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Market not found",
    });
  });

  it("returns 500 when Gamma fails", async () => {
    stubGamma({ error: "down" }, 503);

    const response = await get();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ success: false });
  });
});
