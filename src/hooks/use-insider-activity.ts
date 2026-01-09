"use client";

import { useQuery } from "@tanstack/react-query";

/**
 * Insider/Suspicious Activity Hook
 *
 * Fetches potential insider activity - new accounts that opened positions
 * contrary to market sentiment.
 */

export interface SuspiciousAccount {
  address: string;
  name: string | null;
  profileImage: string | null;
  firstTradeDate: string;
  accountAgeHours: number;
  totalTrades: number;
}

export interface SuspiciousTrade {
  side: "BUY" | "SELL";
  outcome: string;
  outcomeIndex: number;
  size: number;
  price: number;
  usdcAmount: number;
}

export interface SuspiciousMarket {
  conditionId: string;
  title: string;
  slug: string;
  eventSlug: string;
  image?: string;
  currentPrice: number;
}

export interface SuspiciousAnalysis {
  suspicionScore: number;
  isContrarian: boolean;
  marketSentiment: "BULLISH" | "BEARISH" | "NEUTRAL";
  reason: string;
}

export interface SuspiciousActivity {
  id: string;
  timestamp: string;
  account: SuspiciousAccount;
  trade: SuspiciousTrade;
  market: SuspiciousMarket;
  analysis: SuspiciousAnalysis;
}

export interface SuspiciousActivityStats {
  totalTradesScanned: number;
  uniqueTradersFound: number;
  newAccountsFound: number;
  suspiciousActivities: number;
}

export interface SuspiciousActivityResponse {
  success: boolean;
  activities: SuspiciousActivity[];
  stats: SuspiciousActivityStats;
  lastUpdated: string;
  error?: string;
}

export interface UseInsiderActivityOptions {
  /** Maximum account age in hours to consider as "new" (default: 168 = 7 days, max: 336 = 14 days) */
  maxAccountAge?: number;
  /** Minimum trade value in USD to include (default: 5000) */
  minUsdValue?: number;
  /** Minimum number of shares to include (default: 0 = no minimum) */
  minShares?: number;
  /** Minimum suspicion score to include (default: 30, max: 100) */
  minScore?: number;
  /** Maximum number of results (default: 50, max: 100) */
  limit?: number;
  /** Enable/disable the query */
  enabled?: boolean;
  /** Refetch interval in milliseconds (default: 120000 = 2 minutes) */
  refetchInterval?: number;
}

/**
 * Fetch suspicious/insider activity from the API
 */
async function fetchInsiderActivity(
  options: UseInsiderActivityOptions
): Promise<SuspiciousActivityResponse> {
  const params = new URLSearchParams();

  if (options.maxAccountAge) {
    params.set("maxAccountAge", options.maxAccountAge.toString());
  }
  if (options.minUsdValue !== undefined) {
    params.set("minUsdValue", options.minUsdValue.toString());
  }
  if (options.minShares !== undefined && options.minShares > 0) {
    params.set("minShares", options.minShares.toString());
  }
  if (options.minScore !== undefined) {
    params.set("minScore", options.minScore.toString());
  }
  if (options.limit) {
    params.set("limit", options.limit.toString());
  }

  const response = await fetch(`/api/whales/suspicious?${params.toString()}`);

  if (!response.ok) {
    const errorData = (await response.json()) as { error?: string };
    throw new Error(errorData.error || "Failed to fetch insider activity");
  }

  return response.json();
}

/**
 * Hook to fetch suspicious/insider activity
 *
 * Identifies new accounts that have opened positions contrary to market sentiment,
 * which may indicate insider trading or unusual activity.
 *
 * @param options - Query options
 * @returns Query result with suspicious activity data
 *
 * @example
 * ```tsx
 * const { data, isLoading, error } = useInsiderActivity({
 *   maxAccountAge: 48,
 *   minTradeSize: 500,
 *   minScore: 40,
 * });
 *
 * if (isLoading) return <Loading />;
 *
 * return (
 *   <div>
 *     <p>Found {data.stats.suspiciousActivities} suspicious activities</p>
 *     {data.activities.map(activity => (
 *       <InsiderActivityRow key={activity.id} activity={activity} />
 *     ))}
 *   </div>
 * );
 * ```
 */
export function useInsiderActivity(options: UseInsiderActivityOptions = {}) {
  const {
    maxAccountAge = 168, // Default: 7 days (168 hours)
    minUsdValue = 5000, // Default: $5000 USD
    minShares = 0, // Default: no minimum shares
    minScore = 30,
    limit = 50,
    enabled = true,
    refetchInterval = 2 * 60 * 1000, // 2 minutes
  } = options;

  return useQuery<SuspiciousActivityResponse, Error>({
    queryKey: [
      "insiderActivity",
      maxAccountAge,
      minUsdValue,
      minShares,
      minScore,
      limit,
    ],
    queryFn: () =>
      fetchInsiderActivity({
        maxAccountAge,
        minUsdValue,
        minShares,
        minScore,
        limit,
      }),
    enabled,
    staleTime: 60 * 1000, // 1 minute
    refetchInterval,
  });
}

/**
 * Hook to fetch high-confidence insider activity (stricter filters)
 */
export function useHighConfidenceInsiders() {
  return useInsiderActivity({
    maxAccountAge: 24, // Only accounts < 24 hours old
    minUsdValue: 10000, // Only trades >= $10K
    minShares: 1000, // Only trades >= 1000 shares
    minScore: 50, // Only high suspicion scores
    limit: 25,
  });
}

/**
 * Get summary statistics from suspicious activities
 */
export function getInsiderActivityStats(activities: SuspiciousActivity[]) {
  const contrarianActivities = activities.filter(
    (a) => a.analysis.isContrarian
  );
  const highScoreActivities = activities.filter(
    (a) => a.analysis.suspicionScore >= 60
  );

  const totalVolume = activities.reduce(
    (sum, a) => sum + a.trade.usdcAmount,
    0
  );

  const uniqueAccounts = new Set(activities.map((a) => a.account.address)).size;
  const uniqueMarkets = new Set(activities.map((a) => a.market.conditionId))
    .size;

  const avgAccountAge =
    activities.length > 0
      ? activities.reduce((sum, a) => sum + a.account.accountAgeHours, 0) /
        activities.length
      : 0;

  const avgSuspicionScore =
    activities.length > 0
      ? activities.reduce((sum, a) => sum + a.analysis.suspicionScore, 0) /
        activities.length
      : 0;

  // Sentiment breakdown
  const sentimentCounts = activities.reduce(
    (acc, a) => {
      acc[a.analysis.marketSentiment]++;
      return acc;
    },
    { BULLISH: 0, BEARISH: 0, NEUTRAL: 0 }
  );

  return {
    totalActivities: activities.length,
    contrarianCount: contrarianActivities.length,
    highScoreCount: highScoreActivities.length,
    totalVolume,
    uniqueAccounts,
    uniqueMarkets,
    avgAccountAge,
    avgSuspicionScore,
    sentimentBreakdown: sentimentCounts,
  };
}

/**
 * Get risk level based on suspicion score
 */
export function getSuspicionRiskLevel(
  score: number
): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  if (score >= 80) return "CRITICAL";
  if (score >= 60) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
}

/**
 * Get color class based on suspicion score
 */
export function getSuspicionColor(score: number): string {
  if (score >= 80) return "text-red-500";
  if (score >= 60) return "text-orange-500";
  if (score >= 40) return "text-yellow-500";
  return "text-green-500";
}

/**
 * Format account age for display
 */
export function formatAccountAge(hours: number): string {
  if (hours < 1) {
    const minutes = Math.round(hours * 60);
    return `${minutes}m`;
  }
  if (hours < 24) {
    return `${hours.toFixed(1)}h`;
  }
  const days = hours / 24;
  return `${days.toFixed(1)}d`;
}
