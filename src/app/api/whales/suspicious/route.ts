import { type NextRequest, NextResponse } from "next/server";
import { POLYMARKET_API } from "@/constants/polymarket";
import { checkRateLimit } from "@/lib/api-rate-limit";

/**
 * Suspicious/Insider Activity Detection API
 *
 * Detects new accounts (created within last 24-48 hours) that have opened
 * positions contrary to market sentiment - potential insider activity.
 *
 * Strategy:
 * 1. Fetch recent large trades globally from /trades endpoint
 * 2. For unique traders, check their account age (first trade timestamp)
 * 3. For new accounts, check if their position is contrarian to market sentiment
 * 4. Score and rank suspicious activities
 */

export interface SuspiciousActivity {
  id: string;
  timestamp: string;
  account: {
    address: string;
    name: string | null;
    profileImage: string | null;
    firstTradeDate: string;
    accountAgeHours: number;
    totalTrades: number;
  };
  trade: {
    side: "BUY" | "SELL";
    outcome: string;
    outcomeIndex: number;
    size: number;
    price: number;
    usdcAmount: number;
  };
  market: {
    conditionId: string;
    title: string;
    slug: string;
    eventSlug: string;
    image?: string;
    currentPrice: number; // Current market probability for this outcome
  };
  analysis: {
    suspicionScore: number; // 0-100, higher = more suspicious
    isContrarian: boolean;
    marketSentiment: "BULLISH" | "BEARISH" | "NEUTRAL";
    reason: string;
  };
}

export interface SuspiciousActivityResponse {
  success: boolean;
  activities: SuspiciousActivity[];
  stats: {
    totalTradesScanned: number;
    uniqueTradersFound: number;
    newAccountsFound: number;
    suspiciousActivities: number;
  };
  lastUpdated: string;
  error?: string;
}

interface TradeData {
  proxyWallet: string;
  side: "BUY" | "SELL";
  asset: string;
  conditionId: string;
  size: number;
  price: number;
  timestamp: number;
  title: string;
  slug: string;
  icon?: string;
  eventSlug: string;
  outcome: string;
  outcomeIndex: number;
  name: string | null;
  pseudonym: string | null;
  profileImage: string | null;
  transactionHash: string;
}

interface ActivityData {
  timestamp: number;
  type: string;
  side?: "BUY" | "SELL";
  size?: number;
  price?: number;
  usdcSize?: number;
}

/**
 * Fetch recent trades globally (all markets)
 */
async function fetchRecentTrades(limit = 500): Promise<TradeData[]> {
  try {
    const response = await fetch(
      `${POLYMARKET_API.DATA.BASE}/trades?limit=${limit}`,
      {
        headers: { Accept: "application/json" },
        next: { revalidate: 60 }, // Cache for 1 minute
      }
    );

    if (!response.ok) return [];
    return response.json();
  } catch {
    return [];
  }
}

/**
 * Fetch activity history for a trader to determine account age
 */
async function fetchTraderHistory(
  address: string
): Promise<{ firstTradeDate: string; totalTrades: number }> {
  try {
    // Fetch with high limit to find earliest trade
    const response = await fetch(
      `${POLYMARKET_API.DATA.BASE}/activity?user=${address.toLowerCase()}&limit=100`,
      {
        headers: { Accept: "application/json" },
        next: { revalidate: 300 }, // Cache for 5 minutes
      }
    );

    if (!response.ok) {
      return { firstTradeDate: new Date().toISOString(), totalTrades: 0 };
    }

    const activities: ActivityData[] = await response.json();

    if (!activities || activities.length === 0) {
      return { firstTradeDate: new Date().toISOString(), totalTrades: 0 };
    }

    // Find the earliest trade
    const trades = activities.filter((a) => a.type === "TRADE");
    if (trades.length === 0) {
      return { firstTradeDate: new Date().toISOString(), totalTrades: 0 };
    }

    const earliestTimestamp = Math.min(...trades.map((t) => t.timestamp));
    const firstTradeDate = new Date(earliestTimestamp * 1000).toISOString();

    return { firstTradeDate, totalTrades: trades.length };
  } catch {
    return { firstTradeDate: new Date().toISOString(), totalTrades: 0 };
  }
}

interface PriceResponse {
  price?: number;
}

/**
 * Fetch current market price for an outcome
 */
async function fetchCurrentPrice(tokenId: string): Promise<number | null> {
  try {
    const response = await fetch(
      `${POLYMARKET_API.CLOB.BASE}/price?token_id=${tokenId}`,
      {
        headers: { Accept: "application/json" },
        next: { revalidate: 30 }, // Cache for 30 seconds
      }
    );

    if (!response.ok) return null;
    const data: PriceResponse = await response.json();
    return data?.price ?? null;
  } catch {
    return null;
  }
}

/**
 * Calculate suspicion score based on various factors
 */
function calculateSuspicionScore(
  accountAgeHours: number,
  totalTrades: number,
  _tradePrice: number,
  currentPrice: number,
  tradeSide: "BUY" | "SELL",
  tradeUsdValue: number
): {
  score: number;
  isContrarian: boolean;
  sentiment: "BULLISH" | "BEARISH" | "NEUTRAL";
  reason: string;
} {
  let score = 0;
  const reasons: string[] = [];

  // Factor 1: Account age (newer = more suspicious)
  // Max 40 points for accounts < 24 hours old
  if (accountAgeHours < 6) {
    score += 40;
    reasons.push(`Very new account (${accountAgeHours.toFixed(1)}h old)`);
  } else if (accountAgeHours < 24) {
    score += 30;
    reasons.push(`New account (${accountAgeHours.toFixed(1)}h old)`);
  } else if (accountAgeHours < 48) {
    score += 20;
    reasons.push(`Recent account (${accountAgeHours.toFixed(1)}h old)`);
  } else if (accountAgeHours < 72) {
    score += 10;
    reasons.push(`Fairly new account (${accountAgeHours.toFixed(1)}h old)`);
  }

  // Factor 2: Trade count (fewer trades = more suspicious for new accounts)
  // Max 20 points for accounts with < 5 trades
  if (totalTrades <= 3) {
    score += 20;
    reasons.push(`Only ${totalTrades} total trades`);
  } else if (totalTrades <= 10) {
    score += 10;
    reasons.push(`Low trade count (${totalTrades})`);
  }

  // Factor 3: Contrarian position (buying against market sentiment)
  // Max 30 points for highly contrarian positions
  const isContrarian = checkIfContrarian(tradeSide, currentPrice);
  let sentiment: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";

  if (currentPrice !== null) {
    // Determine market sentiment
    if (currentPrice > 0.65) {
      sentiment = "BULLISH";
    } else if (currentPrice < 0.35) {
      sentiment = "BEARISH";
    }

    if (isContrarian) {
      // Calculate how contrarian the position is
      const contrarianDegree =
        tradeSide === "BUY"
          ? 1 - currentPrice // Buying when price is low (market says NO)
          : currentPrice; // Selling when price is high (market says YES)

      if (contrarianDegree > 0.7) {
        score += 30;
        reasons.push(
          `Highly contrarian (market at ${(currentPrice * 100).toFixed(0)}%)`
        );
      } else if (contrarianDegree > 0.5) {
        score += 20;
        reasons.push(
          `Contrarian position (market at ${(currentPrice * 100).toFixed(0)}%)`
        );
      } else {
        score += 10;
        reasons.push(`Slightly contrarian`);
      }
    }
  }

  // Factor 4: Trade size (larger trades from new accounts = more suspicious)
  // Max 10 points for large trades
  if (tradeUsdValue > 5000) {
    score += 10;
    reasons.push(`Large trade ($${tradeUsdValue.toFixed(0)})`);
  } else if (tradeUsdValue > 1000) {
    score += 5;
    reasons.push(`Significant trade ($${tradeUsdValue.toFixed(0)})`);
  }

  return {
    score: Math.min(score, 100),
    isContrarian,
    sentiment,
    reason: reasons.join("; "),
  };
}

/**
 * Check if a trade is contrarian to market sentiment
 */
function checkIfContrarian(
  side: "BUY" | "SELL",
  currentPrice: number | null
): boolean {
  if (currentPrice === null) return false;

  // Buying YES when market strongly favors NO (price < 30%)
  if (side === "BUY" && currentPrice < 0.3) return true;

  // Selling YES when market strongly favors YES (price > 70%)
  // This is equivalent to buying NO
  if (side === "SELL" && currentPrice > 0.7) return true;

  return false;
}

export async function GET(request: NextRequest) {
  // Rate limit: 10 requests per minute (very expensive endpoint — many upstream API calls)
  const rateLimitResponse = checkRateLimit(request, {
    uniqueTokenPerInterval: 10,
  });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const maxAccountAgeHours = Math.min(
      Math.max(
        Number.parseInt(searchParams.get("maxAccountAge") || "168", 10),
        1
      ),
      336 // Max 14 days
    );

    // USD-based filter (default: $5000)
    const minUsdValue = Math.max(
      Number.parseFloat(searchParams.get("minUsdValue") || "5000"),
      0
    );

    // Share-based filter (default: 0 = no minimum)
    const minShares = Math.max(
      Number.parseFloat(searchParams.get("minShares") || "0"),
      0
    );

    const minSuspicionScore = Math.max(
      Number.parseInt(searchParams.get("minScore") || "30", 10),
      0
    );
    const limit = Math.min(
      Math.max(Number.parseInt(searchParams.get("limit") || "50", 10), 1),
      100
    );

    // Step 1: Fetch recent trades globally
    const recentTrades = await fetchRecentTrades(500);

    if (recentTrades.length === 0) {
      return NextResponse.json({
        success: true,
        activities: [],
        stats: {
          totalTradesScanned: 0,
          uniqueTradersFound: 0,
          newAccountsFound: 0,
          suspiciousActivities: 0,
        },
        lastUpdated: new Date().toISOString(),
      } satisfies SuspiciousActivityResponse);
    }

    // Step 2: Filter trades by minimum USD value and/or minimum shares
    const largeTrades = recentTrades.filter((trade) => {
      const usdValue = trade.size * trade.price;
      const shares = trade.size;

      // Must meet USD threshold
      if (usdValue < minUsdValue) return false;

      // Must meet shares threshold (if specified)
      if (minShares > 0 && shares < minShares) return false;

      return true;
    });

    // Step 3: Get unique traders from large trades
    const uniqueTraders = [...new Set(largeTrades.map((t) => t.proxyWallet))];

    // Step 4: Fetch account history for each unique trader (in parallel, batched)
    const now = Date.now();
    const traderHistories = new Map<
      string,
      { firstTradeDate: string; totalTrades: number; accountAgeHours: number }
    >();

    // Batch requests to avoid rate limiting
    const batchSize = 10;
    for (let i = 0; i < uniqueTraders.length; i += batchSize) {
      const batch = uniqueTraders.slice(i, i + batchSize);
      const historyPromises = batch.map(async (address) => {
        const history = await fetchTraderHistory(address);
        const accountAgeMs = now - new Date(history.firstTradeDate).getTime();
        const accountAgeHours = accountAgeMs / (1000 * 60 * 60);
        return { address, ...history, accountAgeHours };
      });

      const results = await Promise.all(historyPromises);
      for (const result of results) {
        traderHistories.set(result.address, result);
      }
    }

    // Step 5: Filter for new accounts only
    const newAccountTrades = largeTrades.filter((trade) => {
      const history = traderHistories.get(trade.proxyWallet);
      return history && history.accountAgeHours <= maxAccountAgeHours;
    });

    // Step 6: Analyze each trade for suspicious activity
    const suspiciousActivities: SuspiciousActivity[] = [];

    // Get unique token IDs for price fetching
    const tokenIds = [...new Set(newAccountTrades.map((t) => t.asset))];
    const priceCache = new Map<string, number | null>();

    // Fetch prices in batches
    for (let i = 0; i < tokenIds.length; i += batchSize) {
      const batch = tokenIds.slice(i, i + batchSize);
      const pricePromises = batch.map(async (tokenId) => {
        const price = await fetchCurrentPrice(tokenId);
        return { tokenId, price };
      });

      const results = await Promise.all(pricePromises);
      for (const result of results) {
        priceCache.set(result.tokenId, result.price);
      }
    }

    // Analyze trades
    for (const trade of newAccountTrades) {
      const history = traderHistories.get(trade.proxyWallet);
      if (!history) continue;

      const currentPrice = priceCache.get(trade.asset);
      const usdValue = trade.size * trade.price;

      const analysis = calculateSuspicionScore(
        history.accountAgeHours,
        history.totalTrades,
        trade.price,
        currentPrice ?? trade.price, // Fallback to trade price if current unavailable
        trade.side,
        usdValue
      );

      // Only include if meets minimum suspicion score AND is contrarian
      // Non-contrarian trades (following market sentiment) are not suspicious
      if (analysis.score >= minSuspicionScore && analysis.isContrarian) {
        suspiciousActivities.push({
          id:
            trade.transactionHash || `${trade.proxyWallet}-${trade.timestamp}`,
          timestamp: new Date(trade.timestamp * 1000).toISOString(),
          account: {
            address: trade.proxyWallet,
            name: trade.name || trade.pseudonym || null,
            profileImage: trade.profileImage || null,
            firstTradeDate: history.firstTradeDate,
            accountAgeHours: history.accountAgeHours,
            totalTrades: history.totalTrades,
          },
          trade: {
            side: trade.side,
            outcome: trade.outcome,
            outcomeIndex: trade.outcomeIndex,
            size: trade.size,
            price: trade.price,
            usdcAmount: usdValue,
          },
          market: {
            conditionId: trade.conditionId,
            title: trade.title,
            slug: trade.slug,
            eventSlug: trade.eventSlug,
            image: trade.icon,
            currentPrice: currentPrice ?? trade.price,
          },
          analysis: {
            suspicionScore: analysis.score,
            isContrarian: analysis.isContrarian,
            marketSentiment: analysis.sentiment,
            reason: analysis.reason,
          },
        });
      }
    }

    // Sort by suspicion score (highest first)
    suspiciousActivities.sort(
      (a, b) => b.analysis.suspicionScore - a.analysis.suspicionScore
    );

    // Limit results
    const limitedActivities = suspiciousActivities.slice(0, limit);

    return NextResponse.json({
      success: true,
      activities: limitedActivities,
      stats: {
        totalTradesScanned: recentTrades.length,
        uniqueTradersFound: uniqueTraders.length,
        newAccountsFound: [...traderHistories.values()].filter(
          (h) => h.accountAgeHours <= maxAccountAgeHours
        ).length,
        suspiciousActivities: suspiciousActivities.length,
      },
      lastUpdated: new Date().toISOString(),
    } satisfies SuspiciousActivityResponse);
  } catch (error) {
    console.error("Suspicious activity API error:", error);
    return NextResponse.json(
      {
        success: false,
        activities: [],
        stats: {
          totalTradesScanned: 0,
          uniqueTradersFound: 0,
          newAccountsFound: 0,
          suspiciousActivities: 0,
        },
        lastUpdated: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error",
      } satisfies SuspiciousActivityResponse,
      { status: 500 }
    );
  }
}
