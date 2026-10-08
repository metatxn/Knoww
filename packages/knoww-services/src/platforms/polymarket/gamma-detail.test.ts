import { describe, expect, it, vi } from "vitest";
import { DEFAULT_POLYMARKET_BASE_URLS } from "./base-urls";
import { createPolymarketClientContext } from "./context";
import { isUpstreamMarketError } from "./errors";
import { createGammaDetail } from "./gamma-detail";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function createClient(respond: (url: URL) => Response) {
  const calls: URL[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    calls.push(url);
    return respond(url);
  }) as unknown as typeof fetch;
  const client = createGammaDetail(
    createPolymarketClientContext({
      baseUrls: DEFAULT_POLYMARKET_BASE_URLS,
      fetchImpl,
    })
  );
  return { client, calls };
}

describe("fetchOpenMarketRecordByIdentifier", () => {
  it("asks Gamma for the open market only and returns the record as Gamma sent it", async () => {
    // `/api/markets/slug/[slug]` serves this record untouched, so the values
    // the detail schema would otherwise normalise (stringified arrays, numeric
    // strings, nested event blobs) have to come back verbatim.
    const record = {
      id: "12345",
      slug: "will-the-fed-cut-rates",
      question: "Will the Fed cut rates?",
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.62", "0.38"]',
      clobTokenIds: '["11", "22"]',
      volume: "1234.5",
      endDate: "2026-09-30T00:00:00Z",
      events: [{ id: "9", slug: "fed-decision", extra: { nested: true } }],
    };
    const { client, calls } = createClient(() => jsonResponse([record]));

    const result = await client.fetchOpenMarketRecordByIdentifier({
      kind: "slug",
      value: "will-the-fed-cut-rates",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].pathname).toBe("/markets");
    expect(Object.fromEntries(calls[0].searchParams)).toEqual({
      slug: "will-the-fed-cut-rates",
      closed: "false",
    });
    expect(result).toEqual(record);
  });

  it("reports a market missing from the open set without retrying closed markets", async () => {
    const { client, calls } = createClient(() => jsonResponse([]));

    await expect(
      client.fetchOpenMarketRecordByIdentifier({
        kind: "slug",
        value: "settled-market",
      })
    ).resolves.toBeNull();
    expect(calls).toHaveLength(1);
  });

  it("surfaces a failed Gamma response as an upstream error", async () => {
    const { client } = createClient(() => jsonResponse({}, 503));

    await expect(
      client.fetchOpenMarketRecordByIdentifier({
        kind: "slug",
        value: "will-the-fed-cut-rates",
      })
    ).rejects.toSatisfy(isUpstreamMarketError);
  });
});

describe("V2 lookup by position ID", () => {
  const conditionId = `0x01${"11".repeat(17)}${"00".repeat(13)}`;
  const positionIds = [0, 1].map((index) =>
    BigInt(`${conditionId}0${index}`).toString()
  );
  const market = {
    id: "v2",
    conditionId,
    version: "v2",
    outcomes: ["Yes", "No"],
    positionIds,
    clobTokenIds: ["11", "22"],
  };

  it("resolves a structured position to a Gamma condition lookup and verifies the outcome", async () => {
    const { client, calls } = createClient(() => jsonResponse([market]));
    const result = await client.fetchMarketByIdentifier({
      kind: "tokenId",
      value: positionIds[1],
    });
    expect(result?.positionIds).toEqual(positionIds);
    expect(calls[0].searchParams.get("condition_ids")).toBe(conditionId);
    expect(calls[0].searchParams.has("clob_token_ids")).toBe(false);
    expect(calls[0].searchParams.has("position_ids")).toBe(false);
  });

  it("rejects a response with missing V2 metadata instead of using CTF IDs", async () => {
    const { client } = createClient(() =>
      jsonResponse([{ ...market, positionIds: undefined }])
    );
    await expect(
      client.fetchMarketByIdentifier({ kind: "tokenId", value: positionIds[0] })
    ).rejects.toThrow();
  });
});
