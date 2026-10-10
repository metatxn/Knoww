interface OrderTokenMarket {
  question?: string;
  outcome?: string;
  eventSlug?: string;
  slug?: string;
  icon?: string;
}

export interface OrderMarketResponse {
  success?: boolean;
  tokens?: {
    tokenId: string;
    title?: string | null;
    outcome?: string | null;
    eventSlug?: string | null;
    marketSlug?: string | null;
  }[];
  market?: OrderTokenMarket;
}

/** Batch open-order metadata; older servers and unknown tokens use Gamma lookup. */
export async function loadOrderTokenMarkets(
  tokenIds: readonly string[],
  readJson: (path: string) => Promise<OrderMarketResponse | null>
): Promise<Map<string, OrderTokenMarket>> {
  const ids = [...new Set(tokenIds.filter(Boolean))];
  const markets = new Map<string, OrderTokenMarket>();
  for (let offset = 0; offset < ids.length; offset += 50) {
    const batch = ids.slice(offset, offset + 50);
    const query = new URLSearchParams({ tokenIds: batch.join(",") });
    const response = await readJson(
      `/api/polymarket/markets/tokens?${query}`
    ).catch(() => null);
    if (response?.success && Array.isArray(response.tokens)) {
      for (const token of response.tokens) {
        // Unknown IDs are absent upstream, so array position is not identity.
        if (
          !batch.includes(token.tokenId) ||
          !token.title ||
          token.outcome == null ||
          (!token.eventSlug && !token.marketSlug)
        )
          continue;
        markets.set(token.tokenId, {
          question: token.title,
          outcome: token.outcome,
          ...(token.eventSlug ? { eventSlug: token.eventSlug } : {}),
          ...(token.marketSlug ? { slug: token.marketSlug } : {}),
        });
      }
    }
    await Promise.all(
      batch
        .filter((id) => !markets.has(id))
        .map(async (id) => {
          const fallback = await readJson(
            `/api/polymarket/markets/by-token/${encodeURIComponent(id)}`
          ).catch(() => null);
          if (fallback?.success && fallback.market)
            markets.set(id, fallback.market);
        })
    );
  }
  return markets;
}
