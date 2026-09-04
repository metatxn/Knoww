import { describe, expect, it } from "vitest";
import {
  buildCanonicalId,
  InvalidCanonicalIdError,
  isPlatformId,
  parseCanonicalId,
} from "./ids";

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
    expect(() => parseCanonicalId("limitless:abc")).toThrow(
      InvalidCanonicalIdError
    );
  });

  it("rejects a missing separator", () => {
    expect(() => parseCanonicalId("polymarket")).toThrow(
      InvalidCanonicalIdError
    );
  });

  it("rejects an empty source id", () => {
    expect(() => parseCanonicalId("polymarket:")).toThrow(
      InvalidCanonicalIdError
    );
  });

  it("does not lowercase the platform segment", () => {
    expect(() => parseCanonicalId("Polymarket:0xabc")).toThrow(
      InvalidCanonicalIdError
    );
  });
});

describe("buildCanonicalId", () => {
  it("joins platform and source id with a colon", () => {
    expect(buildCanonicalId("polymarket", "0xabc")).toBe("polymarket:0xabc");
  });

  it("round-trips through parseCanonicalId", () => {
    const id = buildCanonicalId("kalshi", "KXBTC-25SEP03");
    expect(parseCanonicalId(id)).toEqual({
      platform: "kalshi",
      sourceId: "KXBTC-25SEP03",
    });
  });

  it("rejects an empty source id", () => {
    expect(() => buildCanonicalId("polymarket", "")).toThrow(
      InvalidCanonicalIdError
    );
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
