"use client";

import { useQuery } from "@tanstack/react-query";

/**
 * Whale Activity Hook
 *
 * Fetches recent large trades from top traders (whales) across all markets.
 */

export interface WhaleTrader {
  address: string;
  name: string | null;
  profileImage: string | null;
  rank: number;
  totalPnl: number;
  totalVolume: number;
}

export interface WhaleTrade {
  side: "BUY" | "SELL";
  size: number;
  price: number;
  usdcAmount: number;
  outcome: string;
  outcomeIndex: number;
}

export interface WhaleMarket {
  conditionId: string;
  title: string;
  slug: string;
  eventSlug: string;
  image?: string;
}

export interface WhaleActivity {
  id: string;
  timestamp: string;
  trader: WhaleTrader;
  trade: WhaleTrade;
  market: WhaleMarket;
}

export interface WhaleActivityResponse {
  success: boolean;
  activities: WhaleActivity[];
  whaleCount: number;
  totalTrades: number;
  lastUpdated: string;
  error?: string;
}

export interface UseWhaleActivityOptions {
  /** Number of top traders to track (default: 15, max: 100) */
  whaleCount?: number;
  /** Minimum trade size in USDC to include (default: 100) */
  minTradeSize?: number;
  /** Number of recent trades per whale (default: 5, max: 100) */
  tradesPerWhale?: number;
  /** Time period for leaderboard: DAY, WEEK, MONTH, ALL */
  timePeriod?: "DAY" | "WEEK" | "MONTH" | "ALL";
  /** Enable/disable the query */
  enabled?: boolean;
  /** Refetch interval in milliseconds (default: 60000 = 1 minute) */
  refetchInterval?: number;
}

/**
 * Fetch whale activity from the API
 */
async function fetchWhaleActivity(
  options: UseWhaleActivityOptions
): Promise<WhaleActivityResponse> {
  const params = new URLSearchParams();

  if (options.whaleCount) {
    params.set("whaleCount", options.whaleCount.toString());
  }
  if (options.minTradeSize) {
    params.set("minTradeSize", options.minTradeSize.toString());
  }
  if (options.tradesPerWhale) {
    params.set("tradesPerWhale", options.tradesPerWhale.toString());
  }
  if (options.timePeriod) {
    params.set("timePeriod", options.timePeriod);
  }

  const response = await fetch(`/api/whales/activity?${params.toString()}`);

  if (!response.ok) {
    const errorData = (await response.json()) as { error?: string };
    throw new Error(errorData.error || "Failed to fetch whale activity");
  }

  return response.json();
}

/**
 * Hook to fetch whale activity (recent large trades from top traders)
 *
 * @param options - Query options
 * @returns Query result with whale activity data
 *
 * @example
 * ```tsx
 * const { data, isLoading, error } = useWhaleActivity({
 *   whaleCount: 20,
 *   minTradeSize: 500,
 * });
 *
 * if (isLoading) return <Loading />;
 *
 * return (
 *   <div>
 *     <p>Tracking {data.whaleCount} whales</p>
 *     {data.activities.map(activity => (
 *       <WhaleActivityRow key={activity.id} activity={activity} />
 *     ))}
 *   </div>
 * );
 * ```
 */
export function useWhaleActivity(options: UseWhaleActivityOptions = {}) {
  const {
    whaleCount = 15,
    minTradeSize = 100,
    tradesPerWhale = 5,
    timePeriod = "WEEK",
    enabled = true,
    refetchInterval = 60 * 1000, // 1 minute
  } = options;

  return useQuery<WhaleActivityResponse, Error>({
    queryKey: [
      "whaleActivity",
      whaleCount,
      minTradeSize,
      tradesPerWhale,
      timePeriod,
    ],
    queryFn: () =>
      fetchWhaleActivity({
        whaleCount,
        minTradeSize,
        tradesPerWhale,
        timePeriod,
      }),
    enabled,
    staleTime: 60 * 1000, // 1 minute - increased from 30s to reduce redundant fetches
    gcTime: 5 * 60 * 1000, // 5 minutes - keep data in cache longer
    refetchInterval,
  });
}

/**
 * Hook to fetch whale activity with larger trade threshold (for "big moves" view)
 */
export function useWhaleBigMoves() {
  return useWhaleActivity({
    whaleCount: 25,
    minTradeSize: 1000, // Only trades >= $1000
    tradesPerWhale: 10,
  });
}

/**
 * Hook to fetch whale activity for a specific market
 */
export function useMarketWhaleActivity(
  conditionId: string | undefined,
  options: Omit<UseWhaleActivityOptions, "enabled"> = {}
) {
  const query = useWhaleActivity({
    ...options,
    enabled: !!conditionId,
  });

  // Filter activities for the specific market
  const filteredActivities =
    query.data?.activities.filter(
      (activity) => activity.market.conditionId === conditionId
    ) || [];

  return {
    ...query,
    data: query.data
      ? {
          ...query.data,
          activities: filteredActivities,
          totalTrades: filteredActivities.length,
        }
      : undefined,
  };
}

/**
 * Get summary statistics from whale activity
 */
export function getWhaleActivityStats(activities: WhaleActivity[]) {
  const buyActivities = activities.filter((a) => a.trade.side === "BUY");
  const sellActivities = activities.filter((a) => a.trade.side === "SELL");

  const totalBuyVolume = buyActivities.reduce(
    (sum, a) => sum + a.trade.usdcAmount,
    0
  );
  const totalSellVolume = sellActivities.reduce(
    (sum, a) => sum + a.trade.usdcAmount,
    0
  );

  const uniqueTraders = new Set(activities.map((a) => a.trader.address)).size;
  const uniqueMarkets = new Set(activities.map((a) => a.market.conditionId))
    .size;

  // Calculate buy/sell ratio
  const buyRatio =
    totalBuyVolume + totalSellVolume > 0
      ? totalBuyVolume / (totalBuyVolume + totalSellVolume)
      : 0.5;

  return {
    totalTrades: activities.length,
    buyCount: buyActivities.length,
    sellCount: sellActivities.length,
    totalBuyVolume,
    totalSellVolume,
    totalVolume: totalBuyVolume + totalSellVolume,
    uniqueTraders,
    uniqueMarkets,
    buyRatio,
    sentiment:
      buyRatio > 0.6 ? "bullish" : buyRatio < 0.4 ? "bearish" : "neutral",
  };
}
