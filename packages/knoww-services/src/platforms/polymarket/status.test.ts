import { describe, expect, it } from "vitest";
import { mapPolymarketStatus } from "./status";

// Rows follow the status table in docs/single-api-layer.md ("Market status").
describe("mapPolymarketStatus", () => {
  it("maps a market that is not yet accepting orders and not closed to unopened", () => {
    expect(
      mapPolymarketStatus({
        active: false,
        closed: false,
        acceptingOrders: false,
      })
    ).toBe("unopened");
  });

  it("maps a market the venue has not opened to unopened even when its book already accepts orders", () => {
    expect(
      mapPolymarketStatus({
        active: false,
        closed: false,
        acceptingOrders: true,
      })
    ).toBe("unopened");
  });

  it("maps an active market that accepts orders to active", () => {
    expect(
      mapPolymarketStatus({
        active: true,
        closed: false,
        acceptingOrders: true,
      })
    ).toBe("active");
  });

  it("treats an open market without an acceptingOrders flag as active", () => {
    expect(mapPolymarketStatus({ active: true, closed: false })).toBe("active");
  });

  it("maps an active market that is not accepting orders to paused", () => {
    expect(
      mapPolymarketStatus({
        active: true,
        closed: false,
        acceptingOrders: false,
      })
    ).toBe("paused");
  });

  it("maps a closed market without a proposed resolution to closed", () => {
    expect(
      mapPolymarketStatus({
        active: true,
        closed: true,
        acceptingOrders: false,
        umaResolutionStatuses: "[]",
      })
    ).toBe("closed");
  });

  it.each(["proposed", "disputed", "challenged"])(
    "maps a closed market with a %s resolution to resolving",
    (umaResolutionStatus) => {
      expect(
        mapPolymarketStatus({
          active: true,
          closed: true,
          acceptingOrders: false,
          umaResolutionStatus,
        })
      ).toBe("resolving");
    }
  );

  it("maps a resolved market to resolved", () => {
    expect(
      mapPolymarketStatus({
        active: true,
        closed: true,
        acceptingOrders: false,
        umaResolutionStatus: "resolved",
      })
    ).toBe("resolved");
  });

  it("reads the plural umaResolutionStatuses field when the singular one is absent", () => {
    expect(
      mapPolymarketStatus({
        active: true,
        closed: true,
        acceptingOrders: false,
        umaResolutionStatuses: '["proposed"]',
      })
    ).toBe("resolving");
  });

  it("keeps an open market with a proposed resolution active while it accepts orders", () => {
    expect(
      mapPolymarketStatus({
        active: true,
        closed: false,
        acceptingOrders: true,
        umaResolutionStatus: "proposed",
      })
    ).toBe("active");
  });

  it("returns unknown for an unlisted resolution status instead of guessing", () => {
    expect(
      mapPolymarketStatus({
        active: true,
        closed: true,
        acceptingOrders: false,
        umaResolutionStatus: "something-new",
      })
    ).toBe("unknown");
  });

  it("returns unknown when no flags are present", () => {
    expect(mapPolymarketStatus({})).toBe("unknown");
  });
});
