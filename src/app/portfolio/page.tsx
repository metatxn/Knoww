"use client";

import { useAppKit } from "@reown/appkit/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowUpRight,
  BarChart3,
  Check,
  Copy,
  ExternalLink,
  History,
  LayoutGrid,
  ListOrdered,
  Minus,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Wallet,
  XCircle,
  FileText,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useConnection } from "wagmi";
import { Navbar } from "@/components/navbar";
import { PnLChart } from "@/components/pnl-chart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCancelOrder, useOpenOrders } from "@/hooks/use-open-orders";
import { useProxyWallet } from "@/hooks/use-proxy-wallet";
import { useUserDetails } from "@/hooks/use-user-details";
import { useUserPnL } from "@/hooks/use-user-pnl";
import { useUserPositions } from "@/hooks/use-user-positions";
import { useUserTrades } from "@/hooks/use-user-trades";

// ============================================================================
// Utility Functions
// ============================================================================

function formatCurrency(value: number, showSign = false): string {
  const absValue = Math.abs(value);
  const sign = value < 0 ? "-" : value > 0 && showSign ? "+" : "";
  return `${sign}$${absValue.toFixed(2)}`;
}

function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatPrice(value: number): string {
  return `${(value * 100).toFixed(0)}¢`;
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
  const diffMonths = Math.floor(diffDays / 30);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays} days ago`;
  if (diffMonths < 12) return `${diffMonths} mo ago`;
  return then.toLocaleDateString();
}

// ============================================================================
// Tab Navigation
// ============================================================================

type TabType = "positions" | "orders" | "history";

function TabNav({
  activeTab,
  onTabChange,
  positionCount,
  orderCount,
}: {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  positionCount?: number;
  orderCount?: number;
}) {
  const tabs: { id: TabType; label: string; count?: number }[] = [
    { id: "positions", label: "Positions", count: positionCount },
    { id: "orders", label: "Open orders", count: orderCount },
    { id: "history", label: "History" },
  ];

  return (
    <div className="flex items-center border-b border-border">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`relative px-5 py-3.5 text-sm font-medium transition-colors ${
            activeTab === tab.id
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span className="flex items-center gap-2">
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span
                className={`text-xs px-1.5 py-0.5 rounded ${
                  activeTab === tab.id
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {tab.count}
              </span>
            )}
          </span>
          {activeTab === tab.id && (
            <motion.div
              layoutId="activeTab"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
            />
          )}
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// Search Bar
// ============================================================================

function SearchBar({
  value,
  onChange,
  placeholder = "Search",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative max-w-sm">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-9 h-10 bg-background"
      />
    </div>
  );
}

// ============================================================================
// Empty State
// ============================================================================

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
      <div className="w-14 h-14 rounded-full bg-muted/50 flex items-center justify-center mb-4">
        <Icon className="h-7 w-7 text-muted-foreground" />
      </div>
      <h3 className="text-base font-medium mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-xs">{description}</p>
      {action && (
        <Button asChild className="mt-4" size="sm">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      )}
    </div>
  );
}

// ============================================================================
// Positions Table
// ============================================================================

interface Position {
  id: string;
  outcome: string;
  size: number;
  avgPrice: number;
  currentPrice: number;
  currentValue: number;
  initialValue: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  market: {
    title: string;
    slug: string;
    eventSlug: string;
    eventId?: string;
    icon?: string;
    endDate?: string;
  };
}

function PositionsTable({
  positions,
  isLoading,
  searchQuery,
}: {
  positions: Position[];
  isLoading: boolean;
  searchQuery: string;
}) {
  const filteredPositions = positions.filter((p) =>
    p.market.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="p-6 space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (filteredPositions.length === 0) {
    return (
      <EmptyState
        icon={LayoutGrid}
        title="No positions found"
        description={
          searchQuery
            ? "Try a different search term"
            : "Start trading to see your positions here"
        }
        action={
          !searchQuery ? { label: "Explore Markets", href: "/" } : undefined
        }
      />
    );
  }

  // Calculate totals
  const totalBet = filteredPositions.reduce(
    (sum, p) => sum + p.initialValue,
    0
  );
  const totalToWin = filteredPositions.reduce(
    (sum, p) => sum + p.size * (1 - p.avgPrice),
    0
  );
  const totalValue = filteredPositions.reduce(
    (sum, p) => sum + p.currentValue,
    0
  );
  const totalPnl = filteredPositions.reduce(
    (sum, p) => sum + p.unrealizedPnl,
    0
  );
  const totalPnlPercent = totalBet > 0 ? (totalPnl / totalBet) * 100 : 0;

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-[40%]">Market</TableHead>
          <TableHead className="text-center">Avg → Now</TableHead>
          <TableHead className="text-right">Bet</TableHead>
          <TableHead className="text-right">To Win</TableHead>
          <TableHead className="text-right">Value</TableHead>
          <TableHead className="w-[80px]"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filteredPositions.map((position) => {
          const isProfit = position.unrealizedPnl >= 0;
          const toWin = position.size * (1 - position.avgPrice);

          return (
            <TableRow key={position.id} className="group">
              <TableCell>
                <Link
                  href={`/events/detail/${position.market.eventSlug}`}
                  className="flex items-center gap-3"
                >
                  <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-muted shrink-0">
                    {position.market.icon ? (
                      <Image
                        src={position.market.icon}
                        alt={position.market.title}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <BarChart3 className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate max-w-[280px] group-hover:text-primary transition-colors">
                      {position.market.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <span
                        className={
                          position.outcome === "Yes"
                            ? "text-emerald-500"
                            : "text-red-500"
                        }
                      >
                        {position.outcome} {formatPrice(position.avgPrice)}
                      </span>
                      <span className="mx-1.5">·</span>
                      {position.size.toFixed(1)} shares
                    </p>
                  </div>
                </Link>
              </TableCell>
              <TableCell className="text-center">
                <span className="text-muted-foreground">
                  {formatPrice(position.avgPrice)}
                </span>
                <span className="mx-1 text-muted-foreground">→</span>
                <span
                  className={
                    position.currentPrice > position.avgPrice
                      ? "text-emerald-500"
                      : position.currentPrice < position.avgPrice
                      ? "text-red-500"
                      : ""
                  }
                >
                  {formatPrice(position.currentPrice)}
                </span>
              </TableCell>
              <TableCell className="text-right">
                {formatCurrency(position.initialValue)}
              </TableCell>
              <TableCell className="text-right">
                {formatCurrency(toWin)}
              </TableCell>
              <TableCell className="text-right">
                <div className="font-medium">
                  {formatCurrency(position.currentValue)}
                </div>
                <div
                  className={`text-xs ${
                    isProfit ? "text-emerald-500" : "text-red-500"
                  }`}
                >
                  {formatCurrency(position.unrealizedPnl, true)} (
                  {formatPercent(position.unrealizedPnlPercent)})
                </div>
              </TableCell>
              <TableCell>
                <Button
                  size="sm"
                  className="bg-sky-500 hover:bg-sky-600 text-white h-8"
                >
                  Sell
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell className="font-medium">Total</TableCell>
          <TableCell></TableCell>
          <TableCell className="text-right font-medium">
            {formatCurrency(totalBet)}
          </TableCell>
          <TableCell className="text-right font-medium">
            {formatCurrency(totalToWin)}
          </TableCell>
          <TableCell className="text-right">
            <div className="font-medium">{formatCurrency(totalValue)}</div>
            <div
              className={`text-xs ${
                totalPnl >= 0 ? "text-emerald-500" : "text-red-500"
              }`}
            >
              {formatCurrency(totalPnl, true)} ({formatPercent(totalPnlPercent)}
              )
            </div>
          </TableCell>
          <TableCell></TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}

// ============================================================================
// Orders Table
// ============================================================================

interface Order {
  id: string;
  side: "BUY" | "SELL";
  price: number;
  size: number;
  filledSize: number;
  remainingSize: number;
  createdAt: string;
  expiration: string;
  market?: { question: string; slug: string; outcome: string };
  tokenId: string;
}

function OrdersTable({
  orders,
  isLoading,
  searchQuery,
  onCancel,
  cancellingOrderId,
}: {
  orders: Order[];
  isLoading: boolean;
  searchQuery: string;
  onCancel: (orderId: string) => void;
  cancellingOrderId?: string;
}) {
  const filteredOrders = orders.filter(
    (o) =>
      o.market?.question?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.tokenId.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="p-6 space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (filteredOrders.length === 0) {
    return (
      <EmptyState
        icon={ListOrdered}
        title="No open orders found"
        description={
          searchQuery
            ? "Try a different search term"
            : "Place limit orders to see them here"
        }
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-[35%]">Market</TableHead>
          <TableHead className="text-center">Side</TableHead>
          <TableHead className="text-center">Outcome</TableHead>
          <TableHead className="text-right">Price</TableHead>
          <TableHead className="text-right">Filled</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead className="text-center">Expiration</TableHead>
          <TableHead className="w-[50px]"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filteredOrders.map((order) => (
          <TableRow key={order.id}>
            <TableCell>
              <p className="font-medium text-sm truncate max-w-[250px]">
                {order.market?.question ||
                  `Token ${order.tokenId.slice(0, 8)}...`}
              </p>
            </TableCell>
            <TableCell className="text-center">
              <span
                className={`inline-flex text-xs font-medium px-2 py-1 rounded ${
                  order.side === "BUY"
                    ? "bg-emerald-500/15 text-emerald-500"
                    : "bg-red-500/15 text-red-500"
                }`}
              >
                {order.side}
              </span>
            </TableCell>
            <TableCell className="text-center text-sm">
              {order.market?.outcome || "-"}
            </TableCell>
            <TableCell className="text-right">
              {formatPrice(order.price)}
            </TableCell>
            <TableCell className="text-right text-sm text-muted-foreground">
              {order.filledSize.toFixed(1)} / {order.size.toFixed(1)}
            </TableCell>
            <TableCell className="text-right">
              {formatCurrency(order.size * order.price)}
            </TableCell>
            <TableCell className="text-center text-sm text-muted-foreground">
              {order.expiration && order.expiration !== "0"
                ? new Date(
                    parseInt(order.expiration) * 1000
                  ).toLocaleDateString()
                : "GTC"}
            </TableCell>
            <TableCell>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onCancel(order.id)}
                disabled={cancellingOrderId === order.id}
                className="h-8 w-8 text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ============================================================================
// History Table
// ============================================================================

interface Trade {
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
}

function getActivityInfo(
  type: string,
  side?: string | null,
  pnl?: number
): { label: string; icon: React.ElementType; color: string } {
  if (type === "REDEEM") {
    if (pnl && pnl > 0) {
      return {
        label: "Claimed",
        icon: Check,
        color: "text-emerald-500 bg-emerald-500/15",
      };
    }
    return {
      label: "Lost",
      icon: XCircle,
      color: "text-red-500 bg-red-500/15",
    };
  }
  if (type === "DEPOSIT") {
    return {
      label: "Deposited",
      icon: Plus,
      color: "text-sky-500 bg-sky-500/15",
    };
  }
  if (type === "WITHDRAW") {
    return {
      label: "Withdrew",
      icon: Minus,
      color: "text-orange-500 bg-orange-500/15",
    };
  }
  if (side === "BUY") {
    return {
      label: "Bought",
      icon: Plus,
      color: "text-emerald-500 bg-emerald-500/15",
    };
  }
  if (side === "SELL") {
    return {
      label: "Sold",
      icon: Minus,
      color: "text-muted-foreground bg-muted",
    };
  }
  return {
    label: type,
    icon: FileText,
    color: "text-muted-foreground bg-muted",
  };
}

function HistoryTable({
  trades,
  isLoading,
  searchQuery,
}: {
  trades: Trade[];
  isLoading: boolean;
  searchQuery: string;
}) {
  const filteredTrades = trades.filter((t) =>
    t.market.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="p-6 space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (filteredTrades.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No history found"
        description={
          searchQuery
            ? "Try a different search term"
            : "Your trading history will appear here"
        }
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-[120px]">Activity</TableHead>
          <TableHead>Market</TableHead>
          <TableHead className="text-right w-[100px]">Value</TableHead>
          <TableHead className="text-right w-[120px]">Time</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filteredTrades.map((trade) => {
          const activityInfo = getActivityInfo(
            trade.type,
            trade.side,
            trade.usdcAmount
          );
          const ActivityIcon = activityInfo.icon;
          const isBuy = trade.side === "BUY";
          const isRedeem = trade.type === "REDEEM";

          return (
            <TableRow key={trade.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${activityInfo.color}`}
                  >
                    <ActivityIcon className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-sm font-medium">
                    {activityInfo.label}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-3">
                  <div className="relative w-9 h-9 rounded-lg overflow-hidden bg-muted shrink-0">
                    {trade.market.icon ? (
                      <Image
                        src={trade.market.icon}
                        alt={trade.market.title}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <BarChart3 className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate max-w-[300px]">
                      {trade.market.title}
                    </p>
                    {!isRedeem && (
                      <p className="text-xs text-muted-foreground">
                        <span
                          className={
                            trade.outcome === "Yes"
                              ? "text-emerald-500"
                              : "text-red-500"
                          }
                        >
                          {trade.outcome} {formatPrice(trade.price)}
                        </span>
                        <span className="mx-1.5">·</span>
                        {trade.size.toFixed(1)} shares
                      </p>
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-right">
                <span
                  className={`font-medium ${
                    isBuy
                      ? "text-red-500"
                      : trade.usdcAmount > 0
                      ? "text-emerald-500"
                      : "text-muted-foreground"
                  }`}
                >
                  {isBuy ? "-" : trade.usdcAmount > 0 ? "+" : ""}
                  {trade.usdcAmount > 0
                    ? formatCurrency(trade.usdcAmount)
                    : "-"}
                </span>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <span className="text-sm text-muted-foreground">
                    {timeAgo(trade.timestamp)}
                  </span>
                  <a
                    href={`https://polygonscan.com/tx/${trade.transactionHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

// ============================================================================
// Stats Card
// ============================================================================

function StatCard({
  label,
  value,
  isLoading,
  valueClassName,
}: {
  label: string;
  value: string;
  isLoading?: boolean;
  valueClassName?: string;
}) {
  return (
    <div className="bg-card rounded-xl p-4 border border-border">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      {isLoading ? (
        <Skeleton className="h-7 w-20" />
      ) : (
        <p className={`text-xl font-bold ${valueClassName || ""}`}>{value}</p>
      )}
    </div>
  );
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function PortfolioPage() {
  const { isConnected, address } = useConnection();
  const { open } = useAppKit();
  const [activeTab, setActiveTab] = useState<TabType>("positions");
  const [searchQuery, setSearchQuery] = useState("");
  const [copied, setCopied] = useState(false);

  // Proxy wallet data
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
  } = useUserTrades({ limit: 100, userAddress: tradingAddress || undefined });

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

  const { mutate: cancelOrder } = useCancelOrder();
  const [cancellingOrderId, setCancellingOrderId] = useState<string>();

  // Handlers
  const handleCopy = () => {
    if (proxyAddress) {
      navigator.clipboard.writeText(proxyAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRefresh = () => {
    refetchPositions();
    refetchTrades();
    refetchOrders();
    refetchPnl();
    refetchUserDetails();
    refreshProxyWallet();
  };

  const handleCancelOrder = (orderId: string) => {
    setCancellingOrderId(orderId);
    cancelOrder(orderId, {
      onSettled: () => setCancellingOrderId(undefined),
    });
  };

  // Computed values
  const openPositionsValue = positionsData?.summary.totalValue ?? 0;
  const cashBalance = proxyUsdcBalance ?? 0;
  const portfolioValue = openPositionsValue + cashBalance;
  const totalPnl = userDetailsData?.details?.pnl || pnlData?.pnl.total || 0;

  // Not connected state
  if (!isConnected) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container max-w-5xl mx-auto px-4 py-12">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-20"
          >
            <div className="relative">
              <div className="absolute inset-0 bg-linear-to-r from-violet-500 to-fuchsia-500 blur-3xl opacity-20" />
              <div className="relative w-20 h-20 rounded-2xl bg-linear-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center mb-6">
                <Wallet className="h-10 w-10 text-white" />
              </div>
            </div>
            <h1 className="text-2xl font-bold mb-2">Connect Your Wallet</h1>
            <p className="text-muted-foreground mb-6 text-center max-w-md text-sm">
              Connect your wallet to view your portfolio, track positions, and
              manage your trades.
            </p>
            <Button
              onClick={() => open()}
              className="bg-linear-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600"
            >
              <Wallet className="mr-2 h-4 w-4" />
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
        className="container max-w-5xl mx-auto px-4 py-6"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold">Portfolio</h1>
            {proxyAddress && (
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <code>{formatAddress(proxyAddress)}</code>
                {copied ? (
                  <Check className="h-3 w-3 text-emerald-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard
            label="Portfolio Value"
            value={formatCurrency(portfolioValue)}
            isLoading={loadingPositions || isProxyLoading}
          />
          <StatCard
            label="Open Positions"
            value={formatCurrency(openPositionsValue)}
            isLoading={loadingPositions}
          />
          <StatCard
            label="Cash"
            value={formatCurrency(cashBalance)}
            isLoading={isProxyLoading}
          />
          <StatCard
            label="Total P&L"
            value={formatCurrency(totalPnl, true)}
            isLoading={loadingPnl || loadingUserDetails}
            valueClassName={totalPnl >= 0 ? "text-emerald-500" : "text-red-500"}
          />
        </div>

        {/* P&L Chart */}
        <div className="mb-6">
          <PnLChart userAddress={tradingAddress || undefined} height={160} />
        </div>

        {/* Tabs Content */}
        <div className="bg-card rounded-xl border border-border">
          {/* Tab Navigation */}
          <TabNav
            activeTab={activeTab}
            onTabChange={(tab) => {
              setActiveTab(tab);
              setSearchQuery("");
            }}
            positionCount={positionsData?.summary.positionCount}
            orderCount={ordersData?.count}
          />

          {/* Search Bar */}
          <div className="p-4 border-b border-border">
            <SearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search"
            />
          </div>

          {/* Tab Content */}
          <AnimatePresence mode="wait">
            {activeTab === "positions" && (
              <motion.div
                key="positions"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <PositionsTable
                  positions={positionsData?.positions || []}
                  isLoading={loadingPositions}
                  searchQuery={searchQuery}
                />
              </motion.div>
            )}

            {activeTab === "orders" && (
              <motion.div
                key="orders"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <OrdersTable
                  orders={ordersData?.orders || []}
                  isLoading={loadingOrders}
                  searchQuery={searchQuery}
                  onCancel={handleCancelOrder}
                  cancellingOrderId={cancellingOrderId}
                />
              </motion.div>
            )}

            {activeTab === "history" && (
              <motion.div
                key="history"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <HistoryTable
                  trades={tradesData?.trades || []}
                  isLoading={loadingTrades}
                  searchQuery={searchQuery}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.main>
    </div>
  );
}
