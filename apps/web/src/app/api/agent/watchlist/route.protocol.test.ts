import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ upsert: vi.fn(), imported: vi.fn() }));
vi.mock("@knoww/agent", () => ({
  isAllowedAgentNewsUrl: () => true,
  resolvePolymarketEventWatchlistItem: mocks.imported,
}));
vi.mock("@/lib/api-rate-limit", () => ({ checkRateLimit: () => null }));
vi.mock("@/lib/agent/api", () => ({
  requireAgentAdmin: () => null,
  requireMutatingAgentAdmin: () => null,
  readJson: (request: NextRequest) => request.json(),
  isJsonBodyError: () => false,
  jsonError: (error: string, status: number) =>
    NextResponse.json({ error }, { status }),
}));
vi.mock("@/lib/agent/repository", () => ({
  getAgentRepository: async () => ({ upsertWatchlistItem: mocks.upsert }),
}));

import { POST } from "./route";

const conditionId = `0x01${"11".repeat(17)}${"00".repeat(13)}`;
const tokenId = BigInt(`${conditionId}01`).toString();
const input = { question: "Will this test resolve?", tokenId };
function post(data: unknown) {
  return POST(
    new NextRequest("https://example.test/api/agent/watchlist", {
      method: "POST",
      body: JSON.stringify(data),
      headers: { "content-type": "application/json" },
    })
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.upsert.mockImplementation(async (item) => item);
});
describe("manual watchlist protocol metadata", () => {
  it("infers V2 protocol, condition and outcome from the selected asset", async () => {
    expect((await post(input)).status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenId,
        protocolVersion: "v2",
        outcomeIndex: 1,
        conditionId,
      })
    );
  });
  it("rejects mismatched ledger, outcome and condition before saving", async () => {
    for (const metadata of [
      { protocolVersion: "v1" },
      { outcomeIndex: 0 },
      { conditionId: `0x${"aa".repeat(32)}` },
    ])
      expect((await post({ ...input, ...metadata })).status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("preserves manual V1 input without an outcome index for provider lookup", async () => {
    expect((await post({ ...input, tokenId: "12345678" })).status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        protocolVersion: "v1",
        outcomeIndex: undefined,
      })
    );
  });
  it("rejects a token override inconsistent with imported metadata", async () => {
    mocks.imported.mockResolvedValue({
      ...input,
      conditionId,
      protocolVersion: "v2",
      outcomeIndex: 1,
    });
    expect(
      (
        await post({
          polymarketUrl: "https://polymarket.com/event/test",
          tokenId: BigInt(`${conditionId}00`).toString(),
        })
      ).status
    ).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("rejects malformed, negative, overflowing and invalid V2 outcome assets", async () => {
    for (const tokenId of [
      "not-a-token",
      "-12345678",
      (BigInt(2) ** BigInt(256)).toString(),
      BigInt(`${conditionId}02`).toString(),
    ]) {
      expect((await post({ ...input, tokenId })).status).toBe(400);
    }
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
