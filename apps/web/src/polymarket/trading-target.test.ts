import { describe, expect, it } from "vitest";
import { toTradingTarget } from "./trading-target";

/**
 * Literal ids from the recorded golden markets (golden/trading/recorded):
 * the plain fixture is the Zverev vs Halys match, the neg-risk fixture the
 * September 2026 Fed "no change" market.
 */
const ZVEREV_HALYS = {
  conditionId:
    "0x8ac0ba0e2bf6866038b9a1f2a765f17fee577e3facccf794ff98d992bbb7cd6d",
  zverev:
    "34397574656059404129684572103759634972857321473106697911428547533582938361264",
  halys:
    "111677288788322716285721802321462214269337893592189338144026898987337904380415",
};

const FED_NO_CHANGE = {
  conditionId:
    "0xa3b36b2d6104d34af4e6c6215fc818e43352e78a748fbfb0b85e3a35f71dec9a",
  yes: "5615282760875985231868508008056959876238536896643315063916840237042205273721",
  no: "97050921740416192996389806693742575608111328819185493163189880975611314813724",
};

const FETCHED_AT = "2026-09-04T00:00:00.000Z";

describe("toTradingTarget", () => {
  it("builds the canonical market and outcome the form trades against", () => {
    const target = toTradingTarget({
      conditionId: ZVEREV_HALYS.conditionId,
      title: "US Open ATP: Alexander Zverev vs Quentin Halys",
      slug: "atp-zverev-halys-2026-09-03",
      outcomes: [
        {
          name: "Alexander Zverev",
          tokenId: ZVEREV_HALYS.zverev,
          price: 0.755,
        },
        { name: "Quentin Halys", tokenId: ZVEREV_HALYS.halys, price: 0.245 },
      ],
      selectedIndex: 1,
      negRisk: false,
      fetchedAt: FETCHED_AT,
    });

    expect(target).not.toBeNull();
    expect(target?.market).toMatchObject({
      schemaVersion: "1",
      id: `polymarket:${ZVEREV_HALYS.conditionId}`,
      platform: "polymarket",
      sourceMarketId: ZVEREV_HALYS.conditionId,
      slug: "atp-zverev-halys-2026-09-03",
      title: "US Open ATP: Alexander Zverev vs Quentin Halys",
      status: "active",
      fetchedAt: FETCHED_AT,
      outcomes: [
        {
          id: `polymarket:${ZVEREV_HALYS.zverev}`,
          sourceOutcomeId: ZVEREV_HALYS.zverev,
          label: "Alexander Zverev",
          price: "0.755",
        },
        {
          id: `polymarket:${ZVEREV_HALYS.halys}`,
          sourceOutcomeId: ZVEREV_HALYS.halys,
          label: "Quentin Halys",
          price: "0.245",
        },
      ],
    });
    expect(target?.market.capabilities.createOrder).toBe(true);
    expect(target?.outcome.id).toBe(`polymarket:${ZVEREV_HALYS.halys}`);
    expect(target?.platformDetails).toEqual({
      platform: "polymarket",
      conditionId: ZVEREV_HALYS.conditionId,
      negRisk: false,
    });
    expect(target?.market.platformDetails).toBe(target?.platformDetails);
  });

  it("carries neg-risk in the platform details", () => {
    const target = toTradingTarget({
      conditionId: FED_NO_CHANGE.conditionId,
      title:
        "Will there be no change in Fed interest rates after the September 2026 meeting?",
      outcomes: [
        { name: "Yes", tokenId: FED_NO_CHANGE.yes, price: 0.585 },
        { name: "No", tokenId: FED_NO_CHANGE.no, price: 0.415 },
      ],
      selectedIndex: 0,
      negRisk: true,
      fetchedAt: FETCHED_AT,
    });

    expect(target?.platformDetails.negRisk).toBe(true);
    expect(target?.outcome).toEqual({
      id: `polymarket:${FED_NO_CHANGE.yes}`,
      sourceOutcomeId: FED_NO_CHANGE.yes,
      label: "Yes",
      price: "0.585",
    });
  });

  it("returns null without a condition id or without outcomes", () => {
    const outcomes = [
      { name: "Yes", tokenId: FED_NO_CHANGE.yes, price: 0.585 },
    ];
    expect(
      toTradingTarget({
        conditionId: undefined,
        title: "No condition",
        outcomes,
        selectedIndex: 0,
        negRisk: false,
      })
    ).toBeNull();
    expect(
      toTradingTarget({
        conditionId: FED_NO_CHANGE.conditionId,
        title: "No outcomes",
        outcomes: [],
        selectedIndex: 0,
        negRisk: false,
      })
    ).toBeNull();
  });
});
