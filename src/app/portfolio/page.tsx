"use client";

import { useAppKit } from "@reown/appkit/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  History,
  LayoutGrid,
  ListOrdered,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useAccount } from "wagmi";
import { Navbar } from "@/components/navbar";
import { PnLChart } from "@/components/pnl-chart";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCancelOrder, useOpenOrders } from "@/hooks/use-open-orders";
import { useProxyWallet } from "@/hooks/use-proxy-wallet";
import { useUserDetails } from "@/hooks/use-user-details";
import { type PnLPeriod, useUserPnL } from "@/hooks/use-user-pnl";
import { useUserPositions } from "@/hooks/use-user-positions";
import { useUserTrades } from "@/hooks/use-user-trades";

// ============================================================================
// Utility Functions
// ============================================================================

function formatCurrency(value: number, compact = false): string {
  const absValue = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (compact) {
    if (absValue >= 1_000_000)
      return `${sign}$${(absValue / 1_000_000).toFixed(1)}M`;
    if (absValue >= 1000) return `${sign}$${(absValue / 1000).toFixed(1)}K`;
  }

  return `${sign}$${absValue.toFixed(2)}`;
}

function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function timeAgo(timestamp: string): string {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return then.toLocaleDateString();
}

// ============================================================================
// Components
// ============================================================================

function WalletCard({
  label,
  address,
  balance,
  isPrimary,
  onCopy,
  copied,
}: {
  label: string;
  address: string;
  balance?: number;
  isPrimary?: boolean;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl p-4 ${
        isPrimary
          ? "bg-linear-to-br from-violet-500/20 via-purple-500/10 to-fuchsia-500/20 border border-purple-500/20"
          : "bg-card border border-border"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p
            className={`text-xs font-medium ${
              isPrimary ? "text-purple-400" : "text-muted-foreground"
            }`}
          >
            {label}
          </p>
          <div className="flex items-center gap-2">
            <code className="font-mono text-sm">{formatAddress(address)}</code>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={onCopy}
                    className="p-1 rounded-md hover:bg-white/10 transition-colors"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{copied ? "Copied!" : "Copy address"}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <a
              href={`https://polygonscan.com/address/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 rounded-md hover:bg-white/10 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
            </a>
          </div>
        </div>
        {balance !== undefined && (
          <div className="text-right">
            <p
              className={`text-lg font-bold ${
                isPrimary ? "text-purple-300" : ""
              }`}
            >
              ${balance.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">USDC.e</p>
          </div>
        )}
      </div>
      {isPrimary && (
        <div className="absolute -bottom-8 -right-8 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl" />
      )}
    </div>
  );
}

function StatPill({
  label,
  value,
  change,
  trend,
  isLoading,
}: {
  label: string;
  value: string;
  change?: number;
  trend?: "up" | "down" | "neutral";
  isLoading?: boolean;
}) {
  const trendColor =
    trend === "up"
      ? "text-emerald-500"
      : trend === "down"
      ? "text-red-500"
      : "text-muted-foreground";
  const bgColor =
    trend === "up"
      ? "bg-emerald-500/10"
      : trend === "down"
      ? "bg-red-500/10"
      : "bg-muted";

  return (
    <div className="flex flex-col gap-1 p-4 rounded-xl bg-card border border-border">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      {isLoading ? (
        <Skeleton className="h-7 w-20" />
      ) : (
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-bold tracking-tight">{value}</span>
          {change !== undefined && (
            <span
              className={`text-xs font-medium px-1.5 py-0.5 rounded ${bgColor} ${trendColor}`}
            >
              {change >= 0 ? "+" : ""}
              {change.toFixed(1)}%
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function PositionRow({
  position,
  onNavigate,
}: {
  position: {
    id: string;
    outcome: string;
    size: number;
    avgPrice: number;
    currentPrice: number;
    currentValue: number;
    unrealizedPnl: number;
    unrealizedPnlPercent: number;
    market: {
      title: string;
      slug: string;
      icon?: string;
      endDate?: string;
    };
  };
  onNavigate: () => void;
}) {
  const isProfit = position.unrealizedPnl >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="group flex items-center gap-4 p-4 rounded-xl bg-card border border-border hover:border-primary/30 hover:bg-accent/50 transition-all cursor-pointer"
      onClick={onNavigate}
    >
      {/* Market Icon */}
      <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-muted shrink-0">
        {position.market.icon ? (
          <Image
            src={position.market.icon}
            alt={position.market.title}
            fill
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Market Info */}
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-sm truncate group-hover:text-primary transition-colors">
          {position.market.title}
        </h4>
        <div className="flex items-center gap-2 mt-1">
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              position.outcome === "Yes"
                ? "bg-emerald-500/20 text-emerald-500"
                : "bg-red-500/20 text-red-500"
            }`}
          >
            {position.outcome}
          </span>
          <span className="text-xs text-muted-foreground">
            {position.size.toFixed(2)} shares @{" "}
            {(position.avgPrice * 100).toFixed(0)}¢
          </span>
        </div>
      </div>

      {/* Value & P&L */}
      <div className="text-right shrink-0">
        <p className="font-semibold">{formatCurrency(position.currentValue)}</p>
        <p
          className={`text-sm flex items-center justify-end gap-1 ${
            isProfit ? "text-emerald-500" : "text-red-500"
          }`}
        >
          {isProfit ? (
            <ArrowUpRight className="h-3 w-3" />
          ) : (
            <ArrowDownRight className="h-3 w-3" />
          )}
          {formatCurrency(position.unrealizedPnl)} (
          {formatPercent(position.unrealizedPnlPercent)})
        </p>
      </div>

      {/* Arrow */}
      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
    </motion.div>
  );
}

function TradeRow({
  trade,
}: {
  trade: {
    id: string;
    timestamp: string;
    type: string;
    side: string | null;
    size: number;
    price: number;
    usdcAmount: number;
    outcome: string;
    transactionHash: string;
    market: {
      title: string;
      slug: string;
      icon: string;
    };
  };
}) {
  const isBuy = trade.side === "BUY";
  const isRedeem = trade.type === "REDEEM";

  return (
    <div className="flex items-center gap-4 py-3 border-b border-border last:border-0">
      {/* Type Badge */}
      <div className={`w-16 shrink-0`}>
        <span
          className={`text-xs font-medium px-2 py-1 rounded ${
            isRedeem
              ? "bg-blue-500/20 text-blue-500"
              : isBuy
              ? "bg-emerald-500/20 text-emerald-500"
              : "bg-red-500/20 text-red-500"
          }`}
        >
          {isRedeem ? "REDEEM" : trade.side}
        </span>
      </div>

      {/* Market Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{trade.market.title}</p>
        <p className="text-xs text-muted-foreground">
          {!isRedeem &&
            `${trade.size.toFixed(2)} @ ${(trade.price * 100).toFixed(1)}¢`}
          {isRedeem && `${trade.size.toFixed(2)} shares`}
        </p>
      </div>

      {/* Amount & Time */}
      <div className="text-right shrink-0">
        <p
          className={`font-medium ${
            isBuy ? "text-red-500" : "text-emerald-500"
          }`}
        >
          {isBuy ? "-" : "+"}${trade.usdcAmount.toFixed(2)}
        </p>
        <p className="text-xs text-muted-foreground">
          {timeAgo(trade.timestamp)}
        </p>
      </div>
    </div>
  );
}

function OrderRow({
  order,
  onCancel,
  isCancelling,
}: {
  order: {
    id: string;
    side: "BUY" | "SELL";
    price: number;
    remainingSize: number;
    createdAt: string;
    market?: { question?: string };
    tokenId: string;
  };
  onCancel: () => void;
  isCancelling: boolean;
}) {
  const isBuy = order.side === "BUY";

  return (
    <div className="flex items-center gap-4 py-3 border-b border-border last:border-0">
      {/* Side Badge */}
      <div className="w-14 shrink-0">
        <span
          className={`text-xs font-medium px-2 py-1 rounded ${
            isBuy
              ? "bg-emerald-500/20 text-emerald-500"
              : "bg-red-500/20 text-red-500"
          }`}
        >
          {order.side}
        </span>
      </div>

      {/* Order Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {order.market?.question || `Token ${order.tokenId.slice(0, 8)}...`}
        </p>
        <p className="text-xs text-muted-foreground">
          {order.remainingSize.toFixed(2)} @ {(order.price * 100).toFixed(1)}¢
        </p>
      </div>

      {/* Cancel Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          onCancel();
        }}
        disabled={isCancelling}
        className="h-8 px-3 text-red-500 hover:text-red-600 hover:bg-red-500/10"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-sm">
        {description}
      </p>
      {action && (
        <Button asChild>
          <Link href={action.href}>{action.label}</Link>
        </Button>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
        active
          ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
          : "text-muted-foreground hover:text-foreground hover:bg-muted"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
      {count !== undefined && count > 0 && (
        <span
          className={`ml-1 px-1.5 py-0.5 text-xs rounded-full ${
            active ? "bg-white/20" : "bg-primary/20 text-primary"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function PortfolioPage() {
  const { isConnected, address } = useAccount();
  const { open } = useAppKit();
  const [activeTab, setActiveTab] = useState<"positions" | "trades" | "orders">(
    "positions"
  );
  const [copied, setCopied] = useState<string | null>(null);

  // Polymarket proxy wallet
  const {
    proxyAddress,
    isDeployed: hasProxyWallet,
    usdcBalance: proxyUsdcBalance,
    isLoading: isProxyLoading,
    refresh: refreshProxyWallet,
  } = useProxyWallet();

  const tradingAddress =
    hasProxyWallet && proxyAddress ? proxyAddress : address;

  // Data fetching
  const {
    data: positionsData,
    isLoading: loadingPositions,
    refetch: refetchPositions,
  } = useUserPositions({ userAddress: tradingAddress || undefined });

  const {
    data: tradesData,
    isLoading: loadingTrades,
    refetch: refetchTrades,
  } = useUserTrades({ limit: 50, userAddress: tradingAddress || undefined });

  const {
    data: ordersData,
    isLoading: loadingOrders,
    refetch: refetchOrders,
  } = useOpenOrders({ userAddress: tradingAddress || undefined });

  const {
    data: pnlData,
    isLoading: loadingPnl,
    refetch: refetchPnl,
  } = useUserPnL({ period: "all", userAddress: tradingAddress || undefined });

  const {
    data: userDetailsData,
    isLoading: loadingUserDetails,
    refetch: refetchUserDetails,
  } = useUserDetails({
    userAddress: tradingAddress || undefined,
    timePeriod: "all",
  });

  const { mutate: cancelOrder, isPending: cancellingOrder } = useCancelOrder();

  // Handlers
  const handleCopy = (addr: string, type: string) => {
    navigator.clipboard.writeText(addr);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleRefresh = () => {
    refetchPositions();
    refetchTrades();
    refetchOrders();
    refetchPnl();
    refetchUserDetails();
    refreshProxyWallet();
  };

  // Computed values
  const totalPnl = userDetailsData?.details?.pnl || pnlData?.pnl.total || 0;
  const totalVolume =
    userDetailsData?.details?.volume || pnlData?.trading.totalBuyValue || 0;
  const portfolioValue = pnlData?.portfolio.currentValue || 0;
  const pnlTrend = totalPnl >= 0 ? "up" : "down";

  // Not connected state
  if (!isConnected) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container max-w-6xl mx-auto px-4 py-12">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-20"
          >
            <div className="relative">
              <div className="absolute inset-0 bg-linear-to-r from-violet-500 to-fuchsia-500 blur-3xl opacity-20" />
              <div className="relative w-24 h-24 rounded-3xl bg-linear-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center mb-8">
                <Wallet className="h-12 w-12 text-white" />
              </div>
            </div>
            <h1 className="text-3xl font-bold mb-3">Connect Your Wallet</h1>
            <p className="text-muted-foreground mb-8 text-center max-w-md">
              Connect your wallet to view your portfolio, track positions, and
              manage your trades.
            </p>
            <Button
              size="lg"
              onClick={() => open()}
              className="bg-linear-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600"
            >
              <Wallet className="mr-2 h-5 w-5" />
              Connect Wallet
            </Button>
          </motion.div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <motion.main
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="container max-w-6xl mx-auto px-4 py-6 space-y-6"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Portfolio</h1>
            <p className="text-sm text-muted-foreground">
              Track your positions and trading activity
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>

        {/* Wallet Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {address && (
            <WalletCard
              label="Connected Wallet"
              address={address}
              onCopy={() => handleCopy(address, "eoa")}
              copied={copied === "eoa"}
            />
          )}
          {isProxyLoading ? (
            <div className="rounded-2xl p-4 bg-card border border-border">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-6 w-32" />
            </div>
          ) : hasProxyWallet && proxyAddress ? (
            <WalletCard
              label="Polymarket Trading Wallet"
              address={proxyAddress}
              balance={proxyUsdcBalance}
              isPrimary
              onCopy={() => handleCopy(proxyAddress, "proxy")}
              copied={copied === "proxy"}
            />
          ) : (
            <div className="rounded-2xl p-4 bg-card border border-dashed border-border flex items-center justify-center">
              <p className="text-sm text-muted-foreground">
                No Polymarket wallet deployed
              </p>
            </div>
          )}
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatPill
            label="Portfolio Value"
            value={formatCurrency(portfolioValue)}
            isLoading={loadingPnl}
          />
          <StatPill
            label="Total P&L"
            value={formatCurrency(totalPnl)}
            change={pnlData?.pnl.roi}
            trend={pnlTrend}
            isLoading={loadingPnl || loadingUserDetails}
          />
          <StatPill
            label="Volume"
            value={formatCurrency(totalVolume, true)}
            isLoading={loadingPnl || loadingUserDetails}
          />
          <StatPill
            label="Positions"
            value={positionsData?.summary.positionCount?.toString() || "0"}
            isLoading={loadingPositions}
          />
        </div>

        {/* P&L Chart */}
        <PnLChart userAddress={tradingAddress || undefined} height={200} />

        {/* Tabs */}
        <div className="flex items-center gap-2 p-1 bg-muted/50 rounded-2xl w-fit">
          <TabButton
            active={activeTab === "positions"}
            onClick={() => setActiveTab("positions")}
            icon={LayoutGrid}
            label="Positions"
            count={positionsData?.summary.positionCount}
          />
          <TabButton
            active={activeTab === "trades"}
            onClick={() => setActiveTab("trades")}
            icon={History}
            label="History"
          />
          <TabButton
            active={activeTab === "orders"}
            onClick={() => setActiveTab("orders")}
            icon={ListOrdered}
            label="Orders"
            count={ordersData?.count}
          />
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          {activeTab === "positions" && (
            <motion.div
              key="positions"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-3"
            >
              {loadingPositions ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-4 p-4 rounded-xl bg-card border border-border"
                    >
                      <Skeleton className="w-12 h-12 rounded-xl" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                      <Skeleton className="h-6 w-20" />
                    </div>
                  ))}
                </div>
              ) : !positionsData?.positions.length ? (
                <EmptyState
                  icon={LayoutGrid}
                  title="No Positions"
                  description="You don't have any open positions yet. Start trading to see your portfolio here."
                  action={{ label: "Browse Markets", href: "/" }}
                />
              ) : (
                <>
                  {positionsData.positions.map((position) => (
                    <PositionRow
                      key={position.id}
                      position={position}
                      onNavigate={() => {
                        window.location.href = `/markets/${position.market.slug}`;
                      }}
                    />
                  ))}

                  {/* Summary Card */}
                  <div className="mt-6 p-4 rounded-xl bg-linear-to-r from-violet-500/10 to-fuchsia-500/10 border border-purple-500/20">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Total Value
                        </p>
                        <p className="text-lg font-bold">
                          {formatCurrency(positionsData.summary.totalValue)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Unrealized P&L
                        </p>
                        <p
                          className={`text-lg font-bold ${
                            positionsData.summary.totalUnrealizedPnl >= 0
                              ? "text-emerald-500"
                              : "text-red-500"
                          }`}
                        >
                          {formatCurrency(
                            positionsData.summary.totalUnrealizedPnl
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Realized P&L
                        </p>
                        <p
                          className={`text-lg font-bold ${
                            positionsData.summary.totalRealizedPnl >= 0
                              ? "text-emerald-500"
                              : "text-red-500"
                          }`}
                        >
                          {formatCurrency(
                            positionsData.summary.totalRealizedPnl
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Active Positions
                        </p>
                        <p className="text-lg font-bold">
                          {positionsData.summary.positionCount}
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          )}

          {activeTab === "trades" && (
            <motion.div
              key="trades"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="rounded-xl bg-card border border-border overflow-hidden"
            >
              {loadingTrades ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="w-14 h-6 rounded" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                      <Skeleton className="h-5 w-16" />
                    </div>
                  ))}
                </div>
              ) : !tradesData?.trades.length ? (
                <EmptyState
                  icon={History}
                  title="No Trade History"
                  description="Your trading history will appear here once you make your first trade."
                  action={{ label: "Start Trading", href: "/" }}
                />
              ) : (
                <div className="divide-y divide-border">
                  <div className="px-4 py-3 bg-muted/30">
                    <p className="text-sm font-medium">Recent Trades</p>
                  </div>
                  <div className="px-4">
                    {tradesData.trades.slice(0, 20).map((trade) => (
                      <TradeRow key={trade.id} trade={trade} />
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === "orders" && (
            <motion.div
              key="orders"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="rounded-xl bg-card border border-border overflow-hidden"
            >
              {loadingOrders ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="w-14 h-6 rounded" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                      <Skeleton className="h-8 w-8 rounded" />
                    </div>
                  ))}
                </div>
              ) : !ordersData?.orders.length ? (
                <EmptyState
                  icon={ListOrdered}
                  title="No Open Orders"
                  description="You don't have any pending orders. Place a limit order to see it here."
                  action={{ label: "Place Order", href: "/" }}
                />
              ) : (
                <div className="divide-y divide-border">
                  <div className="px-4 py-3 bg-muted/30 flex items-center justify-between">
                    <p className="text-sm font-medium">Open Orders</p>
                    <p className="text-xs text-muted-foreground">
                      {ordersData.count} orders
                    </p>
                  </div>
                  <div className="px-4">
                    {ordersData.orders.map((order) => (
                      <OrderRow
                        key={order.id}
                        order={order}
                        onCancel={() => cancelOrder(order.id)}
                        isCancelling={cancellingOrder}
                      />
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.main>
    </div>
  );
}
