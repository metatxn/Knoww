import { describe, expect, it } from "vitest";
import { toSlimGammaEvent } from "./gamma-keyset";

describe("slim Gamma event protocol identity", () => {
  it("retains V2 version and position IDs in full market records", () => {
    const event = {
      id: "1",
      slug: "v2-event",
      title: "V2 event",
      markets: [
        {
          id: "2",
          version: "v2",
          positionIds: '["101","102"]',
          clobTokenIds: '["11","12"]',
        },
      ],
    };
    const slim = toSlimGammaEvent(
      event as Parameters<typeof toSlimGammaEvent>[0],
      true
    );
    expect(slim.markets?.[0]).toMatchObject({
      version: "v2",
      positionIds: ["101", "102"],
    });
  });
});
