import { describe, expect, it } from "vitest";
import { toTradingTarget } from "@/polymarket/trading-target";
import {
  compactMatchupOutcomeName,
  compactMatchupTradingOutcomes,
} from "./matchup-trading-outcomes";

describe("compactMatchupTradingOutcomes", () => {
  const cricketTeams = [
    { name: "India", abbreviation: "ind" },
    { name: "West Indies", abbreviation: "wst" },
  ];

  it.each([cricketTeams, [...cricketTeams].reverse()])(
    "keeps India and West Indies distinct regardless of team order",
    (...teams) => {
      const outcomes = [
        { name: "India", tokenId: "123", price: 0.8, probability: 80 },
        { name: "West Indies", tokenId: "456", price: 0.21, probability: 21 },
      ];
      expect(compactMatchupTradingOutcomes(outcomes, teams)).toEqual([
        { ...outcomes[0], name: "IND" },
        { ...outcomes[1], name: "WST" },
      ]);
      expect(outcomes.map((outcome) => outcome.name)).toEqual([
        "India",
        "West Indies",
      ]);
    }
  );

  it.each(["v1", "v2"] as const)(
    "preserves each selected %s asset after compacting labels",
    (protocolVersion) => {
      const conditionId = `0x01${"11".repeat(17)}${"00".repeat(13)}`;
      const ids =
        protocolVersion === "v1"
          ? ["123", "456"]
          : [0, 1].map((index) => BigInt(`${conditionId}0${index}`).toString());
      const outcomes = compactMatchupTradingOutcomes(
        [
          { name: "India", tokenId: ids[0], price: 0.8, probability: 80 },
          {
            name: "West Indies",
            tokenId: ids[1],
            price: 0.21,
            probability: 21,
          },
        ],
        cricketTeams
      );
      for (const selectedIndex of [0, 1]) {
        const target = toTradingTarget({
          conditionId,
          title: "India vs West Indies",
          outcomes,
          selectedIndex,
          protocolVersion,
          negRisk: false,
        });
        expect(target?.outcome.label).toBe(selectedIndex === 0 ? "IND" : "WST");
        expect(target?.outcome.sourceOutcomeId).toBe(ids[selectedIndex]);
        expect(
          target?.market.outcomes.map((outcome) => outcome.sourceOutcomeId)
        ).toEqual(ids);
        expect(target?.platformDetails.protocolVersion).toBe(protocolVersion);
      }
    }
  );

  it("keeps separate binary moneyline tickets labeled yes/no", () => {
    const outcomes = compactMatchupTradingOutcomes(
      [
        {
          name: "Yes",
          tokenId: "draw-yes",
          price: 0.24,
          probability: 24,
        },
        {
          name: "No",
          tokenId: "draw-no",
          price: 0.77,
          probability: 77,
        },
      ],
      [
        { name: "Austria", abbreviation: "AUT" },
        { name: "Jordan", abbreviation: "JOR" },
      ]
    );

    expect(outcomes).toEqual([
      {
        name: "Yes",
        tokenId: "draw-yes",
        price: 0.24,
        probability: 24,
      },
      {
        name: "No",
        tokenId: "draw-no",
        price: 0.77,
        probability: 77,
      },
    ]);
  });

  it("compacts named team outcomes using abbreviations", () => {
    const outcomes = compactMatchupTradingOutcomes(
      [
        {
          name: "India",
          tokenId: "india-token",
          price: 0.6,
          probability: 60,
        },
        {
          name: "Afghanistan",
          tokenId: "afghanistan-token",
          price: 0.42,
          probability: 42,
        },
      ],
      [
        { name: "India", abbreviation: "IND4" },
        { name: "Afghanistan", abbreviation: "AFG2" },
      ]
    );

    expect(outcomes).toEqual([
      {
        name: "IND4",
        tokenId: "india-token",
        price: 0.6,
        probability: 60,
      },
      {
        name: "AFG2",
        tokenId: "afghanistan-token",
        price: 0.42,
        probability: 42,
      },
    ]);
  });
});

describe("compactMatchupOutcomeName", () => {
  const teams = [
    { name: "India", abbreviation: "IND" },
    { name: "West Indies", abbreviation: "WST" },
  ];

  it.each([
    ["West Indies (winner)", "WST"],
    ["West Indies to win", "WST"],
    ["IND (winner)", "IND"],
    ["INDIGO", "INDIGO"],
    ["West", "West"],
    ["India or West Indies", "India or West Indies"],
  ])("matches only unambiguous whole names in %s", (input, expected) => {
    expect(compactMatchupOutcomeName(input, teams)).toBe(expected);
  });

  it("uses an exact name before another team's overlapping abbreviation", () => {
    expect(
      compactMatchupOutcomeName("Miami", [
        { name: "Mumbai Indians", abbreviation: "MI" },
        { name: "Miami", abbreviation: "MIA" },
      ])
    ).toBe("MIA");
  });

  it("keeps binary labels even when a team abbreviation is NO", () => {
    expect(
      compactMatchupOutcomeName("No", [
        { name: "Norway", abbreviation: "NO" },
        { name: "Sweden", abbreviation: "SE" },
      ])
    ).toBe("No");
  });

  it("keeps unmatched labels readable without team metadata", () => {
    expect(compactMatchupOutcomeName("Draw (full time)", undefined)).toBe(
      "Draw"
    );
  });

  it("recognizes an explicit team alias without substring collisions", () => {
    expect(
      compactMatchupOutcomeName("Windies", [
        teams[0],
        { ...teams[1], alias: "Windies" },
      ])
    ).toBe("WST");
  });

  it("preserves labels when an exact alias belongs to both teams", () => {
    expect(
      compactMatchupOutcomeName("United", [
        { name: "Manchester United", abbreviation: "MUN", alias: "United" },
        { name: "Leeds United", abbreviation: "LEE", alias: "United" },
      ])
    ).toBe("United");
  });

  it("compacts named matchup outcomes using team abbreviations", () => {
    expect(
      compactMatchupOutcomeName("India", [
        { name: "India", abbreviation: "IND4" },
        { name: "Afghanistan", abbreviation: "AFG2" },
      ])
    ).toBe("IND4");

    expect(
      compactMatchupOutcomeName("Afghanistan", [
        { name: "India", abbreviation: "IND4" },
        { name: "Afghanistan", abbreviation: "AFG2" },
      ])
    ).toBe("AFG2");
  });
});
