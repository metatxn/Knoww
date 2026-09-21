import {
  mapGammaEvent,
  POLYMARKET_CAPABILITIES,
} from "@knoww/services/platforms/polymarket";
import { describe, expect, it } from "vitest";
import { toSlimGammaEvent } from "@/lib/gamma-keyset";
import type { GammaEventFull } from "@/lib/server-cache";
import type { GammaEvent } from "@/types/gamma-api";
import gammaEventFixture from "../../../../packages/knoww-services/src/fixtures/polymarket/gamma-event.json";
import {
  mergeChildMarkets,
  toGammaEventFull,
  toInitialEvent,
  toInitialHomeData,
  toInitialHomeDataFromGamma,
} from "./event-view-model";

/**
 * The legacy Gamma mappers are the source of truth here: apps/web must render
 * exactly what it rendered before the registry sat between it and Gamma.
 */

const ctx = {
  fetchedAt: "2026-09-03T00:00:00.000Z",
  capabilities: POLYMARKET_CAPABILITIES,
};

const fedEvent = mapGammaEvent(gammaEventFixture, ctx);
// The JSON literal's inferred type and the web GammaEvent disagree on a few
// optional shapes; the fixture is a real Gamma response, which is all the
// legacy mapper ever saw.
const fedRecord = gammaEventFixture as unknown as GammaEvent;

describe("toInitialEvent", () => {
  it("rebuilds the legacy slim event from the Gamma record the adapter carries", () => {
    expect(toInitialEvent(fedEvent)).toEqual(toSlimGammaEvent(fedRecord, true));
  });

  it("keeps Gamma's raw field types instead of the canonical ones", () => {
    const initial = toInitialEvent(fedEvent);

    expect(initial.volume).toBe(82861668.85687916);
    expect(initial.markets?.[0]?.outcomes).toBe('["Yes", "No"]');
  });

  it("refuses an event whose details did not come from Polymarket", () => {
    const foreign = {
      ...fedEvent,
      platformDetails: { platform: "kalshi" as const },
    };

    expect(() => toInitialEvent(foreign)).toThrow(/polymarket/i);
  });
});

describe("toInitialHomeData", () => {
  it("counts the page itself when Gamma reports no total", () => {
    expect(
      toInitialHomeData({ items: [fedEvent], nextCursor: "MjA=" })
    ).toEqual({
      events: [toSlimGammaEvent(fedRecord, true)],
      totalResults: 1,
      hasMore: true,
    });
  });

  it("prefers the total Gamma reports and stops paging without a cursor", () => {
    const page = toInitialHomeData({ items: [fedEvent], totalResults: 42 });

    expect(page.totalResults).toBe(42);
    expect(page.hasMore).toBe(false);
  });
});

describe("toGammaEventFull", () => {
  it("hands the detail page the record exactly as Gamma sent it", () => {
    expect(toGammaEventFull(fedEvent)).toBe(gammaEventFixture);
  });
});

describe("mergeChildMarkets", () => {
  const parent = {
    id: "1",
    slug: "ipl-2026",
    title: "IPL 2026",
    markets: [{ id: "m1", question: "Winner?" }],
  } as GammaEventFull;

  it("appends child markets tagged with their child event, skipping repeats", () => {
    const merged = mergeChildMarkets(parent, [
      {
        id: 7,
        title: "Most Sixes",
        markets: [
          { id: "m1", question: "repeat" },
          { id: "m2", question: "Most sixes?" },
        ],
      },
    ]);

    expect(merged.markets).toEqual([
      { id: "m1", question: "Winner?" },
      {
        id: "m2",
        question: "Most sixes?",
        parentEventId: 7,
        parentEventTitle: "Most Sixes",
      },
    ]);
    expect(parent.markets).toHaveLength(1);
  });

  it("returns the parent untouched when there are no children", () => {
    expect(mergeChildMarkets(parent, [])).toBe(parent);
  });
});

describe("toInitialHomeDataFromGamma", () => {
  it("shapes a Gamma keyset page the way the legacy reader did", () => {
    const page = toInitialHomeDataFromGamma({
      rawEvents: [gammaEventFixture],
      nextCursor: null,
    });

    expect(page).toEqual({
      events: [toSlimGammaEvent(fedRecord, true)],
      totalResults: 1,
      hasMore: false,
    });
  });
});
