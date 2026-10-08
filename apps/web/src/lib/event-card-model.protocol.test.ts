import { expect, it } from "vitest";
import { extractTopMarkets } from "./event-card-model";

it("selects V2 positions for event card history without CTF fallback", () => {
  const conditionId = `0x01${"11".repeat(17)}${"00".repeat(13)}`;
  const positionIds = [0, 1].map((index) =>
    BigInt(`${conditionId}0${index}`).toString()
  );
  const market = {
    id: "1",
    version: "v2" as const,
    outcomes: '["Yes","No"]',
    outcomePrices: '["0.5","0.5"]',
    positionIds,
    clobTokenIds: ["11", "22"],
  };
  expect(extractTopMarkets({ markets: [market] })[0].tokenId).toBe(
    positionIds[0]
  );
  expect(
    extractTopMarkets({ markets: [{ ...market, version: undefined }] })[0]
      .tokenId
  ).toBeUndefined();
});
