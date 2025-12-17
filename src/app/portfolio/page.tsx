"use client";

import { useAppKit } from "@reown/appkit/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownRight,
  ArrowDownToLine,
  ArrowUpDown,
  ArrowUpRight,
  BarChart3,
  Check,
  Copy,
  ExternalLink,
  FileText,
  History,
  LayoutGrid,
  ListOrdered,
  Minus,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  TrendingUp,
  Wallet,
  XCircle,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useConnection } from "wagmi";
import { DepositModal } from "@/components/deposit-modal";
import { Navbar } from "@/components/navbar";
import { PageBackground } from "@/components/page-background";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
// Sorting & Filtering Types
// ============================================================================

type SortField = "value" | "pnl" | "name" | "date";
type SortDirection = "asc" | "desc";
type PnLFilter = "all" | "profit" | "loss";

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
          type="button"
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
// Search Bar with Filter
// ============================================================================

function SearchBar({
  value,
  onChange,
  placeholder = "Search",
  pnlFilter,
  onPnlFilterChange,
  showFilter = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  pnlFilter?: PnLFilter;
  onPnlFilterChange?: (filter: PnLFilter) => void;
  showFilter?: boolean;
}) {
  return (
    <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pl-9 h-10 bg-background"
        />
      </div>
      {showFilter && onPnlFilterChange && (
        <div className="flex items-center gap-1.5 p-1 bg-muted/50 rounded-lg">
          <button
            type="button"
            onClick={() => onPnlFilterChange("all")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              pnlFilter === "all"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => onPnlFilterChange("profit")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${
              pnlFilter === "profit"
                ? "bg-emerald-500/15 text-emerald-500 shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ArrowUpRight className="h-3 w-3" />
            Profit
          </button>
          <button
            type="button"
            onClick={() => onPnlFilterChange("loss")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${
              pnlFilter === "loss"
                ? "bg-red-500/15 text-red-500 shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ArrowDownRight className="h-3 w-3" />
            Loss
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Empty State - Enhanced
// ============================================================================

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  action?: { label: string; href: string };
  secondaryAction?: { label: string; href: string };
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 sm:py-16 text-center px-4">
      <div className="relative">
        <div className="absolute inset-0 bg-linear-to-r from-violet-500/20 to-fuchsia-500/20 blur-2xl rounded-full" />
        <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-linear-to-br from-muted to-muted/50 flex items-center justify-center mb-4">
          <Icon className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground" />
        </div>
      </div>
      <h3 className="text-base sm:text-lg font-semibold mb-1.5">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-xs mb-4">
        {description}
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        {action && (
          <Button
            asChild
            size="sm"
            className="bg-linear-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600"
          >
            <Link href={action.href}>
              <TrendingUp className="h-4 w-4 mr-1.5" />
              {action.label}
            </Link>
          </Button>
        )}
        {secondaryAction && (
          <Button asChild variant="outline" size="sm">
            <Link href={secondaryAction.href}>{secondaryAction.label}</Link>
          </Button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Sortable Table Header
// ============================================================================

function SortableHeader({
  label,
  field,
  currentSort,
  onSort,
  className = "",
  tooltip,
}: {
  label: string;
  field: SortField;
  currentSort: SortField;
  onSort: (field: SortField) => void;
  className?: string;
  tooltip?: string;
}) {
  const isActive = currentSort === field;

  const content = (
    <button
      type="button"
      onClick={() => onSort(field)}
      className={`flex items-center gap-1 hover:text-foreground transition-colors ${className} ${
        isActive ? "text-foreground" : ""
      }`}
    >
      {label}
      <ArrowUpDown
        className={`h-3 w-3 ${isActive ? "text-primary" : "opacity-50"}`}
      />
    </button>
  );

  if (tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="top" className="text-xs max-w-[200px]">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    );
  }

  return content;
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
  pnlFilter,
  sortField,
  sortDirection,
  onSort,
}: {
  positions: Position[];
  isLoading: boolean;
  searchQuery: string;
  pnlFilter: PnLFilter;
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
}) {
  // Filter and sort positions
  const filteredPositions = useMemo(() => {
    let result = positions.filter((p) =>
      p.market.title.toLowerCase().includes(searchQuery.toLowerCase()),
    );

    // Apply P&L filter
    if (pnlFilter === "profit") {
      result = result.filter((p) => p.unrealizedPnl >= 0);
    } else if (pnlFilter === "loss") {
      result = result.filter((p) => p.unrealizedPnl < 0);
    }

    // Apply sorting
    result = [...result].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "value":
          comparison = a.currentValue - b.currentValue;
          break;
        case "pnl":
          comparison = a.unrealizedPnl - b.unrealizedPnl;
          break;
        case "name":
          comparison = a.market.title.localeCompare(b.market.title);
          break;
        default:
          comparison = 0;
      }
      return sortDirection === "desc" ? -comparison : comparison;
    });

    return result;
  }, [positions, searchQuery, pnlFilter, sortField, sortDirection]);

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
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
          searchQuery || pnlFilter !== "all"
            ? "Try adjusting your search or filters"
            : "Start trading to build your portfolio and see your positions here"
        }
        action={
          !searchQuery && pnlFilter === "all"
            ? { label: "Explore Markets", href: "/" }
            : undefined
        }
        secondaryAction={
          !searchQuery && pnlFilter === "all"
            ? { label: "View Trending", href: "/?sort=trending" }
            : undefined
        }
      />
    );
  }

  // Calculate totals
  const totalBet = filteredPositions.reduce(
    (sum, p) => sum + p.initialValue,
    0,
  );
  const totalToWin = filteredPositions.reduce(
    (sum, p) => sum + p.size * (1 - p.avgPrice),
    0,
  );
  const totalValue = filteredPositions.reduce(
    (sum, p) => sum + p.currentValue,
    0,
  );
  const totalPnl = filteredPositions.reduce(
    (sum, p) => sum + p.unrealizedPnl,
    0,
  );
  const totalPnlPercent = totalBet > 0 ? (totalPnl / totalBet) * 100 : 0;

  return (
    <TooltipProvider>
      {/* Mobile Card View */}
      <div className="md:hidden space-y-3 p-4">
        {filteredPositions.map((position) => {
          const isProfit = position.unrealizedPnl >= 0;
          const toWin = position.size * (1 - position.avgPrice);

          return (
            <motion.div
              key={position.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-background border border-border rounded-xl p-4 space-y-3"
            >
              <Link
                href={`/events/detail/${position.market.eventSlug}`}
                className="flex items-start gap-3"
              >
                <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-muted shrink-0">
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
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm line-clamp-2 leading-tight">
                    {position.market.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        position.outcome === "Yes"
                          ? "bg-emerald-500/15 text-emerald-500"
                          : "bg-red-500/15 text-red-500"
                      }`}
                    >
                      {position.outcome}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {position.size.toFixed(1)} shares
                    </span>
                  </div>
                </div>
              </Link>

              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    Avg → Now
                  </p>
                  <p className="text-sm font-medium">
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
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    Value
                  </p>
                  <p className="text-sm font-bold">
                    {formatCurrency(position.currentValue)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    Bet / To Win
                  </p>
                  <p className="text-sm">
                    {formatCurrency(position.initialValue)} /{" "}
                    {formatCurrency(toWin)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    P&L
                  </p>
                  <p
                    className={`text-sm font-medium flex items-center justify-end gap-1 ${
                      isProfit ? "text-emerald-500" : "text-red-500"
                    }`}
                  >
                    {isProfit ? (
                      <ArrowUpRight className="h-3 w-3" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3" />
                    )}
                    {formatCurrency(position.unrealizedPnl, true)}
                    <span className="text-xs opacity-80">
                      ({formatPercent(position.unrealizedPnlPercent)})
                    </span>
                  </p>
                </div>
              </div>

              <Button
                asChild
                size="sm"
                variant="outline"
                className="w-full mt-2"
              >
                <Link href={`/events/detail/${position.market.eventSlug}`}>
                  Manage Position
                </Link>
              </Button>
            </motion.div>
          );
        })}

        {/* Mobile Total Summary */}
        <div className="bg-muted/50 rounded-xl p-4 border border-border">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Portfolio Summary
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">
                Total Bet
              </p>
              <p className="font-semibold">{formatCurrency(totalBet)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground uppercase">
                Total Value
              </p>
              <p className="font-semibold">{formatCurrency(totalValue)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">
                To Win
              </p>
              <p className="font-medium">{formatCurrency(totalToWin)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground uppercase">
                Total P&L
              </p>
              <p
                className={`font-semibold ${
                  totalPnl >= 0 ? "text-emerald-500" : "text-red-500"
                }`}
              >
                {formatCurrency(totalPnl, true)} (
                {formatPercent(totalPnlPercent)})
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-b">
              <TableHead className="w-[40%] min-w-[200px]">
                <SortableHeader
                  label="Market"
                  field="name"
                  currentSort={sortField}
                  onSort={onSort}
                />
              </TableHead>
              <TableHead className="text-center min-w-[100px]">
                <Tooltip>
                  <TooltipTrigger className="cursor-help">
                    Avg → Now
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs max-w-[200px]">
                    Your average buy price → Current market price
                  </TooltipContent>
                </Tooltip>
              </TableHead>
              <TableHead className="text-right min-w-[80px]">Bet</TableHead>
              <TableHead className="text-right min-w-[80px]">To Win</TableHead>
              <TableHead className="min-w-[100px]">
                <div className="flex justify-end">
                  <SortableHeader
                    label="Value"
                    field="value"
                    currentSort={sortField}
                    onSort={onSort}
                    tooltip="Current market value of your position"
                  />
                </div>
              </TableHead>
              <TableHead className="w-[80px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPositions.map((position) => {
              const isProfit = position.unrealizedPnl >= 0;
              const toWin = position.size * (1 - position.avgPrice);

              return (
                <TableRow
                  key={position.id}
                  className="group hover:bg-muted/50 transition-colors"
                >
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
                      className={`text-xs flex items-center justify-end gap-0.5 ${
                        isProfit ? "text-emerald-500" : "text-red-500"
                      }`}
                    >
                      {isProfit ? (
                        <ArrowUpRight className="h-3 w-3" />
                      ) : (
                        <ArrowDownRight className="h-3 w-3" />
                      )}
                      {formatCurrency(position.unrealizedPnl, true)} (
                      {formatPercent(position.unrealizedPnlPercent)})
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button
                      asChild
                      size="sm"
                      className="bg-sky-500 hover:bg-sky-600 text-white h-8"
                    >
                      <Link
                        href={`/events/detail/${position.market.eventSlug}`}
                      >
                        Trade
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow className="bg-muted/30">
              <TableCell className="font-semibold">
                Total ({filteredPositions.length})
              </TableCell>
              <TableCell></TableCell>
              <TableCell className="text-right font-semibold">
                {formatCurrency(totalBet)}
              </TableCell>
              <TableCell className="text-right font-semibold">
                {formatCurrency(totalToWin)}
              </TableCell>
              <TableCell className="text-right">
                <div className="font-semibold">
                  {formatCurrency(totalValue)}
                </div>
                <div
                  className={`text-xs flex items-center justify-end gap-0.5 ${
                    totalPnl >= 0 ? "text-emerald-500" : "text-red-500"
                  }`}
                >
                  {totalPnl >= 0 ? (
                    <ArrowUpRight className="h-3 w-3" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3" />
                  )}
                  {formatCurrency(totalPnl, true)} (
                  {formatPercent(totalPnlPercent)})
                </div>
              </TableCell>
              <TableCell></TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </TooltipProvider>
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
      o.tokenId.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (filteredOrders.length === 0) {
    return (
      <EmptyState
        icon={ListOrdered}
        title="No open orders"
        description={
          searchQuery
            ? "Try a different search term"
            : "Place limit orders on any market to see them here. Limit orders let you set your own price."
        }
        action={
          !searchQuery ? { label: "Browse Markets", href: "/" } : undefined
        }
      />
    );
  }

  return (
    <>
      {/* Mobile Card View */}
      <div className="md:hidden space-y-3 p-4">
        {filteredOrders.map((order) => (
          <motion.div
            key={order.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-background border border-border rounded-xl p-4 space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm line-clamp-2 leading-tight">
                  {order.market?.question ||
                    `Token ${order.tokenId.slice(0, 8)}...`}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      order.side === "BUY"
                        ? "bg-emerald-500/15 text-emerald-500"
                        : "bg-red-500/15 text-red-500"
                    }`}
                  >
                    {order.side}
                  </span>
                  {order.market?.outcome && (
                    <span className="text-xs text-muted-foreground">
                      {order.market.outcome}
                    </span>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onCancel(order.id)}
                disabled={cancellingOrderId === order.id}
                className="h-8 w-8 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 shrink-0"
              >
                {cancellingOrderId === order.id ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-3 pt-3 border-t border-border">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  Price
                </p>
                <p className="text-sm font-medium">
                  {formatPrice(order.price)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  Filled
                </p>
                <p className="text-sm">
                  {order.filledSize.toFixed(1)} / {order.size.toFixed(1)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  Total
                </p>
                <p className="text-sm font-medium">
                  {formatCurrency(order.size * order.price)}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border">
              <span>
                Expiration:{" "}
                {order.expiration && order.expiration !== "0"
                  ? new Date(
                      parseInt(order.expiration, 10) * 1000,
                    ).toLocaleDateString()
                  : "Good till cancelled"}
              </span>
              {/* Progress indicator */}
              <div className="flex items-center gap-1.5">
                <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      order.side === "BUY" ? "bg-emerald-500" : "bg-red-500"
                    }`}
                    style={{
                      width: `${(order.filledSize / order.size) * 100}%`,
                    }}
                  />
                </div>
                <span>
                  {((order.filledSize / order.size) * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-b">
              <TableHead className="w-[35%] min-w-[180px]">Market</TableHead>
              <TableHead className="text-center min-w-[60px]">Side</TableHead>
              <TableHead className="text-center min-w-[80px]">
                Outcome
              </TableHead>
              <TableHead className="text-right min-w-[70px]">Price</TableHead>
              <TableHead className="text-right min-w-[90px]">Filled</TableHead>
              <TableHead className="text-right min-w-[70px]">Total</TableHead>
              <TableHead className="text-center min-w-[100px]">
                Expiration
              </TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredOrders.map((order) => (
              <TableRow
                key={order.id}
                className="hover:bg-muted/50 transition-colors"
              >
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
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          order.side === "BUY" ? "bg-emerald-500" : "bg-red-500"
                        }`}
                        style={{
                          width: `${(order.filledSize / order.size) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {order.filledSize.toFixed(1)} / {order.size.toFixed(1)}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(order.size * order.price)}
                </TableCell>
                <TableCell className="text-center text-sm text-muted-foreground">
                  {order.expiration && order.expiration !== "0"
                    ? new Date(
                        parseInt(order.expiration, 10) * 1000,
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
                    {cancellingOrderId === order.id ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
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
  pnl?: number,
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
    t.market.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (filteredTrades.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No trading history"
        description={
          searchQuery
            ? "Try a different search term"
            : "Your trades, deposits, and withdrawals will appear here once you start trading"
        }
        action={
          !searchQuery ? { label: "Start Trading", href: "/" } : undefined
        }
      />
    );
  }

  return (
    <>
      {/* Mobile Card View */}
      <div className="md:hidden space-y-3 p-4">
        {filteredTrades.map((trade) => {
          const activityInfo = getActivityInfo(
            trade.type,
            trade.side,
            trade.usdcAmount,
          );
          const ActivityIcon = activityInfo.icon;
          const isBuy = trade.side === "BUY";
          const isRedeem = trade.type === "REDEEM";

          return (
            <motion.div
              key={trade.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-background border border-border rounded-xl p-4"
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${activityInfo.color}`}
                >
                  <ActivityIcon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm">
                        {activityInfo.label}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {timeAgo(trade.timestamp)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p
                        className={`font-semibold ${
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
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                    <div className="relative w-8 h-8 rounded-lg overflow-hidden bg-muted shrink-0">
                      {trade.market.icon ? (
                        <Image
                          src={trade.market.icon}
                          alt={trade.market.title}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{trade.market.title}</p>
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
                          <span className="mx-1">·</span>
                          {trade.size.toFixed(1)} shares
                        </p>
                      )}
                    </div>
                    <a
                      href={`https://polygonscan.com/tx/${trade.transactionHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-b">
              <TableHead className="w-[120px] min-w-[100px]">
                Activity
              </TableHead>
              <TableHead className="min-w-[200px]">Market</TableHead>
              <TableHead className="text-right w-[100px] min-w-[80px]">
                Value
              </TableHead>
              <TableHead className="text-right w-[120px] min-w-[100px]">
                Time
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTrades.map((trade) => {
              const activityInfo = getActivityInfo(
                trade.type,
                trade.side,
                trade.usdcAmount,
              );
              const ActivityIcon = activityInfo.icon;
              const isBuy = trade.side === "BUY";
              const isRedeem = trade.type === "REDEEM";

              return (
                <TableRow
                  key={trade.id}
                  className="hover:bg-muted/50 transition-colors"
                >
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
      </div>
    </>
  );
}

// ============================================================================
// Stats Card - Enhanced
// ============================================================================

function StatCard({
  label,
  value,
  isLoading,
  valueClassName,
  trend,
  isHighlighted = false,
  icon: Icon,
}: {
  label: string;
  value: string;
  isLoading?: boolean;
  valueClassName?: string;
  trend?: { value: number; isPositive: boolean };
  isHighlighted?: boolean;
  icon?: React.ElementType;
}) {
  return (
    <div
      className={`rounded-xl p-4 border transition-all ${
        isHighlighted
          ? "bg-linear-to-br from-violet-500/10 via-fuchsia-500/5 to-background border-violet-500/20 col-span-2 md:col-span-1"
          : "bg-card border-border"
      }`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs text-muted-foreground">{label}</p>
        {Icon && (
          <div
            className={`p-1 rounded-md ${
              isHighlighted ? "bg-violet-500/10" : "bg-muted"
            }`}
          >
            <Icon
              className={`h-3.5 w-3.5 ${
                isHighlighted ? "text-violet-500" : "text-muted-foreground"
              }`}
            />
          </div>
        )}
      </div>
      {isLoading ? (
        <Skeleton className="h-7 w-24" />
      ) : (
        <div className="flex items-baseline gap-2">
          <p
            className={`text-xl sm:text-2xl font-bold ${valueClassName || ""}`}
          >
            {value}
          </p>
          {trend && (
            <span
              className={`text-xs font-medium flex items-center gap-0.5 px-1.5 py-0.5 rounded-full ${
                trend.isPositive
                  ? "text-emerald-500 bg-emerald-500/10"
                  : "text-red-500 bg-red-500/10"
              }`}
            >
              {trend.isPositive ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : (
                <ArrowDownRight className="h-3 w-3" />
              )}
              {formatPercent(Math.abs(trend.value))}
            </span>
          )}
        </div>
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
  const [showDepositModal, setShowDepositModal] = useState(false);

  // Sorting & Filtering state
  const [sortField, setSortField] = useState<SortField>("value");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [pnlFilter, setPnlFilter] = useState<PnLFilter>("all");

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

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  // Computed values
  const openPositionsValue = positionsData?.summary.totalValue ?? 0;
  const cashBalance = proxyUsdcBalance ?? 0;
  const portfolioValue = openPositionsValue + cashBalance;
  const totalPnl = userDetailsData?.details?.pnl || pnlData?.pnl.total || 0;
  // Calculate total invested from positions
  const totalInvested = useMemo(() => {
    return (
      positionsData?.positions?.reduce((sum, p) => sum + p.initialValue, 0) ?? 0
    );
  }, [positionsData?.positions]);
  const pnlPercent = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

  // Not connected state
  if (!isConnected) {
    return (
      <div className="min-h-screen bg-linear-to-b from-slate-50 via-white to-slate-50 dark:from-background dark:via-background dark:to-background relative overflow-x-hidden selection:bg-purple-500/30">
        <PageBackground />

        <Navbar />
        <main className="relative z-10 container max-w-5xl mx-auto px-4 py-12">
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
    <div className="min-h-screen bg-linear-to-b from-slate-50 via-white to-slate-50 dark:from-background dark:via-background dark:to-background relative overflow-x-hidden selection:bg-purple-500/30">
      <PageBackground />

      <Navbar />
      <motion.main
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="relative z-10 container max-w-5xl mx-auto px-4 py-6"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold">Portfolio</h1>
            {proxyAddress && (
              <button
                type="button"
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
          <div className="flex items-center gap-2">
            {hasProxyWallet && proxyAddress && (
              <Button
                onClick={() => setShowDepositModal(true)}
                size="sm"
                className="bg-linear-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-sm shadow-emerald-500/25"
              >
                <ArrowDownToLine className="h-4 w-4 mr-1.5" />
                <span className="hidden sm:inline">Deposit</span>
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard
            label="Portfolio Value"
            value={formatCurrency(portfolioValue)}
            isLoading={loadingPositions || isProxyLoading}
            isHighlighted={true}
            icon={Wallet}
          />
          <StatCard
            label="Open Positions"
            value={formatCurrency(openPositionsValue)}
            isLoading={loadingPositions}
            icon={LayoutGrid}
          />
          <StatCard
            label="Cash Balance"
            value={formatCurrency(cashBalance)}
            isLoading={isProxyLoading}
            icon={BarChart3}
          />
          <StatCard
            label="Total P&L"
            value={formatCurrency(totalPnl, true)}
            isLoading={loadingPnl || loadingUserDetails}
            valueClassName={totalPnl >= 0 ? "text-emerald-500" : "text-red-500"}
            trend={
              totalInvested > 0
                ? { value: pnlPercent, isPositive: totalPnl >= 0 }
                : undefined
            }
            icon={TrendingUp}
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

          {/* Search Bar with Filters */}
          <div className="p-4 border-b border-border">
            <SearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder={`Search ${
                activeTab === "positions"
                  ? "markets"
                  : activeTab === "orders"
                    ? "orders"
                    : "history"
              }...`}
              pnlFilter={pnlFilter}
              onPnlFilterChange={setPnlFilter}
              showFilter={activeTab === "positions"}
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
                  pnlFilter={pnlFilter}
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
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

      {/* Deposit Modal */}
      <DepositModal
        open={showDepositModal}
        onOpenChange={setShowDepositModal}
      />
    </div>
  );
}
