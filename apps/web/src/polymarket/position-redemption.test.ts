import { describe, expect, it } from "vitest";
import { getPositionRedemption } from "./position-redemption";

const conditionId = `0x01${"11".repeat(17)}${"00".repeat(13)}`;
const asset = (index: number) => BigInt(`${conditionId}0${index}`).toString();
describe("position redemption metadata", () => {
  it("redeems the selected fractional loser amount on its V2 outcome", () => {
    expect(
      getPositionRedemption({
        conditionId,
        asset: asset(1),
        size: "0.123456",
        outcomeIndex: 1,
      })
    ).toEqual({
      protocolVersion: "v2",
      redemption: { outcomeIndex: 1, amount: "0.123456" },
    });
  });
  it("retains V1 redemption without Router arguments", () => {
    expect(
      getPositionRedemption({
        conditionId: `0x${"aa".repeat(32)}`,
        asset: "123",
        size: "1",
      })
    ).toEqual({ protocolVersion: "v1" });
  });
  it("rejects missing asset, mismatched condition/outcome and invalid amounts", () => {
    for (const overrides of [
      { asset: undefined },
      { conditionId: `0x${"aa".repeat(31)}` },
      { outcomeIndex: 0 },
      { size: "0" },
      { size: "0.0000001" },
      { size: "NaN" },
    ]) {
      expect(() =>
        getPositionRedemption({
          conditionId,
          asset: asset(1),
          size: "1",
          ...overrides,
        })
      ).toThrow();
    }
  });
});
