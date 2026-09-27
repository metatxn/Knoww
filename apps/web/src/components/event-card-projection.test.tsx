import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { toSlimGammaEvent } from "@/lib/gamma-keyset";
import { toEventCard } from "@/polymarket/event-card-projection";
import type { GammaEvent } from "@/types/gamma-api";
import { EventCard } from "./event-card";
import { MarketsView } from "./markets-view";

const history = vi.hoisted(() =>
  vi.fn(() => ({ data: new Map(), isLoading: false }))
);
vi.mock("@/hooks/use-price-history-batch", () => ({
  useBatchPriceHistory: history,
}));
vi.mock("@/hooks/use-now", () => ({ useNow: () => 1_790_000_000_000 }));

function event(count: number, grouped = true): GammaEvent {
  return {
    id: `event-${count}-${grouped}`,
    slug: `event-${count}-${grouped}`,
    title: "Tournament winner",
    volume24hr: 1250,
    liquidity: 2500,
    markets: Array.from({ length: count }, (_, i) => ({
      id: `market-${i}`,
      question:
        i === count - 1 ? "A different question" : `Will candidate ${i} win?`,
      groupItemTitle: grouped
        ? i === 0
          ? "Team A"
          : `Candidate ${i}`
        : undefined,
      outcomes: '["Yes","No"]',
      outcomePrices: JSON.stringify([
        String(1 - i / (count + 1)),
        String(i / (count + 1)),
      ]),
      clobTokenIds: JSON.stringify([`yes-${i}`, `no-${i}`]),
    })),
  } as unknown as GammaEvent;
}

describe("card projection blast radius", () => {
  it.each([
    [0, true],
    [1, true],
    [2, true],
    [330, true],
    [20, false],
  ] as const)(
    "preserves desktop, mobile, and chart inputs for %i markets, grouped=%s",
    (count, grouped) => {
      const raw = event(count, grouped);
      const full = toSlimGammaEvent(raw, true);
      const card = toEventCard(raw);
      expect(card.marketCount).toBe(count);
      expect(card).not.toHaveProperty("markets");
      expect(card.cardTopMarkets.length).toBeLessThanOrEqual(4);
      expect(card.cardOutcomes.length).toBeLessThanOrEqual(3);

      const fullMobile = renderToStaticMarkup(<EventCard event={full} />);
      expect(renderToStaticMarkup(<EventCard event={card} />)).toBe(fullMobile);

      const props = { viewMode: "new" as const, onViewChange: () => {} };
      const fullDesktop = renderToStaticMarkup(
        <MarketsView {...props} events={[full]} />
      );
      const fullHistory = history.mock.lastCall;
      expect(
        renderToStaticMarkup(<MarketsView {...props} events={[card]} />)
      ).toBe(fullDesktop);
      expect(history.mock.lastCall).toEqual(fullHistory);
    }
  );

  it("keeps multi-market cards featured even when only one named candidate remains", () => {
    const multi = event(2);
    const binary = {
      ...event(1),
      id: "binary",
      title: "Binary",
      volume24hr: 99999,
    };
    const props = { viewMode: "new" as const, onViewChange: () => {} };
    expect(
      renderToStaticMarkup(
        <MarketsView
          {...props}
          events={[toEventCard(binary), toEventCard(multi)]}
        />
      )
    ).toBe(
      renderToStaticMarkup(
        <MarketsView
          {...props}
          events={[
            toSlimGammaEvent(binary, true),
            toSlimGammaEvent(multi, true),
          ]}
        />
      )
    );
  });
});
