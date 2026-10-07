import { describe, expect, it } from "vitest";
import { POLYMARKET_CAPABILITIES } from "./capabilities";
import { mapGammaMarket } from "./mappers";

const context = {
  fetchedAt: "2026-10-06T00:00:00.000Z",
  capabilities: POLYMARKET_CAPABILITIES,
};
const conditionId = `0x01${"11".repeat(17)}${"00".repeat(13)}`;
const positionIds = [0, 1].map((index) =>
  BigInt(`${conditionId}0${index}`).toString()
);

describe("Polymarket protocol outcome mapping", () => {
  it("uses V2 position IDs even when Gamma includes legacy token IDs", () => {
    const market = mapGammaMarket(
      {
        id: "1",
        conditionId,
        version: "v2",
        outcomes: '["Yes","No"]',
        positionIds: JSON.stringify(positionIds),
        clobTokenIds: '["11","22"]',
      },
      context
    );

    expect(market?.outcomes.map((outcome) => outcome.sourceOutcomeId)).toEqual(
      positionIds
    );
    expect(
      (market?.platformDetails as { protocolVersion?: string })?.protocolVersion
    ).toBe("v2");
  });

  it("keeps V1 CTF token IDs", () => {
    const market = mapGammaMarket(
      {
        id: "2",
        conditionId: `0x${"aa".repeat(32)}`,
        version: "v1",
        outcomes: '["Yes","No"]',
        clobTokenIds: '["11","22"]',
      },
      context
    );

    expect(market?.outcomes.map((outcome) => outcome.sourceOutcomeId)).toEqual([
      "11",
      "22",
    ]);
    expect(
      (market?.platformDetails as { protocolVersion?: string })?.protocolVersion
    ).toBe("v1");
  });
});

it("rejects malformed V2 metadata without falling back to CTF IDs", () => {
  for (const positionIds of [
    undefined,
    ["11", "22"],
    [positionIdsFixture()[0]],
  ]) {
    expect(() =>
      mapGammaMarket(
        {
          id: "v2",
          conditionId,
          version: "v2",
          outcomes: ["Yes", "No"],
          clobTokenIds: ["11", "22"],
          positionIds,
        },
        context
      )
    ).toThrow();
  }
});

function positionIdsFixture() {
  return [0, 1].map((index) => BigInt(`${conditionId}0${index}`).toString());
}
