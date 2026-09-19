import { describe, expect, it } from "vitest";
import gammaEventFixture from "../../fixtures/polymarket/gamma-event.json";
import gammaMarketFixture from "../../fixtures/polymarket/gamma-market.json";
import { POLYMARKET_CAPABILITIES } from "./capabilities";
import {
  mapGammaEvent,
  mapGammaMarket,
  type PolymarketEventDetails,
  type PolymarketMarketDetails,
} from "./mappers";

const FETCHED_AT = "2026-09-03T12:00:00.000Z";
const ctx = { fetchedAt: FETCHED_AT, capabilities: POLYMARKET_CAPABILITIES };

const FED_EVENT_ID = "481717";
const FED_EVENT_SLUG = "fed-decision-in-september-762";
const CUT_50_CONDITION_ID =
  "0x5e464d85eb49f22d876f3ed6168a7db5e2288e9ae1eb91effd2758e994676f86";
const CUT_50_SLUG =
  "will-the-fed-decrease-interest-rates-by-50-bps-after-the-september-2026-meeting-863";
const CUT_50_YES_TOKEN =
  "97186030785608128217926542396950266594898339988989015155120280107165449433603";
const CUT_50_NO_TOKEN =
  "81470465080656150088482886298356783621062802919110096763062861781139262816347";

describe("mapGammaEvent", () => {
  const event = mapGammaEvent(gammaEventFixture, ctx);

  it("builds the canonical event envelope from the recorded Fed event", () => {
    expect(event).toMatchObject({
      schemaVersion: "1",
      id: `polymarket:${FED_EVENT_ID}`,
      platform: "polymarket",
      sourceEventId: FED_EVENT_ID,
      slug: FED_EVENT_SLUG,
      title: "Fed Decision in September?",
      status: "active",
      startTime: "2026-05-13T21:23:09.737806Z",
      endTime: "2026-09-16T00:00:00Z",
      volume: { value: "82861668.85687916", unit: "USD" },
      volume24h: { value: "4111419.061837998", unit: "USD" },
      liquidity: { value: "5227738.86354", unit: "USD" },
      image:
        "https://polymarket-upload.s3.us-east-2.amazonaws.com/fed-decision-in-september-762-c4RyWuxRPo1L.jpg",
      sourceUrl: `https://polymarket.com/event/${FED_EVENT_SLUG}`,
      fetchedAt: FETCHED_AT,
    });
    expect(event.description).toBe(gammaEventFixture.description);
    expect(event.capabilities).toBe(POLYMARKET_CAPABILITIES);
    expect(event.platformDetails).toMatchObject({
      platform: "polymarket",
      negRisk: true,
    });
  });

  it("maps every tag as a native Polymarket tag in upstream order", () => {
    expect(event.tags).toHaveLength(8);
    expect(event.tags[0]).toEqual({
      platform: "polymarket",
      slug: "fomc",
      label: "fomc",
      kind: "native",
      sourceTagId: "100478",
    });
    expect(event.tags.map((tag) => tag.slug)).toEqual([
      "fomc",
      "economic-policy",
      "fed-rates",
      "jerome-powell",
      "politics",
      "fed",
      "economy",
      "cpi-release",
    ]);
  });

  it("maps the five nested markets with condition-id based ids", () => {
    expect(event.markets.map((market) => market.id)).toEqual([
      `polymarket:${CUT_50_CONDITION_ID}`,
      "polymarket:0xac02cbb049e46d6a3627c0fdf52fa554982a9025d45968207b362acb6ca4b830",
      "polymarket:0xa3b36b2d6104d34af4e6c6215fc818e43352e78a748fbfb0b85e3a35f71dec9a",
      "polymarket:0x876506d8b2bd7a0d3fa4fe18c024eee6e1dd81ee24c26795dadd6cfe4a7b5d0d",
      "polymarket:0x2e4b58fc18dbffd74d5275d89fb076943f21992763c45dcadd81391b83bde13c",
    ]);
    expect(event.markets.map((market) => market.shortTitle)).toEqual([
      "50+ bps decrease",
      "25 bps decrease",
      "No change",
      "25 bps increase",
      "50+ bps increase",
    ]);
  });

  it("maps the 50 bps cut market in full", () => {
    const market = event.markets[0];
    expect(market).toMatchObject({
      schemaVersion: "1",
      id: `polymarket:${CUT_50_CONDITION_ID}`,
      platform: "polymarket",
      sourceMarketId: CUT_50_CONDITION_ID,
      sourceEventId: FED_EVENT_ID,
      slug: CUT_50_SLUG,
      title:
        "Will the Fed decrease interest rates by 50+ bps after the September 2026 meeting?",
      shortTitle: "50+ bps decrease",
      status: "active",
      openTime: "2026-05-13T21:23:09.737806Z",
      closeTime: "2026-09-16T00:00:00Z",
      volume: { value: "10023966.892785003", unit: "USD" },
      volume24h: { value: "355862.184", unit: "USD" },
      liquidity: { value: "1781683.93344", unit: "USD" },
      sourceUrl: `https://polymarket.com/event/${FED_EVENT_SLUG}/${CUT_50_SLUG}`,
      fetchedAt: FETCHED_AT,
    });
    expect(market?.image).toBe(gammaEventFixture.markets[0]?.image);
    expect(market?.resolvedTime).toBeUndefined();
    expect(market?.capabilities).toBe(POLYMARKET_CAPABILITIES);
    expect(market?.outcomes).toEqual([
      {
        id: `polymarket:${CUT_50_YES_TOKEN}`,
        sourceOutcomeId: CUT_50_YES_TOKEN,
        label: "Yes",
        price: "0.0015",
      },
      {
        id: `polymarket:${CUT_50_NO_TOKEN}`,
        sourceOutcomeId: CUT_50_NO_TOKEN,
        label: "No",
        price: "0.9985",
      },
    ]);
    expect(market?.platformDetails).toMatchObject({
      platform: "polymarket",
      gammaMarketId: "2252242",
      negRisk: true,
      acceptingOrders: true,
    });
  });

  it("keeps the Gamma event and its markets as received on platformDetails.gamma", () => {
    const details = event.platformDetails as PolymarketEventDetails;
    expect(details.gamma).toBe(gammaEventFixture);
    const marketDetails = event.markets[0]
      ?.platformDetails as PolymarketMarketDetails;
    expect(marketDetails.gamma).toBe(gammaEventFixture.markets[0]);
  });

  it("skips nested markets without a condition id", () => {
    const mapped = mapGammaEvent(
      {
        id: "1",
        slug: "orphans",
        title: "Orphans",
        active: true,
        closed: false,
        markets: [{ id: "9", question: "Orphan market" }],
      },
      ctx
    );
    expect(mapped.markets).toEqual([]);
  });

  it("marks a closed event with no markets as closed", () => {
    const mapped = mapGammaEvent(
      { id: "2", slug: "done", title: "Done", active: false, closed: true },
      ctx
    );
    expect(mapped.status).toBe("closed");
  });
});

describe("mapGammaMarket", () => {
  const market = mapGammaMarket(gammaMarketFixture[0], ctx);

  it("maps a market fetched on its own, taking the event from its events list", () => {
    expect(market).toMatchObject({
      id: `polymarket:${CUT_50_CONDITION_ID}`,
      sourceMarketId: CUT_50_CONDITION_ID,
      sourceEventId: FED_EVENT_ID,
      slug: CUT_50_SLUG,
      shortTitle: "50+ bps decrease",
      status: "active",
      volume: { value: "10023966.892785003", unit: "USD" },
      volume24h: { value: "355862.184", unit: "USD" },
      sourceUrl: `https://polymarket.com/event/${FED_EVENT_SLUG}/${CUT_50_SLUG}`,
    });
    expect(market?.outcomes.map((outcome) => outcome.price)).toEqual([
      "0.0015",
      "0.9985",
    ]);
    expect(market?.platformDetails).toMatchObject({
      resolvedBy: "0x69c47De9D4D3Dad79590d61b9e05918E03775f24",
    });
  });

  it("keeps the Gamma market as received on platformDetails.gamma", () => {
    const details = market?.platformDetails as PolymarketMarketDetails;
    expect(details.gamma).toBe(gammaMarketFixture[0]);
  });

  it("returns null for a market without a condition id", () => {
    expect(
      mapGammaMarket({ id: "9", question: "Orphan market" }, ctx)
    ).toBeNull();
  });
});
