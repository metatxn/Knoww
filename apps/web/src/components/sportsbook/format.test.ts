import { describe, expect, it } from "vitest";
import {
  formatPositionPercent,
  formatSignedUsd,
  formatUsd,
  tokenIdForOutcome,
} from "./format";

describe("formatSignedUsd", () => {
  it("does not prefix gains with +", () => {
    expect(formatSignedUsd(12.5)).toBe("$12.50");
  });
  it("keeps - on losses", () => {
    expect(formatSignedUsd(-3.2)).toBe("-$3.20");
  });
  it("treats zero as unsigned", () => {
    expect(formatSignedUsd(0)).toBe("$0.00");
  });
});

describe("formatUsd", () => {
  it("formats plain USD", () => {
    expect(formatUsd(7)).toBe("$7.00");
  });
});

describe("formatPositionPercent", () => {
  it("does not prefix gains with +", () => {
    expect(formatPositionPercent(5.2)).toBe("5.2%");
  });
  it("keeps - on losses", () => {
    expect(formatPositionPercent(-3.5)).toBe("-3.5%");
  });
  it("treats zero as unsigned", () => {
    expect(formatPositionPercent(0)).toBe("0.0%");
  });
});

it("uses validated V2 asset IDs for display and chart outcomes", () => {
  const conditionId = `0x01${"11".repeat(17)}${"00".repeat(13)}`;
  const positionIds = [0, 1].map((index) =>
    BigInt(`${conditionId}0${index}`).toString()
  );
  const market = {
    id: "1",
    conditionId,
    version: "v2" as const,
    outcomes: '["Yes", "No"]',
    positionIds,
    clobTokenIds: ["11", "22"],
  };
  expect(tokenIdForOutcome(market, 1)).toBe(positionIds[1]);
  expect(tokenIdForOutcome({ ...market, version: undefined }, 1)).toBe("");
});
