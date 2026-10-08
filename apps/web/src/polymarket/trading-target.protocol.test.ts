import { describe, expect, it } from "vitest";
import { toTradingTarget } from "./trading-target";

describe("Polymarket trading target protocol identity", () => {
  it("keeps the market version with a V2 asset", () => {
    const target = toTradingTarget({
      conditionId: `0x01${"11".repeat(17)}${"00".repeat(13)}`,
      title: "V2",
      negRisk: false,
      protocolVersion: "v2",
      selectedIndex: 0,
      outcomes: [
        {
          name: "Yes",
          tokenId: BigInt(
            `0x01${"11".repeat(17)}${"00".repeat(13)}00`
          ).toString(),
          price: 0.5,
        },
      ],
    });
    expect(target?.platformDetails.protocolVersion).toBe("v2");
    expect(target?.outcome.sourceOutcomeId).toBe(
      BigInt(`0x01${"11".repeat(17)}${"00".repeat(13)}00`).toString()
    );
  });
});
