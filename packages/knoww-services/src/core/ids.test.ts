import { describe, expect, it } from "vitest";
import {
  buildCanonicalId,
  isInvalidCanonicalIdError,
  isPlatformId,
  parseCanonicalId,
} from "./ids";

function expectInvalidCanonicalId(run: () => unknown): void {
  let thrown: unknown;
  try {
    run();
  } catch (error) {
    thrown = error;
  }
  expect(isInvalidCanonicalIdError(thrown)).toBe(true);
}

/**
 * Identifier rules come from docs/decisions/2026-09-03-aggregator-platform-adapters.md
 * (Canonical model > Identifiers): `platform:sourceId`, split at the first
 * colon, Kalshi tickers kept uppercase verbatim.
 */
describe("parseCanonicalId", () => {
  it("splits a Polymarket condition id", () => {
    expect(
      parseCanonicalId(
        "polymarket:0x1f2a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708"
      )
    ).toEqual({
      platform: "polymarket",
      sourceId:
        "0x1f2a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708",
    });
  });

  it("keeps a Kalshi ticker uppercase and verbatim", () => {
    expect(parseCanonicalId("kalshi:KXBTC-25SEP03-T110000")).toEqual({
      platform: "kalshi",
      sourceId: "KXBTC-25SEP03-T110000",
    });
  });

  it("splits at the first colon only", () => {
    expect(parseCanonicalId("kalshi:KXA:B").sourceId).toBe("KXA:B");
  });

  it("rejects an unknown platform", () => {
    expectInvalidCanonicalId(() => parseCanonicalId("limitless:abc"));
  });

  it("rejects a missing separator", () => {
    expectInvalidCanonicalId(() => parseCanonicalId("polymarket"));
  });

  it("rejects an empty source id", () => {
    expectInvalidCanonicalId(() => parseCanonicalId("polymarket:"));
  });

  it("does not lowercase the platform segment", () => {
    expectInvalidCanonicalId(() => parseCanonicalId("Polymarket:0xabc"));
  });
});

describe("buildCanonicalId", () => {
  it("joins platform and source id with a colon", () => {
    expect(buildCanonicalId("polymarket", "0xabc")).toBe("polymarket:0xabc");
  });

  it("rejects an empty source id", () => {
    expectInvalidCanonicalId(() => buildCanonicalId("polymarket", ""));
  });
});

describe("isPlatformId", () => {
  it("accepts the two known platforms", () => {
    expect(isPlatformId("polymarket")).toBe(true);
    expect(isPlatformId("kalshi")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isPlatformId("limitless")).toBe(false);
    expect(isPlatformId("")).toBe(false);
  });
});
