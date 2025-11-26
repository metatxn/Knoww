"use client";

import { motion } from "framer-motion";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ExternalLink,
  Filter,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Trade } from "@/hooks/use-user-trades";

/**
 * Props for the TradeHistory component
 */
export interface TradeHistoryProps {
  /** Array of trades to display */
  trades: Trade[];
  /** Whether data is loading */
  isLoading?: boolean;
  /** Callback when filter changes */
  onFilterChange?: (filter: TradeFilter) => void;
}

/**
 * Trade filter options
 */
export interface TradeFilter {
  type?: "TRADE" | "REDEEM" | "ALL";
  side?: "BUY" | "SELL" | "ALL";
  dateRange?: "1d" | "7d" | "30d" | "all";
}

/**
 * Format date for display
 */
function formatDate(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Format currency value
 */
function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1000) {
    return `$${(value / 1000).toFixed(2)}K`;
  }
  return `$${value.toFixed(2)}`;
}

/**
 * TradeHistory Component
 *
 * Displays a sortable table of user trades with filtering options.
 */
export function TradeHistory({
  trades,
  isLoading = false,
  onFilterChange,
}: TradeHistoryProps) {
  const [filter, setFilter] = useState<TradeFilter>({
    type: "ALL",
    side: "ALL",
    dateRange: "all",
  });

  const handleFilterChange = (key: keyof TradeFilter, value: string) => {
    const newFilter = { ...filter, [key]: value };
    setFilter(newFilter);
    onFilterChange?.(newFilter);
  };

  // Filter trades based on current filter
  const filteredTrades = trades.filter((trade) => {
    if (filter.type !== "ALL" && trade.type !== filter.type) return false;
    if (filter.side !== "ALL" && trade.side !== filter.side) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filters:</span>
        </div>

        <Select
          value={filter.side}
          onValueChange={(value) => handleFilterChange("side", value)}
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Side" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Sides</SelectItem>
            <SelectItem value="BUY">Buy</SelectItem>
            <SelectItem value="SELL">Sell</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filter.type}
          onValueChange={(value) => handleFilterChange("type", value)}
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Types</SelectItem>
            <SelectItem value="TRADE">Trades</SelectItem>
            <SelectItem value="REDEEM">Redeems</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filter.dateRange}
          onValueChange={(value) => handleFilterChange("dateRange", value)}
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Date" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="1d">Last 24h</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Market</TableHead>
              <TableHead>Side</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Size</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              // Loading skeleton
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  <TableCell>
                    <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 w-12 bg-muted animate-pulse rounded" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 w-16 bg-muted animate-pulse rounded ml-auto" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 w-12 bg-muted animate-pulse rounded ml-auto" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 w-16 bg-muted animate-pulse rounded ml-auto" />
                  </TableCell>
                  <TableCell />
                </TableRow>
              ))
            ) : filteredTrades.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <p className="text-muted-foreground">No trades found</p>
                </TableCell>
              </TableRow>
            ) : (
              filteredTrades.map((trade, index) => (
                <motion.tr
                  key={trade.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.02 }}
                  className="border-b transition-colors hover:bg-muted/50"
                >
                  <TableCell className="font-medium">
                    {formatDate(trade.timestamp)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {trade.market.icon && (
                        <div className="relative w-6 h-6 shrink-0 rounded overflow-hidden">
                          <Image
                            src={trade.market.icon}
                            alt={trade.market.title}
                            fill
                            className="object-cover"
                          />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-sm truncate max-w-[200px]">
                          {trade.outcome}
                        </div>
                        <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {trade.market.title}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${
                        trade.side === "BUY"
                          ? "bg-green-500/20 text-green-600 dark:text-green-400"
                          : "bg-red-500/20 text-red-600 dark:text-red-400"
                      }`}
                    >
                      {trade.side === "BUY" ? (
                        <ArrowDownLeft className="h-3 w-3" />
                      ) : (
                        <ArrowUpRight className="h-3 w-3" />
                      )}
                      {trade.side}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {(trade.price * 100).toFixed(1)}¢
                  </TableCell>
                  <TableCell className="text-right">
                    {trade.size.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(trade.usdcAmount)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      asChild
                    >
                      <Link
                        href={`https://polygonscan.com/tx/${trade.transactionHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </Button>
                  </TableCell>
                </motion.tr>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Summary */}
      {filteredTrades.length > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Showing {filteredTrades.length} trades</span>
          <span>
            Total Volume:{" "}
            {formatCurrency(
              filteredTrades.reduce((sum, t) => sum + t.usdcAmount, 0),
            )}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Compact trade list for sidebar or summary views
 */
export function TradeHistoryCompact({ trades }: { trades: Trade[] }) {
  return (
    <div className="space-y-2">
      {trades.slice(0, 5).map((trade) => (
        <div
          key={trade.id}
          className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                trade.side === "BUY" ? "bg-green-500" : "bg-red-500"
              }`}
            />
            <div className="min-w-0">
              <div className="text-sm font-medium truncate max-w-[150px]">
                {trade.outcome}
              </div>
              <div className="text-xs text-muted-foreground">
                {formatDate(trade.timestamp)}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-medium">
              {formatCurrency(trade.usdcAmount)}
            </div>
            <div className="text-xs text-muted-foreground">
              {trade.size.toFixed(2)} @ {(trade.price * 100).toFixed(1)}¢
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
