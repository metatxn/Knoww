import { describe, expect, it } from "vitest";
import type { MarketCapabilities } from "./capabilities";
import {
  applyCapabilityOverrides,
  parseCapabilityOverrides,
  parseEnabledPlatforms,
} from "./enablement";

/**
 * Flag semantics come from docs/decisions/2026-09-03-aggregator-platform-adapters.md
 * (Adapters and the registry > Enablement flags):
 *   KNOWW_ENABLED_PLATFORMS            comma list, default "polymarket"
 *   KNOWW_PLATFORM_CAPABILITY_OVERRIDES comma list of platform.capability=off
 */
describe("parseEnabledPlatforms", () => {
  it("defaults to polymarket when unset", () => {
    expect(parseEnabledPlatforms(undefined)).toEqual(["polymarket"]);
  });

  it("treats a blank value as unset", () => {
    expect(parseEnabledPlatforms("  ")).toEqual(["polymarket"]);
  });

  it("keeps the flag order as the display order", () => {
    expect(parseEnabledPlatforms("kalshi,polymarket")).toEqual([
      "kalshi",
      "polymarket",
    ]);
  });

  it("trims whitespace and lowercases entries", () => {
    expect(parseEnabledPlatforms(" Polymarket , KALSHI ")).toEqual([
      "polymarket",
      "kalshi",
    ]);
  });

  it("drops duplicates", () => {
    expect(parseEnabledPlatforms("polymarket,polymarket")).toEqual([
      "polymarket",
    ]);
  });

  it("drops unknown platform ids", () => {
    expect(parseEnabledPlatforms("polymarket,limitless")).toEqual([
      "polymarket",
    ]);
  });

  it("falls back to the default when every entry is unknown", () => {
    expect(parseEnabledPlatforms("limitless")).toEqual(["polymarket"]);
  });
});

const ALL_ON: MarketCapabilities = {
  marketData: true,
  orderbook: true,
  priceHistory: true,
  publicTrades: true,
  accountPositions: true,
  accountOrders: true,
  createOrder: true,
  cancelOrder: true,
  redeem: true,
  withdrawals: true,
};

describe("parseCapabilityOverrides", () => {
  it("returns no overrides when unset", () => {
    expect(parseCapabilityOverrides(undefined)).toEqual([]);
  });

  it("parses platform.capability=off entries", () => {
    expect(
      parseCapabilityOverrides(
        "polymarket.createOrder=off, polymarket.cancelOrder=off"
      )
    ).toEqual([
      { platform: "polymarket", capability: "createOrder", enabled: false },
      { platform: "polymarket", capability: "cancelOrder", enabled: false },
    ]);
  });

  it("ignores entries with an unknown platform", () => {
    expect(parseCapabilityOverrides("limitless.createOrder=off")).toEqual([]);
  });

  it("ignores entries with an unknown capability", () => {
    expect(parseCapabilityOverrides("polymarket.teleport=off")).toEqual([]);
  });

  it("ignores values other than off", () => {
    expect(parseCapabilityOverrides("polymarket.createOrder=on")).toEqual([]);
  });

  it("ignores malformed entries", () => {
    expect(parseCapabilityOverrides("polymarket,createOrder=off")).toEqual([]);
  });
});

describe("applyCapabilityOverrides", () => {
  it("turns the named capability off for the named platform", () => {
    const result = applyCapabilityOverrides("polymarket", ALL_ON, [
      { platform: "polymarket", capability: "createOrder", enabled: false },
    ]);
    expect(result).toEqual({ ...ALL_ON, createOrder: false });
  });

  it("does not apply overrides meant for another platform", () => {
    const result = applyCapabilityOverrides("polymarket", ALL_ON, [
      { platform: "kalshi", capability: "createOrder", enabled: false },
    ]);
    expect(result).toEqual(ALL_ON);
  });

  it("does not mutate the input", () => {
    const input = { ...ALL_ON };
    applyCapabilityOverrides("polymarket", input, [
      { platform: "polymarket", capability: "redeem", enabled: false },
    ]);
    expect(input).toEqual(ALL_ON);
  });
});
