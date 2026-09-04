import { describe, expect, it } from "vitest";
import { evaluateRegionTrading, type RegionPolicy } from "./region";

const policy: RegionPolicy = {
  blocked: ["IR", "UA-43"],
  closeOnly: ["US", "CA-ON", "IR"],
};

describe("evaluateRegionTrading", () => {
  it("opens trading for a country the policy does not name", () => {
    expect(evaluateRegionTrading(policy, { country: "DE" })).toBe("open");
  });

  it("blocks a listed country, and blocked wins over close-only", () => {
    expect(evaluateRegionTrading(policy, { country: "IR" })).toBe("blocked");
  });

  it("limits a listed country to closing positions", () => {
    expect(evaluateRegionTrading(policy, { country: "US" })).toBe("close_only");
  });

  it("matches a subdivision before its country", () => {
    expect(
      evaluateRegionTrading(policy, { country: "CA", subdivision: "ON" })
    ).toBe("close_only");
    expect(
      evaluateRegionTrading(policy, { country: "CA", subdivision: "NS" })
    ).toBe("open");
    expect(
      evaluateRegionTrading(policy, { country: "UA", subdivision: "43" })
    ).toBe("blocked");
    expect(
      evaluateRegionTrading(policy, { country: "UA", subdivision: "30" })
    ).toBe("open");
  });

  it("assumes the strictest subdivision when the location has none", () => {
    expect(evaluateRegionTrading(policy, { country: "CA" })).toBe("close_only");
    expect(evaluateRegionTrading(policy, { country: "UA" })).toBe("blocked");
  });

  it("reports an unknown location instead of guessing", () => {
    expect(evaluateRegionTrading(policy, {})).toBe("unknown");
    expect(evaluateRegionTrading(policy, { country: "XX" })).toBe("unknown");
    expect(evaluateRegionTrading(policy, { country: "T1" })).toBe("unknown");
    expect(evaluateRegionTrading(policy, { country: "" })).toBe("unknown");
  });

  it("normalises case and whitespace", () => {
    expect(
      evaluateRegionTrading(policy, { country: " us ", subdivision: "ny" })
    ).toBe("close_only");
    expect(
      evaluateRegionTrading(policy, { country: "ca", subdivision: " on" })
    ).toBe("close_only");
  });
});
