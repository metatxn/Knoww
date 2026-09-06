import type { OrderDraft, WalletIdentity } from "@knoww/services/core";
import { describe, expect, it } from "vitest";
import {
  polymarketDraftRequirements,
  toCanonicalOrderIntent,
} from "./order-bridge";

const CONDITION_ID =
  "0x1111111111111111111111111111111111111111111111111111111111111111";
const TOKEN_ID = "12345678901234567890";

const identity: WalletIdentity = {
  kind: "wallet",
  platform: "polymarket",
  address: "0x00000000000000000000000000000000000000a1",
  accountType: "safe",
  tradingAddress: "0x00000000000000000000000000000000000000b2",
};

const base = { tokenId: TOKEN_ID, conditionId: CONDITION_ID };

describe("toCanonicalOrderIntent", () => {
  it("keeps the four recorded order shapes: limit and market, buy and sell", () => {
    // The expectations are the canonical ORDER_CASES the adapter-hook golden
    // test places, so the legacy ticket and the adapter path agree.
    expect(
      toCanonicalOrderIntent(
        { ...base, side: "BUY", orderType: "GTC", price: 0.5, size: 10 },
        identity
      )
    ).toEqual({
      schemaVersion: "1",
      platform: "polymarket",
      identity,
      marketId: `polymarket:${CONDITION_ID}`,
      outcomeId: `polymarket:${TOKEN_ID}`,
      side: "buy",
      orderType: "limit",
      timeInForce: "gtc",
      price: "0.5",
      quantity: { kind: "shares", value: "10" },
    });

    expect(
      toCanonicalOrderIntent(
        {
          ...base,
          side: "BUY",
          orderType: "FAK",
          price: 0,
          size: 0,
          amount: 25,
        },
        identity
      )
    ).toMatchObject({
      side: "buy",
      orderType: "market",
      timeInForce: "ioc",
      quantity: { kind: "notional", amount: { value: "25", unit: "USD" } },
    });
    expect(
      toCanonicalOrderIntent(
        {
          ...base,
          side: "BUY",
          orderType: "FAK",
          price: 0,
          size: 0,
          amount: 25,
        },
        identity
      )
    ).not.toHaveProperty("price");

    expect(
      toCanonicalOrderIntent(
        { ...base, side: "SELL", orderType: "GTC", price: 0.62, size: 7.5 },
        identity
      )
    ).toMatchObject({
      side: "sell",
      orderType: "limit",
      timeInForce: "gtc",
      price: "0.62",
      quantity: { kind: "shares", value: "7.5" },
    });

    expect(
      toCanonicalOrderIntent(
        { ...base, side: "SELL", orderType: "FOK", price: 0.4, size: 12 },
        identity
      )
    ).toMatchObject({
      side: "sell",
      orderType: "market",
      timeInForce: "fok",
      price: "0.4",
      quantity: { kind: "shares", value: "12" },
    });
  });

  it("defaults a ticket without an order type to a resting limit", () => {
    expect(
      toCanonicalOrderIntent(
        { ...base, side: "BUY", price: 0.5, size: 10 },
        identity
      )
    ).toMatchObject({ orderType: "limit", timeInForce: "gtc" });
  });

  it("turns a GTD unix expiry into the ISO timestamp the intent carries", () => {
    expect(
      toCanonicalOrderIntent(
        {
          ...base,
          side: "BUY",
          orderType: "GTD",
          price: 0.5,
          size: 10,
          expiration: 1_800_000_000,
        },
        identity
      )
    ).toMatchObject({
      orderType: "limit",
      timeInForce: "gtd",
      expiresAt: "2027-01-15T08:00:00.000Z",
    });
    expect(() =>
      toCanonicalOrderIntent(
        { ...base, side: "BUY", orderType: "GTD", price: 0.5, size: 10 },
        identity
      )
    ).toThrow(/expir/i);
  });

  it("writes tiny prices as plain decimals, never exponent notation", () => {
    expect(
      toCanonicalOrderIntent(
        { ...base, side: "BUY", orderType: "GTC", price: 0.0000001, size: 10 },
        identity
      ).price
    ).toBe("0.0000001");
  });

  it("refuses a ticket that does not name the market", () => {
    expect(() =>
      toCanonicalOrderIntent(
        {
          tokenId: TOKEN_ID,
          side: "SELL",
          orderType: "FAK",
          price: 0.4,
          size: 1,
        },
        identity
      )
    ).toThrow(/market/i);
  });
});

function draftWith(platformDetails: OrderDraft["platformDetails"]): OrderDraft {
  return { platformDetails } as OrderDraft;
}

describe("polymarketDraftRequirements", () => {
  it("reads what a BUY must reserve on chain as raw pUSD amounts", () => {
    expect(
      polymarketDraftRequirements(
        draftWith({
          platform: "polymarket",
          negRisk: true,
          requiredCollateralRaw: "5125000",
          reservedCollateralRaw: "5000000",
          requiredNotionalRaw: "5000000",
          estimatedFeeRaw: "125000",
        })
      )
    ).toEqual({
      negRisk: true,
      buy: {
        requiredCollateralRaw: BigInt(5_125_000),
        reservedCollateralRaw: BigInt(5_000_000),
        requiredNotionalRaw: BigInt(5_000_000),
        estimatedFeeRaw: BigInt(125_000),
      },
      sell: null,
    });
  });

  it("keeps an unknown fee estimate as unknown, not zero", () => {
    expect(
      polymarketDraftRequirements(
        draftWith({
          platform: "polymarket",
          negRisk: false,
          requiredCollateralRaw: "5250000",
          reservedCollateralRaw: "0",
          requiredNotionalRaw: "5000000",
          estimatedFeeRaw: null,
        })
      ).buy
    ).toMatchObject({ estimatedFeeRaw: null });
  });

  it("reads the shares a SELL must hold", () => {
    expect(
      polymarketDraftRequirements(
        draftWith({
          platform: "polymarket",
          negRisk: false,
          requiredConditionalRaw: "7500000",
        })
      )
    ).toEqual({
      negRisk: false,
      buy: null,
      sell: { requiredConditionalRaw: BigInt(7_500_000) },
    });
  });

  it("rejects a draft from another platform", () => {
    expect(() =>
      polymarketDraftRequirements(draftWith({ platform: "kalshi" }))
    ).toThrow(/polymarket/i);
  });
});
