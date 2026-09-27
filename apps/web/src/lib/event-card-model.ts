import {
  parseGammaNumberArray,
  parseGammaStringArray,
} from "@knoww/shared-types/polymarket";

export interface CardTopMarket {
  id: string;
  title: string;
  yes: number;
  no: number;
  tokenId?: string;
}
export interface CardOutcome {
  name: string;
  price: number;
}
export interface EventCardSummary {
  marketCount?: number;
  cardTopMarkets?: CardTopMarket[];
  cardOutcomes?: CardOutcome[];
}
export interface CardEventSource extends EventCardSummary {
  markets?: Array<{
    id: string;
    question?: string;
    groupItemTitle?: string;
    outcomes?: string;
    outcomePrices?: string;
    clobTokenIds?: string | string[];
  }>;
}

function isGenericPlaceholderCandidate(title: string): boolean {
  return /^(?:team|app|car|player|candidate|option|choice)\s+[a-z]$/i.test(
    title.trim()
  );
}

export function extractTopMarkets(
  event: CardEventSource,
  limit = 3
): CardTopMarket[] {
  if (event.cardTopMarkets) return event.cardTopMarkets.slice(0, limit);
  const markets = event.markets ?? [];
  const parsed: CardTopMarket[] = [];
  for (const m of markets) {
    const prices = parseGammaNumberArray(m.outcomePrices);
    if (prices.length < 2) continue;
    const yes = prices[0];
    const no = prices[1];
    if (Number.isNaN(yes) || Number.isNaN(no)) continue;
    const title = m.groupItemTitle || m.question || "Outcome";
    parsed.push({
      id: m.id,
      title,
      yes,
      no,
      tokenId: parseGammaStringArray(m.clobTokenIds)[0],
    });
  }
  const namedCandidates = parsed.filter(
    (market) => !isGenericPlaceholderCandidate(market.title)
  );
  const candidates = namedCandidates.length > 0 ? namedCandidates : parsed;
  candidates.sort((a, b) => b.yes - a.yes);
  return candidates.slice(0, limit);
}

export function extractCardOutcomes(event: CardEventSource): CardOutcome[] {
  if (event.cardOutcomes) return event.cardOutcomes;
  const markets = event.markets || [];
  if (markets.length === 0) return [];

  if (markets.length > 1) {
    // Use groupItemTitle when available (clean candidate name, e.g.
    // "Brazil", "Gavin Newsom"). When absent, fall back to `question`
    // but strip any common prefix across markets so rows don't all
    // read as near-identical strings.
    const rawNames = markets.map((m) => m.groupItemTitle || m.question || "");
    const hasGroupTitles = markets.every((m) => Boolean(m.groupItemTitle));

    let names = rawNames;
    if (!hasGroupTitles && rawNames.length > 1) {
      // Longest common prefix across all names.
      let prefix = rawNames[0];
      for (const n of rawNames.slice(1)) {
        while (prefix && !n.startsWith(prefix)) {
          prefix = prefix.slice(0, -1);
        }
        if (!prefix) break;
      }
      if (prefix.length >= 4) {
        // Strip the prefix plus any leading separator junk (" - ",
        // ": ", etc.) that would otherwise render as " — ? 50%".
        // If stripping leaves the name empty (happens when one
        // market's full question IS the shared prefix), fall back
        // to the original — truncate will handle overflow.
        names = rawNames.map((n) => {
          const remainder = n
            .slice(prefix.length)
            .replace(/^[\s\-:–—|,/]+/, "")
            .trim();
          return remainder || n;
        });
      }
    }

    return markets
      .map((m, i) => {
        const prices = parseGammaNumberArray(m.outcomePrices);
        const price = prices[0] ?? 0;
        return {
          name: names[i] || rawNames[i],
          price: Number.isFinite(price) ? price : 0,
        };
      })
      .filter((o) => o.name && o.price > 0)
      .sort((a, b) => b.price - a.price)
      .slice(0, 3);
  }

  const m = markets[0];
  const names = parseGammaStringArray(m.outcomes);
  const prices = parseGammaNumberArray(m.outcomePrices);
  return names
    .map((name, i) => {
      const price = prices[i] ?? 0;
      return {
        name,
        price: Number.isFinite(price) ? price : 0,
      };
    })
    .filter((o) => o.name)
    .slice(0, 3);
}
