import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-rate-limit", () => ({
  checkRateLimit: vi.fn(() => null),
}));

import { GET } from "./route";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("GET /api/events/[id]", () => {
  it("returns 404 when Gamma rejects an invalid event slug", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            type: "validation error",
            error: "slug is invalid",
          }),
          {
            status: 422,
            statusText: "Unprocessable Entity",
            headers: { "Content-Type": "application/json" },
          }
        )
      )
    );

    const response = await GET(
      new NextRequest(
        "https://knoww.app/api/events/esportsworldcup.com?fresh=1"
      ),
      { params: Promise.resolve({ id: "esportsworldcup.com" }) }
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Event not found",
    });
  });

  it("folds negRisk child markets into the parent's market list", async () => {
    const parent = {
      id: "481717",
      slug: "fed-decision",
      title: "Fed decision",
      markets: [{ id: "m1", question: "Cut by 25 bps?" }],
    };
    const children = [
      {
        id: "child1",
        slug: "most-sixes",
        title: "Most Sixes",
        markets: [
          { id: "m2", question: "Most sixes?" },
          // A market already on the parent keeps the parent's copy.
          { id: "m1", question: "Cut by 25 bps? (child copy)" },
        ],
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const body = url.includes("parent_event_id=481717")
          ? children
          : url.includes("/events/481717")
            ? parent
            : null;
        if (body === null) {
          throw new Error(`unexpected fetch ${url}`);
        }
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      })
    );

    const response = await GET(
      new NextRequest("https://knoww.app/api/events/481717?fresh=1"),
      { params: Promise.resolve({ id: "481717" }) }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      success: true,
      event: {
        ...parent,
        markets: [
          { id: "m1", question: "Cut by 25 bps?" },
          {
            id: "m2",
            question: "Most sixes?",
            parentEventId: "child1",
            parentEventTitle: "Most Sixes",
          },
        ],
        marketCount: 2,
      },
    });
  });
});
