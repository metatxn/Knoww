import { useQuery } from "@tanstack/react-query";

interface Market {
  id: string;
  question: string;
  description?: string;
  slug?: string;
  image?: string;
  icon?: string;
  endDate?: string;
  end_date_iso?: string;
  volume?: string;
  volumeNum?: number;
  liquidity?: string;
  liquidityNum?: number;
  active?: boolean;
  closed?: boolean;
  outcomes?: string;
  outcomePrices?: string;
  clobTokenIds?: string;
  volume24hr?: number;
  oneDayPriceChange?: number;
  lastTradePrice?: number;
  bestBid?: number;
  bestAsk?: number;
  spread?: number;
}

interface MarketDetailResponse {
  success: boolean;
  market?: Market;
  error?: string;
}

/**
 * Fetch market by slug (user-friendly URLs)
 * Internally uses ID-based API for better performance
 */
export function useMarketDetail(slug: string | undefined) {
  return useQuery({
    queryKey: ["market-detail", slug],
    queryFn: async () => {
      if (!slug) {
        throw new Error("Market slug is required");
      }

      const response = await fetch(`/api/markets/slug/${slug}`);

      if (!response.ok) {
        throw new Error("Failed to fetch market");
      }

      const data: MarketDetailResponse = await response.json();

      if (!data.success || !data.market) {
        throw new Error(data.error || "Market not found");
      }

      return data.market;
    },
    enabled: !!slug, // Only run query if slug is provided
    staleTime: 60 * 1000, // 1 minute
  });
}
