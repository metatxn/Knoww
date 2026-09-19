import { afterEach, describe, expect, it, vi } from "vitest";
import { toSlimGammaEvent } from "@/lib/gamma-keyset";
import type { GammaEvent } from "@/types/gamma-api";
import gammaEventFixture from "../../../../packages/knoww-services/src/fixtures/polymarket/gamma-event.json";
import { fetchSeriesEventPage } from "./event-reads";

const fedRecord = gammaEventFixture as unknown as GammaEvent;

describe("fetchSeriesEventPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks Gamma for the active series page the sports lists always used", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events: [gammaEventFixture], next_cursor: null }),
    } satisfies Partial<Response>);
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchSeriesEventPage({
      seriesId: 42,
      limit: 20,
      cache: { revalidateSeconds: 60 },
    });

    expect(result).toEqual({
      events: [toSlimGammaEvent(fedRecord, true)],
      totalResults: 1,
      hasMore: false,
    });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/events/keyset");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      limit: "20",
      closed: "false",
      series_id: "42",
      active: "true",
      order: "volume24hr",
      ascending: "false",
    });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      next: { revalidate: 60 },
    });
  });
});
