import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EventCardSkeleton, skeletonVisibilityClass } from "./event-card";

function displayAt(index: number, breakpoint: string, precedingCards = 0) {
  const utilities = skeletonVisibilityClass(index, precedingCards).split(" ");
  let display = "flex";
  const prefixes = ["", "sm:", "lg:", "xl:", "2xl:"];
  for (const prefix of prefixes) {
    if (utilities.includes(`${prefix}hidden`)) display = "hidden";
    if (utilities.includes(`${prefix}flex`)) display = "flex";
    if (utilities.includes(`${prefix}block`)) display = "block";
    if (prefix === breakpoint) break;
  }
  return display;
}

describe("responsive event skeletons", () => {
  it.each(["", "sm:", "lg:", "xl:", "2xl:"])(
    "keeps every visible skeleton flex at %s",
    (breakpoint) => {
      for (let index = 0; index < 10; index++) {
        expect(["flex", "hidden"]).toContain(displayAt(index, breakpoint));
      }
    }
  );

  it.each([
    ["", 0, 4],
    ["sm:", 0, 4],
    ["lg:", 0, 6],
    ["xl:", 0, 8],
    ["2xl:", 0, 10],
    ["sm:", 21, 3],
    ["lg:", 20, 4],
    ["xl:", 21, 7],
    ["2xl:", 21, 9],
  ] as const)(
    "shows %s placeholders after %i existing cards with a budget of %i",
    (breakpoint, precedingCards, expectedCount) => {
      expect(
        Array.from({ length: 10 }, (_, index) =>
          displayAt(index, breakpoint, precedingCards)
        ).filter((display) => display !== "hidden")
      ).toHaveLength(expectedCount);
    }
  );

  it("marks decorative loading cards as hidden from assistive technology", () => {
    const { container } = render(<EventCardSkeleton />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});
