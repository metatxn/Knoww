import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-rate-limit", () => ({ checkRateLimit: () => null }));
vi.mock("@/lib/cache-headers", () => ({ getCacheHeaders: () => ({}) }));

import { GET } from "./route";

const conditionId = `0x01${"11".repeat(17)}${"00".repeat(13)}`;
const positionIds = [0, 1].map((index) =>
  BigInt(`${conditionId}0${index}`).toString()
);
const request = new NextRequest(
  "https://example.test/api/markets/by-token/123"
);
afterEach(() => vi.unstubAllGlobals());
describe("position market lookup", () => {
  it("uses encoded V2 condition and verifies the exact outcome", async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      Response.json([
        {
          id: "1",
          conditionId,
          version: "v2",
          positionIds,
          clobTokenIds: ["11", "22"],
          outcomes: ["Yes", "No"],
          events: [{ slug: "event" }],
        },
      ])
    );
    vi.stubGlobal("fetch", fetchMock);
    const response = await GET(request, {
      params: Promise.resolve({ tokenId: positionIds[1] }),
    });
    expect(response.status).toBe(200);
    expect(
      ((await response.json()) as { market: { outcome: string } }).market
        .outcome
    ).toBe("No");
    expect(
      new URL(fetchMock.mock.calls[0][0] as string).searchParams.get(
        "condition_ids"
      )
    ).toBe(conditionId);
  });
  it("rejects malformed and out of range IDs before upstream lookup", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const tokenId of [
      "-1",
      "abc",
      "1.5",
      (BigInt(2) ** BigInt(256)).toString(),
      BigInt(`${conditionId}02`).toString(),
    ]) {
      expect(
        (await GET(request, { params: Promise.resolve({ tokenId }) })).status
      ).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
