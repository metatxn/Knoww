"use client";

import { motion } from "framer-motion";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Clock,
  Crown,
  Fish,
  Flame,
  RefreshCw,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { Navbar } from "@/components/navbar";
import { PageBackground } from "@/components/page-background";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// Select imports removed - using pill buttons instead
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  getWhaleActivityStats,
  useWhaleActivity,
  type WhaleActivity,
} from "@/hooks/use-whale-activity";
import { formatCurrencyCompact } from "@/lib/formatters";
import { cn } from "@/lib/utils";

// Time period options - maps UI values to API timePeriod values
const TIME_PERIODS = [
  {
    value: "24h",
    label: "Last 24 Hours",
    hours: 24,
    apiPeriod: "DAY" as const,
  },
  { value: "7d", label: "Last 7 Days", hours: 168, apiPeriod: "WEEK" as const },
  {
    value: "30d",
    label: "Last 30 Days",
    hours: 720,
    apiPeriod: "MONTH" as const,
  },
  {
    value: "all",
    label: "All Time",
    hours: Infinity,
    apiPeriod: "ALL" as const,
  },
];

// Trade size filter options
const TRADE_SIZE_OPTIONS = [
  { value: "100", label: "$100+" },
  { value: "500", label: "$500+" },
  { value: "1000", label: "$1K+" },
  { value: "5000", label: "$5K+" },
];

function formatAddress(address: string | null | undefined) {
  if (!address) return "";
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatTimeAgo(timestamp: string) {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return then.toLocaleDateString();
}

function getInitials(name: string | null, address: string) {
  if (name && name.length > 0) {
    const parts = name.split(/[\s-]+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  return address.slice(2, 4).toUpperCase();
}

// Aggregate activities by market to find "hot markets"
function getHotMarkets(activities: WhaleActivity[]) {
  const marketMap = new Map<
    string,
    {
      title: string;
      slug: string;
      eventSlug: string;
      image?: string;
      buyVolume: number;
      sellVolume: number;
      tradeCount: number;
      whaleCount: number;
      whales: Set<string>;
      latestPrice: number;
      sentiment: "bullish" | "bearish" | "neutral";
    }
  >();

  for (const activity of activities) {
    const key = activity.market.conditionId || activity.market.slug;
    if (!key) continue;

    const existing = marketMap.get(key);
    if (existing) {
      if (activity.trade.side === "BUY") {
        existing.buyVolume += activity.trade.usdcAmount;
      } else {
        existing.sellVolume += activity.trade.usdcAmount;
      }
      existing.tradeCount++;
      existing.whales.add(activity.trader.address);
      existing.whaleCount = existing.whales.size;
      existing.latestPrice = activity.trade.price;
    } else {
      const whales = new Set<string>();
      whales.add(activity.trader.address);
      marketMap.set(key, {
        title: activity.market.title,
        slug: activity.market.slug,
        eventSlug: activity.market.eventSlug,
        image: activity.market.image,
        buyVolume:
          activity.trade.side === "BUY" ? activity.trade.usdcAmount : 0,
        sellVolume:
          activity.trade.side === "SELL" ? activity.trade.usdcAmount : 0,
        tradeCount: 1,
        whaleCount: 1,
        whales,
        latestPrice: activity.trade.price,
        sentiment: "neutral",
      });
    }
  }

  // Calculate sentiment for each market
  const markets = Array.from(marketMap.entries()).map(([id, data]) => {
    const totalVolume = data.buyVolume + data.sellVolume;
    const buyRatio = totalVolume > 0 ? data.buyVolume / totalVolume : 0.5;
    return {
      id,
      ...data,
      totalVolume,
      buyRatio,
      sentiment:
        buyRatio > 0.65
          ? ("bullish" as const)
          : buyRatio < 0.35
          ? ("bearish" as const)
          : ("neutral" as const),
    };
  });

  // Sort by total volume
  return markets.sort((a, b) => b.totalVolume - a.totalVolume).slice(0, 8);
}

// Get top whales by activity
function getTopWhales(activities: WhaleActivity[]) {
  const whaleMap = new Map<
    string,
    {
      address: string;
      name: string | null;
      profileImage: string | null;
      rank: number;
      buyVolume: number;
      sellVolume: number;
      tradeCount: number;
      markets: Set<string>;
    }
  >();

  for (const activity of activities) {
    const existing = whaleMap.get(activity.trader.address);
    if (existing) {
      if (activity.trade.side === "BUY") {
        existing.buyVolume += activity.trade.usdcAmount;
      } else {
        existing.sellVolume += activity.trade.usdcAmount;
      }
      existing.tradeCount++;
      existing.markets.add(activity.market.conditionId);
    } else {
      const markets = new Set<string>();
      markets.add(activity.market.conditionId);
      whaleMap.set(activity.trader.address, {
        address: activity.trader.address,
        name: activity.trader.name,
        profileImage: activity.trader.profileImage,
        rank: activity.trader.rank,
        buyVolume:
          activity.trade.side === "BUY" ? activity.trade.usdcAmount : 0,
        sellVolume:
          activity.trade.side === "SELL" ? activity.trade.usdcAmount : 0,
        tradeCount: 1,
        markets,
      });
    }
  }

  return Array.from(whaleMap.values())
    .map((w) => ({
      ...w,
      totalVolume: w.buyVolume + w.sellVolume,
      marketCount: w.markets.size,
    }))
    .sort((a, b) => b.totalVolume - a.totalVolume)
    .slice(0, 10);
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  className,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: "up" | "down" | "neutral";
  className?: string;
}) {
  return (
    <Card
      className={cn("bg-card/80 backdrop-blur-sm border-border", className)}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-foreground/70 font-semibold uppercase tracking-wide">
            {title}
          </span>
          <Icon className="h-4 w-4 text-foreground/60" />
        </div>
        <div className="flex items-center gap-2">
          {trend === "up" && (
            <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          )}
          {trend === "down" && (
            <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />
          )}
          <span
            className={cn(
              "text-2xl font-bold",
              trend === "up" && "text-emerald-600 dark:text-emerald-400",
              trend === "down" && "text-red-600 dark:text-red-400",
              !trend && "text-foreground"
            )}
          >
            {value}
          </span>
        </div>
        {subtitle && (
          <p className="text-sm text-foreground/60 mt-1.5">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}

// Generate time-series data from activities for the area chart
function generateTimeSeriesData(activities: WhaleActivity[]) {
  if (activities.length === 0)
    return { buyData: [], sellData: [], maxVolume: 0 };

  // Sort activities by timestamp
  const sorted = [...activities].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // Group by hour buckets and accumulate volume
  const bucketMap = new Map<string, { buy: number; sell: number }>();

  for (const activity of sorted) {
    const date = new Date(activity.timestamp);
    // Round to hour
    date.setMinutes(0, 0, 0);
    const key = date.toISOString();

    const existing = bucketMap.get(key) || { buy: 0, sell: 0 };
    if (activity.trade.side === "BUY") {
      existing.buy += activity.trade.usdcAmount;
    } else {
      existing.sell += activity.trade.usdcAmount;
    }
    bucketMap.set(key, existing);
  }

  // Convert to arrays and calculate cumulative values
  const entries = Array.from(bucketMap.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  );

  let cumulativeBuy = 0;
  let cumulativeSell = 0;
  const buyData: { time: string; value: number }[] = [];
  const sellData: { time: string; value: number }[] = [];

  for (const [time, { buy, sell }] of entries) {
    cumulativeBuy += buy;
    cumulativeSell += sell;
    buyData.push({ time, value: cumulativeBuy });
    sellData.push({ time, value: cumulativeSell });
  }

  const maxVolume = Math.max(cumulativeBuy, cumulativeSell);

  return { buyData, sellData, maxVolume };
}

// Buy vs Sell Area Chart Component (Depth Chart Style)
function BuySellAreaChart({
  activities,
  buyVolume,
  sellVolume,
  buyCount,
  sellCount,
  className,
}: {
  activities: WhaleActivity[];
  buyVolume: number;
  sellVolume: number;
  buyCount: number;
  sellCount: number;
  className?: string;
}) {
  const instanceId = useId();
  const buyGradientId = `buyGradient-${instanceId}`;
  const sellGradientId = `sellGradient-${instanceId}`;

  const { buyData, sellData, maxVolume } = useMemo(
    () => generateTimeSeriesData(activities),
    [activities]
  );

  // Calculate percentages for the top bar
  const totalCount = buyCount + sellCount;
  const buyPercent = totalCount > 0 ? (buyCount / totalCount) * 100 : 50;
  const sellPercent = totalCount > 0 ? (sellCount / totalCount) * 100 : 50;

  // Generate SVG path for area chart
  const generatePath = (
    data: { time: string; value: number }[],
    isReversed: boolean
  ) => {
    if (data.length === 0) return "";

    const width = 100;
    const height = 100;
    const points = data.map((d, i) => {
      const x = isReversed
        ? width - (i / Math.max(data.length - 1, 1)) * width
        : (i / Math.max(data.length - 1, 1)) * width;
      const y =
        height - (maxVolume > 0 ? (d.value / maxVolume) * height * 0.9 : 0);
      return `${x},${y}`;
    });

    if (isReversed) {
      return `M${width},${height} L${points.join(" L")} L0,${height} Z`;
    }
    return `M0,${height} L${points.join(" L")} L${width},${height} Z`;
  };

  return (
    <div className={cn("w-full", className)}>
      {/* Top Summary Bar */}
      <div className="flex items-center mb-3">
        {/* Buy side */}
        <div
          className="h-2 bg-emerald-500 rounded-l-full transition-all duration-500"
          style={{ width: `${buyPercent}%` }}
        />
        {/* Center marker */}
        <div className="relative flex items-center justify-center px-2">
          <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-foreground/60" />
        </div>
        {/* Sell side */}
        <div
          className="h-2 bg-red-500 rounded-r-full transition-all duration-500"
          style={{ width: `${sellPercent}%` }}
        />
      </div>

      {/* Stats Row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-foreground">
            {buyCount.toLocaleString()}
          </span>
          <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
            {formatCurrencyCompact(buyVolume)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-red-600 dark:text-red-400">
            {formatCurrencyCompact(sellVolume)}
          </span>
          <span className="text-lg font-bold text-foreground">
            {sellCount.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Area Chart */}
      <div className="relative h-40 flex">
        {/* Buy Area (Left side - green) */}
        <div className="flex-1 relative overflow-hidden bg-emerald-50 dark:bg-emerald-950/30 rounded-l-lg border-r border-dashed border-foreground/20">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full"
            aria-label="Buy volume chart"
            role="img"
          >
            <defs>
              <linearGradient
                id={buyGradientId}
                x1="0%"
                y1="0%"
                x2="0%"
                y2="100%"
              >
                <stop
                  offset="0%"
                  stopColor="rgb(16, 185, 129)"
                  stopOpacity="0.8"
                />
                <stop
                  offset="100%"
                  stopColor="rgb(16, 185, 129)"
                  stopOpacity="0.2"
                />
              </linearGradient>
            </defs>
            <motion.path
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8 }}
              d={generatePath(buyData, true)}
              fill={`url(#${buyGradientId})`}
              stroke="rgb(16, 185, 129)"
              strokeWidth="1"
            />
          </svg>
          {/* Y-axis labels */}
          <div className="absolute left-2 top-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            {formatCurrencyCompact(maxVolume)}
          </div>
          <div className="absolute left-2 bottom-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            0
          </div>
        </div>

        {/* Sell Area (Right side - red) */}
        <div className="flex-1 relative overflow-hidden bg-red-50 dark:bg-red-950/30 rounded-r-lg">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full"
            aria-label="Sell volume chart"
            role="img"
          >
            <defs>
              <linearGradient
                id={sellGradientId}
                x1="0%"
                y1="0%"
                x2="0%"
                y2="100%"
              >
                <stop
                  offset="0%"
                  stopColor="rgb(239, 68, 68)"
                  stopOpacity="0.8"
                />
                <stop
                  offset="100%"
                  stopColor="rgb(239, 68, 68)"
                  stopOpacity="0.2"
                />
              </linearGradient>
            </defs>
            <motion.path
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8 }}
              d={generatePath(sellData, false)}
              fill={`url(#${sellGradientId})`}
              stroke="rgb(239, 68, 68)"
              strokeWidth="1"
            />
          </svg>
          {/* Y-axis labels */}
          <div className="absolute right-2 top-2 text-xs font-medium text-red-700 dark:text-red-400">
            {formatCurrencyCompact(maxVolume)}
          </div>
          <div className="absolute right-2 bottom-2 text-xs font-medium text-red-700 dark:text-red-400">
            0
          </div>
        </div>
      </div>

      {/* Labels */}
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-1.5">
          <TrendingUp className="h-4 w-4 text-emerald-500" />
          <span className="text-sm font-bold text-foreground">BUY</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold text-foreground">SELL</span>
          <TrendingDown className="h-4 w-4 text-red-500" />
        </div>
      </div>
    </div>
  );
}

function HotMarketCard({
  market,
  index,
}: {
  market: ReturnType<typeof getHotMarkets>[0];
  index: number;
}) {
  const isBullish = market.sentiment === "bullish";
  const isBearish = market.sentiment === "bearish";
  const sellRatio = 1 - market.buyRatio;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      <Link href={`/events/detail/${market.eventSlug || market.slug}`}>
        <Card className="bg-card/90 hover:bg-card border-border hover:border-primary/50 transition-all cursor-pointer group shadow-sm">
          <CardContent className="p-3">
            {/* Market Title */}
            <h4 className="font-bold text-base text-foreground line-clamp-2 mb-2 group-hover:text-primary transition-colors">
              {market.title}
            </h4>

            {/* Stats Row */}
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-foreground/70 font-medium">
                <Users className="h-3.5 w-3.5 inline mr-1.5 text-foreground/60" />
                {market.whaleCount} whales
              </span>
              <span className="text-foreground/70 font-medium">
                {market.tradeCount} trades
              </span>
            </div>

            {/* Volume Bar - Buy (green) from left, Sell (red) from right */}
            <div className="h-3 rounded-full overflow-hidden flex mb-2">
              {/* Buy bar - green from left */}
              <div
                className="h-full bg-gradient-to-r from-emerald-600 to-emerald-500 dark:from-emerald-500 dark:to-emerald-400"
                style={{ width: `${market.buyRatio * 100}%` }}
              />
              {/* Sell bar - red from right */}
              <div
                className="h-full bg-gradient-to-l from-red-600 to-red-500 dark:from-red-500 dark:to-red-400"
                style={{ width: `${sellRatio * 100}%` }}
              />
            </div>

            {/* Buy/Sell Split */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                Buy {formatCurrencyCompact(market.buyVolume)}
              </span>
              <Badge
                variant="outline"
                className={cn(
                  "text-xs px-2 py-0.5 font-semibold",
                  isBullish &&
                    "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border-emerald-400",
                  isBearish &&
                    "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 border-red-400",
                  !isBullish &&
                    !isBearish &&
                    "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-400"
                )}
              >
                {isBullish
                  ? "🐂 Bullish"
                  : isBearish
                  ? "🐻 Bearish"
                  : "⚖️ Neutral"}
              </Badge>
              <span className="text-red-600 dark:text-red-400 font-bold">
                Sell {formatCurrencyCompact(market.sellVolume)}
              </span>
            </div>
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  );
}

function TopWhaleCard({
  whale,
  index,
}: {
  whale: ReturnType<typeof getTopWhales>[0];
  index: number;
}) {
  const isBuying = whale.buyVolume > whale.sellVolume;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      <Link href={`/profile/${whale.address}`}>
        <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-card/80 hover:bg-card border border-border hover:border-primary/50 transition-all group shadow-sm">
          <div className="relative">
            <Avatar className="h-10 w-10 border-2 border-amber-400">
              {whale.profileImage && (
                <AvatarImage
                  src={whale.profileImage}
                  alt={whale.name || "Whale"}
                />
              )}
              <AvatarFallback className="bg-gradient-to-br from-amber-500 to-orange-500 text-white text-xs font-bold">
                {getInitials(whale.name, whale.address)}
              </AvatarFallback>
            </Avatar>
            <span className="absolute -bottom-1 -right-1 flex items-center justify-center w-4 h-4 rounded-full bg-amber-500 text-white text-[10px] font-bold border-2 border-background">
              {whale.rank}
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm text-foreground truncate group-hover:text-primary transition-colors">
              {whale.name || formatAddress(whale.address)}
            </div>
            <div className="text-xs text-foreground/70 font-medium">
              {whale.tradeCount} trades • {whale.marketCount} markets
            </div>
          </div>

          <div className="text-right">
            <div
              className={cn(
                "text-sm font-bold",
                isBuying
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400"
              )}
            >
              {formatCurrencyCompact(whale.totalVolume)}
            </div>
            <div className="text-[10px] text-foreground/60 font-medium">
              {isBuying ? "Net Buyer" : "Net Seller"}
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function RecentActivityRow({
  activity,
  index,
}: {
  activity: WhaleActivity;
  index: number;
}) {
  const isBuy = activity.trade.side === "BUY";

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.02 }}
      className="flex items-center gap-3 py-3.5 border-b border-border last:border-0"
    >
      {/* Trade Direction Icon */}
      <div
        className={cn(
          "flex items-center justify-center w-9 h-9 rounded-full shrink-0",
          isBuy
            ? "bg-emerald-100 dark:bg-emerald-900/40"
            : "bg-red-100 dark:bg-red-900/40"
        )}
      >
        {isBuy ? (
          <ArrowUpRight className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <ArrowDownRight className="h-5 w-5 text-red-600 dark:text-red-400" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/profile/${activity.trader.address}`}
            className="font-bold text-sm text-foreground hover:text-primary transition-colors"
          >
            {activity.trader.name || formatAddress(activity.trader.address)}
          </Link>
          <Badge
            variant="outline"
            className="text-xs px-2 py-0.5 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 border-amber-400 font-semibold"
          >
            #{activity.trader.rank}
          </Badge>
          <span
            className={cn(
              "text-sm font-semibold",
              isBuy
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400"
            )}
          >
            {isBuy ? "bought" : "sold"}
          </span>
          <span className="text-sm text-foreground/70 font-medium">
            {activity.trade.outcome} @ {(activity.trade.price * 100).toFixed(0)}
            ¢
          </span>
        </div>
        <Link
          href={`/events/detail/${
            activity.market.eventSlug || activity.market.slug
          }`}
          className="text-sm text-foreground/60 hover:text-foreground transition-colors line-clamp-1 mt-0.5"
        >
          {activity.market.title}
        </Link>
      </div>

      {/* Amount & Time */}
      <div className="text-right shrink-0">
        <div
          className={cn(
            "text-base font-bold",
            isBuy
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          )}
        >
          {formatCurrencyCompact(activity.trade.usdcAmount)}
        </div>
        <div className="text-xs text-foreground/60 font-medium">
          {formatTimeAgo(activity.timestamp)}
        </div>
      </div>
    </motion.div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      {/* Stats Skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={`stat-${i}`} className="h-24 rounded-xl" />
        ))}
      </div>

      {/* Content Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={`market-${i}`} className="h-36 rounded-xl" />
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-8 w-32" />
          {[...Array(5)].map((_, i) => (
            <Skeleton key={`whale-${i}`} className="h-16 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function WhalesPage() {
  const [timePeriod, setTimePeriod] = useState("24h");
  const [minTradeSize, setMinTradeSize] = useState("100");

  // Get the API time period based on selected filter
  const selectedPeriod = TIME_PERIODS.find((p) => p.value === timePeriod);
  const apiTimePeriod = selectedPeriod?.apiPeriod || "DAY";

  const { data, isLoading, error, refetch, isFetching } = useWhaleActivity({
    whaleCount: 50,
    minTradeSize: Number.parseFloat(minTradeSize),
    tradesPerWhale: 50,
    timePeriod: apiTimePeriod, // Use dynamic time period for API
  });

  // For the selected time period, we use all activities from the API
  // since the API already filters by the correct time period
  const filteredActivities = data?.activities ?? [];

  // Compute derived data
  const stats = useMemo(
    () => getWhaleActivityStats(filteredActivities),
    [filteredActivities]
  );
  const hotMarkets = useMemo(
    () => getHotMarkets(filteredActivities),
    [filteredActivities]
  );
  const topWhales = useMemo(
    () => getTopWhales(filteredActivities),
    [filteredActivities]
  );

  return (
    <div className="min-h-screen flex flex-col bg-linear-to-b from-slate-50 via-white to-slate-50 dark:from-background dark:via-background dark:to-background relative overflow-x-hidden selection:bg-purple-500/30">
      <PageBackground />
      <Navbar />

      <main className="relative z-10 flex-1 px-3 sm:px-4 md:px-6 lg:px-8 pt-6 pb-24 xl:pb-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-6"
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-500 shadow-lg shadow-cyan-500/25">
              <Fish className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                Whale Tracker
              </h1>
              <p className="text-foreground/70 text-base font-medium">
                See what the top traders are buying and selling
              </p>
            </div>
          </div>

          {/* Filters Bar - More Prominent */}
          <div className="flex flex-wrap items-center gap-4 p-4 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 shadow-sm">
            {/* Time Period Pills */}
            <div className="flex items-center gap-1.5 p-1.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
              {TIME_PERIODS.map((period) => (
                <button
                  key={period.value}
                  type="button"
                  onClick={() => setTimePeriod(period.value)}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-semibold transition-all",
                    timePeriod === period.value
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "text-foreground/70 hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800"
                  )}
                >
                  {period.value === "24h"
                    ? "24H"
                    : period.value === "7d"
                    ? "7D"
                    : period.value === "30d"
                    ? "30D"
                    : "All"}
                </button>
              ))}
            </div>

            {/* Divider */}
            <div className="h-10 w-px bg-slate-300 dark:bg-slate-600 hidden sm:block" />

            {/* Min Trade Size */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-foreground/80 font-semibold">
                Min Trade:
              </span>
              <div className="flex items-center gap-1.5 p-1.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                {TRADE_SIZE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setMinTradeSize(option.value)}
                    className={cn(
                      "px-3 py-2 rounded-lg text-sm font-semibold transition-all",
                      minTradeSize === option.value
                        ? "bg-cyan-500 text-white shadow-md"
                        : "text-foreground/70 hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Refresh Button */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetch()}
                    disabled={isFetching}
                    className="rounded-xl gap-2 font-semibold h-10 px-4 border-slate-300 dark:border-slate-600"
                  >
                    <RefreshCw
                      className={cn("h-4 w-4", isFetching && "animate-spin")}
                    />
                    <span className="hidden sm:inline">Refresh</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Refresh data</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Stats Badge */}
            {data && (
              <div className="hidden md:flex items-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm">
                <span className="text-sm text-foreground/80 font-medium">
                  Tracking{" "}
                  <span className="font-bold text-foreground">
                    {data.whaleCount}
                  </span>{" "}
                  whales
                </span>
                <span className="text-slate-400 dark:text-slate-500">•</span>
                <span className="text-sm text-foreground/80 font-medium">
                  <span className="font-bold text-foreground">
                    {filteredActivities.length}
                  </span>{" "}
                  trades
                </span>
              </div>
            )}
          </div>
        </motion.div>

        {/* Loading State */}
        {isLoading && <LoadingSkeleton />}

        {/* Error State */}
        {error && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-12 px-4 rounded-2xl bg-destructive/5 border border-destructive/20"
          >
            <Fish className="h-10 w-10 text-destructive mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-destructive mb-2">
              Failed to load whale data
            </h3>
            <p className="text-muted-foreground mb-4">{error.message}</p>
            <Button
              variant="outline"
              onClick={() => refetch()}
              className="rounded-xl"
            >
              Try Again
            </Button>
          </motion.div>
        )}

        {/* Main Content */}
        {!isLoading && !error && data && (
          <>
            {/* Stats Row */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6"
            >
              <StatCard
                title="Total Volume"
                value={formatCurrencyCompact(stats.totalVolume)}
                subtitle={`${stats.totalTrades} trades from ${stats.uniqueTraders} whales`}
                icon={BarChart3}
              />
              <StatCard
                title="Buy Pressure"
                value={formatCurrencyCompact(stats.totalBuyVolume)}
                subtitle={`${stats.buyCount} buy orders`}
                icon={TrendingUp}
                trend="up"
              />
              <StatCard
                title="Sell Pressure"
                value={formatCurrencyCompact(stats.totalSellVolume)}
                subtitle={`${stats.sellCount} sell orders`}
                icon={TrendingDown}
                trend="down"
              />
              <StatCard
                title="Market Sentiment"
                value={
                  stats.sentiment === "bullish"
                    ? "🐂 Bullish"
                    : stats.sentiment === "bearish"
                    ? "🐻 Bearish"
                    : "⚖️ Neutral"
                }
                subtitle={`${(stats.buyRatio * 100).toFixed(
                  0
                )}% of volume is buying`}
                icon={Activity}
                trend={
                  stats.sentiment === "bullish"
                    ? "up"
                    : stats.sentiment === "bearish"
                    ? "down"
                    : "neutral"
                }
              />
            </motion.div>

            {/* Buy vs Sell Area Chart */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="mb-6 p-4 rounded-2xl bg-card/80 backdrop-blur-sm border border-border shadow-sm"
            >
              <div className="flex items-center justify-center gap-2 mb-3">
                <BarChart3 className="h-5 w-5 text-foreground/70" />
                <span className="text-base font-bold text-foreground">
                  Buy vs Sell Pressure
                </span>
              </div>
              <BuySellAreaChart
                activities={filteredActivities}
                buyVolume={stats.totalBuyVolume}
                sellVolume={stats.totalSellVolume}
                buyCount={stats.buyCount}
                sellCount={stats.sellCount}
              />
            </motion.div>

            {/* Two Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column - Hot Markets */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="lg:col-span-2"
              >
                <Card className="bg-card/80 backdrop-blur-sm border-border shadow-sm">
                  <CardHeader className="px-4 py-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Flame className="h-5 w-5 text-orange-500" />
                      <span className="text-foreground font-bold">
                        Hot Markets
                      </span>
                      <span className="text-sm font-medium text-foreground/60 ml-1">
                        Where whales are most active
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 pt-0">
                    {hotMarkets.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {hotMarkets.map((market, index) => (
                          <HotMarketCard
                            key={market.id}
                            market={market}
                            index={index}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-foreground/60">
                        <Target className="h-10 w-10 mx-auto mb-3 opacity-60" />
                        <p className="text-base font-medium">
                          No market activity in this time period
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>

              {/* Right Column - Top Whales */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
              >
                <Card className="bg-card/80 backdrop-blur-sm border-border shadow-sm">
                  <CardHeader className="px-4 py-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Crown className="h-5 w-5 text-amber-500" />
                      <span className="text-foreground font-bold">
                        Most Active Whales
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 px-4 pb-4 pt-0">
                    {topWhales.length > 0 ? (
                      topWhales.map((whale, index) => (
                        <TopWhaleCard
                          key={whale.address}
                          whale={whale}
                          index={index}
                        />
                      ))
                    ) : (
                      <div className="text-center py-8 text-foreground/60">
                        <Users className="h-10 w-10 mx-auto mb-3 opacity-60" />
                        <p className="text-base font-medium">
                          No whale activity
                        </p>
                      </div>
                    )}

                    <Link href="/leaderboard">
                      <Button
                        variant="outline"
                        className="w-full mt-3 text-sm font-semibold text-foreground/80 hover:text-foreground border-border"
                      >
                        View Full Leaderboard
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            {/* Recent Activity Feed */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="mt-6"
            >
              <Card className="bg-card/80 backdrop-blur-sm border-border shadow-sm">
                <CardHeader className="px-4 py-3">
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-lg">
                      <Clock className="h-5 w-5 text-blue-500" />
                      <span className="text-foreground font-bold">
                        Recent Activity
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-foreground/70 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-lg">
                      {filteredActivities.length} trades
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-0">
                  {filteredActivities.length > 0 ? (
                    <div className="max-h-[500px] overflow-y-auto pr-2">
                      {filteredActivities
                        .slice(0, 25)
                        .map((activity, index) => (
                          <RecentActivityRow
                            key={`${activity.id}-${index}`}
                            activity={activity}
                            index={index}
                          />
                        ))}
                    </div>
                  ) : (
                    <div className="text-center py-10 text-foreground/60">
                      <Activity className="h-10 w-10 mx-auto mb-3 opacity-60" />
                      <p className="text-base font-medium">
                        No activity in this time period
                      </p>
                      <p className="text-sm mt-2 text-foreground/50">
                        Try selecting a longer time range
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* Info Section */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="mt-8 p-6 rounded-2xl bg-gradient-to-br from-cyan-100/80 to-blue-100/80 dark:from-cyan-900/30 dark:to-blue-900/30 border border-cyan-300 dark:border-cyan-700 shadow-sm"
            >
              <h3 className="text-base font-bold mb-3 flex items-center gap-2 text-foreground">
                <Fish className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
                How to use Whale Tracker
              </h3>
              <ul className="text-sm text-foreground/80 space-y-2.5">
                <li className="flex items-start gap-3">
                  <span className="text-cyan-600 dark:text-cyan-400 font-bold text-lg leading-none">
                    •
                  </span>
                  <span>
                    <strong className="text-foreground">Hot Markets</strong>{" "}
                    shows where top traders are placing the most money
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-cyan-600 dark:text-cyan-400 font-bold text-lg leading-none">
                    •
                  </span>
                  <span>
                    <strong className="text-foreground">Buy/Sell ratio</strong>{" "}
                    indicates market sentiment - green bars mean more buying
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-cyan-600 dark:text-cyan-400 font-bold text-lg leading-none">
                    •
                  </span>
                  <span>
                    <strong className="text-foreground">
                      Most Active Whales
                    </strong>{" "}
                    are the top traders by volume in your selected period
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-cyan-600 dark:text-cyan-400 font-bold text-lg leading-none">
                    •
                  </span>
                  <span>Click any market or trader to see more details</span>
                </li>
              </ul>
            </motion.div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border py-6 bg-background/80 backdrop-blur-xl hidden xl:block">
        <div className="px-3 sm:px-4 md:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-foreground/70">
          <div className="flex items-center gap-2 font-medium">
            <Image
              src="/logo-256x256.png"
              alt="Knoww Logo"
              width={24}
              height={24}
              className="rounded-md"
            />
            <span className="font-bold text-foreground">Knoww</span>
            <span>•</span>
            <span>Powered by Polymarket</span>
          </div>
          <span className="font-medium">© {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  );
}
