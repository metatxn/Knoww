import { describe, expect, it } from "vitest";
import {
  projectMarketOutcomes,
  projectMarketResolution,
  readMarketResolutions,
} from "./gamma";
import { CONDITION_ID_PATTERN } from "./public-read";

const conditionId = `0x01${"11".repeat(17)}${"00".repeat(13)}`;
const positions = [0, 1].map((index) =>
  BigInt(`${conditionId}0${index}`).toString()
);

describe("Protocol V2 market projections", () => {
  it("keeps position IDs aligned with the selected outcomes", () => {
    const result = projectMarketOutcomes({
      id: "review-fixture",
      version: "v2",
      positionIds: positions,
      outcomes: '["Yes","No"]',
      outcomePrices: '["0.4","0.6"]',
      clobTokenIds: '["123","456"]',
    });
    expect(result.outcomes.map((outcome) => outcome.tokenId)).toEqual(
      positions
    );
  });
  it("keeps legacy CTF outcome IDs", () => {
    expect(
      projectMarketOutcomes({
        id: "review-fixture",
        version: "v1",
        outcomes: '["Yes","No"]',
        clobTokenIds: '["123","456"]',
      }).outcomes.map((outcome) => outcome.tokenId)
    ).toEqual(["123", "456"]);
  });
  it("accepts both native V2 and padded or CTF condition representations", () => {
    expect(CONDITION_ID_PATTERN.test(conditionId)).toBe(true);
    expect(CONDITION_ID_PATTERN.test(`${conditionId}00`)).toBe(true);
    expect(CONDITION_ID_PATTERN.test(`0x${"aa".repeat(32)}`)).toBe(true);
    expect(CONDITION_ID_PATTERN.test("0x1234")).toBe(false);
  });
  it("rejects V2 outcomes missing position IDs instead of exposing CTF IDs", () => {
    expect(() =>
      projectMarketOutcomes({
        id: "review-fixture",
        version: "v2",
        outcomes: '["Yes","No"]',
        clobTokenIds: '["123","456"]',
      })
    ).toThrow();
  });
});

describe("V2 resolution projection", () => {
  const market = {
    id: "review-fixture",
    version: "v2" as const,
    conditionId,
    positionIds: positions,
    outcomes: '["Yes","No"]',
    closed: true,
    umaResolutionStatus: "resolved",
    outcomePrices: '["1","0"]',
  };
  it("requires confirmed SDK resolution rather than Gamma prices", () => {
    expect(projectMarketResolution(market).status).toBe("closed");
    expect(
      projectMarketResolution(market, [
        { conditionId, status: "proposed", payouts: ["1", "0"] },
      ])
    ).toEqual({ status: "closed" });
  });
  it("preserves zero and fractional confirmed payouts", () => {
    for (const payouts of [
      ["0", "1"],
      ["0.5", "0.5"],
    ]) {
      expect(
        projectMarketResolution(market, [
          { conditionId: `${conditionId}00`, status: "resolved", payouts },
        ])
      ).toEqual({ status: "resolved", payouts });
    }
  });
  it("rejects mismatched or missing resolution identity", () => {
    for (const id of [undefined, `0x02${"11".repeat(17)}${"00".repeat(13)}`])
      expect(
        projectMarketResolution(market, [
          { conditionId: id, status: "resolved", payouts: ["1", "0"] },
        ])
      ).toEqual({ status: "closed" });
  });
  it("aligns payouts with each encoded asset when Gamma reorders outcomes", () => {
    expect(
      projectMarketResolution(
        {
          ...market,
          positionIds: [positions[1], positions[0]],
          outcomes: '["No","Yes"]',
        },
        [{ conditionId, status: "resolved", payouts: ["1", "0"] }]
      ).payouts
    ).toEqual(["0", "1"]);
  });
  it("does not publish malformed payouts", () => {
    expect(
      projectMarketResolution(market, [
        { conditionId, status: "resolved", payouts: ["NaN", "1"] },
      ])
    ).toEqual({ status: "resolved" });
  });
  it("keeps market detail available without settlement claims when resolution reads fail", async () => {
    const rows = await readMarketResolutions(market, async () => {
      throw new Error("Synthetic upstream timeout");
    });
    expect(rows).toBeUndefined();
    expect(projectMarketResolution(market, rows)).toEqual({ status: "closed" });
  });
  it("retains V1 detail behavior without requesting V2 resolution reads", async () => {
    await expect(
      readMarketResolutions({ ...market, version: "v1" }, async () => {
        throw new Error("V1 must not request V2 detail resolutions");
      })
    ).resolves.toBeUndefined();
  });
});
