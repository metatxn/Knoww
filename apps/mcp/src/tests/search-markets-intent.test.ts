import { describe, expect, it } from "vitest";
import {
  callTool,
  expectGammaFetch,
  gammaUrl,
  setupGammaFetchStub,
  type ToolCallResult,
} from "./helpers";

setupGammaFetchStub();

function event(id: number, title: string, questions: string[]) {
  return {
    id: String(id),
    title,
    slug: `event-${id}`,
    active: true,
    closed: false,
    // Deliberately identical: expiry alone must not select the meeting.
    endDate: "2026-12-31T00:00:00Z",
    markets: questions.map((question, index) => ({
      id: `${id}-${index}`,
      slug: `market-${id}-${index}`,
      conditionId: `0x${(id * 100 + index).toString(16).padStart(64, "0")}`,
      question,
      active: true,
      closed: false,
      outcomes: '["Yes","No"]',
      outcomePrices: '["0.2","0.8"]',
    })),
  };
}

const events = [
  event(1, "Fed Decision in October?", [
    "Will the Fed cut 50+ bps at the October 2026 meeting?",
    "Will the Fed cut 25 bps at the October 2026 meeting?",
    "Will the Fed hold at the October 2026 meeting?",
    "Will the Fed raise 25 bps at the October 2026 meeting?",
    "Will the Fed raise 50+ bps at the October 2026 meeting?",
  ]),
  event(2, "How many Fed rate cuts in 2026?", [
    "Will no Fed rate cuts happen in 2026?",
    "Will 1 Fed rate cut happen in 2026?",
    "Will 2 Fed rate cuts happen in 2026?",
    "Will 3 Fed rate cuts happen in 2026?",
    "Will 4 Fed rate cuts happen in 2026?",
  ]),
  event(3, "Fed Decision in December?", [
    "Will the Fed cut 25 bps at the December 2026 meeting?",
    "Will the Fed cut 50+ bps at the December 2026 meeting?",
  ]),
  event(4, "Fed Decision in December?", [
    "Will the Fed cut at the December 2027 meeting?",
  ]),
  event(5, "ECB Decision in December?", [
    "Will the ECB cut at the December 2026 meeting?",
  ]),
];

function expectSearch(hasMore = false) {
  expectGammaFetch(
    "bounded Fed search",
    gammaUrl("/public-search", "q=Fed"),
    () =>
      Response.json({
        events,
        pagination: { hasMore, totalResults: hasMore ? 100 : events.length },
      })
  );
}

async function search(args: Record<string, unknown> = {}) {
  const { message } = await callTool("search_markets", 201, {
    query: "Fed",
    resultType: "markets",
    sortBy: "relevance",
    limit: 5,
    ...args,
  });
  return message.result as ToolCallResult;
}

describe("search_markets conversation intent", () => {
  it("finds December contracts before pagination despite ten earlier off-topic markets", async () => {
    expectSearch();
    const result = await search({ titleTerms: ["December", "2026"] });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent?.markets).toEqual([
      expect.objectContaining({ slug: "market-3-0" }),
      expect.objectContaining({ slug: "market-3-1" }),
    ]);
    expect(result.structuredContent?.page).toEqual({
      returnedResults: 2,
      totalResults: 2,
      hasMore: false,
    });
  });

  it("normalizes case and whitespace and matches terms across event title and question", async () => {
    expectSearch();
    const result = await search({
      titleTerms: [" DECEMBER ", "2026   meeting", "fed decision"],
    });
    expect(result.structuredContent?.markets).toHaveLength(2);
  });

  it("does not substitute annual contracts when the requested meeting is missing", async () => {
    expectSearch(true);
    const result = await search({ titleTerms: ["November", "2026"] });
    expect(result.structuredContent?.markets).toEqual([]);
    // A bounded upstream search cannot establish that no such market exists.
    expect(result.structuredContent?.meta).toMatchObject({ truncated: true });
  });

  it("uses phrase boundaries rather than partial years", async () => {
    expectSearch();
    const result = await search({ titleTerms: ["December", "202"] });
    expect(result.structuredContent?.markets).toEqual([]);
  });

  it("continues only the same meeting filter and accepts equivalent normalized terms", async () => {
    expectSearch();
    const first = await search({ titleTerms: ["December", "2026"], limit: 1 });
    const cursor = (first.structuredContent?.meta as { nextCursor?: string })
      ?.nextCursor;
    expect(cursor).toEqual(expect.any(String));

    const changed = await search({ titleTerms: ["October", "2026"], cursor });
    expect(changed.isError).toBe(true);
    expect(changed.content?.[0]?.text).toContain("VALIDATION_ERROR");

    expectSearch();
    const second = await search({
      titleTerms: ["2026", " december "],
      limit: 1,
      cursor,
    });
    expect(second.structuredContent?.markets).toEqual([
      expect.objectContaining({ slug: "market-3-1" }),
    ]);
  });

  it.each(
    [[], [" "], ["x".repeat(81)], Array(7).fill("Fed"), "December"].map(
      (titleTerms) => ({ titleTerms })
    )
  )("rejects invalid titleTerms %j before fetching", async ({ titleTerms }) => {
    const result = await search({ titleTerms });
    expect(result.isError).toBe(true);
    expect(result.content?.[0]?.text).not.toContain("UPSTREAM_UNAVAILABLE");
  });

  it("rejects titleTerms in event mode instead of silently ignoring the filter", async () => {
    const result = await search({
      resultType: "events",
      titleTerms: ["December"],
    });
    expect(result.isError).toBe(true);
    expect(result.content?.[0]?.text).toContain("VALIDATION_ERROR");
  });
});
