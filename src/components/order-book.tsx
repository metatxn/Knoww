"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { RefreshCw } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Order book level representing a price point with size
 */
interface OrderBookLevel {
  price: string;
  size: string;
}

/**
 * Order book data structure
 */
interface OrderBookData {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  spread?: number;
  midpoint?: number;
}

/**
 * Props for the OrderBook component
 */
export interface OrderBookProps {
  /** Token ID for fetching order book data */
  tokenId: string;
  /** Maximum number of levels to display on each side */
  maxLevels?: number;
  /** Callback when a price level is clicked */
  onPriceClick?: (price: number, side: "BUY" | "SELL") => void;
  /** Polling interval in milliseconds (default: 5000) */
  pollingInterval?: number;
}

/**
 * Fetch order book data from the API
 */
async function fetchOrderBook(tokenId: string): Promise<OrderBookData> {
  const response = await fetch(`/api/markets/orderbook/${tokenId}`);
  if (!response.ok) {
    throw new Error("Failed to fetch order book");
  }
  const data: OrderBookData = await response.json();
  return data;
}

/**
 * Format price as percentage
 */
function formatPrice(price: string | number): string {
  const num = typeof price === "string" ? Number.parseFloat(price) : price;
  return `${(num * 100).toFixed(1)}¢`;
}

/**
 * Format size with K/M suffixes
 */
function formatSize(size: string | number): string {
  const num = typeof size === "string" ? Number.parseFloat(size) : size;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toFixed(0);
}

/**
 * Calculate the maximum size for depth visualization
 */
function calculateMaxSize(levels: OrderBookLevel[]): number {
  return Math.max(...levels.map((l) => Number.parseFloat(l.size)), 1);
}

/**
 * OrderBook Component
 *
 * Displays the current bid/ask order book for a market.
 * Features:
 * - Real-time updates via polling
 * - Depth visualization with bar charts
 * - Click-to-fill price functionality
 * - Spread and midpoint display
 */
export function OrderBook({
  tokenId,
  maxLevels = 10,
  onPriceClick,
  pollingInterval = 5000,
}: OrderBookProps) {
  // Check if tokenId is a valid CLOB token ID (should be a long numeric string)
  const isValidTokenId = Boolean(tokenId && tokenId.length > 10);

  // Fetch order book data with polling
  const {
    data: orderBook,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery<OrderBookData>({
    queryKey: ["orderBook", tokenId],
    queryFn: () => fetchOrderBook(tokenId),
    refetchInterval: pollingInterval,
    staleTime: pollingInterval / 2,
    enabled: isValidTokenId,
  });

  // Show message if token ID is not valid
  if (!isValidTokenId) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Order Book</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground text-sm">
            Order book not available for this market
          </div>
        </CardContent>
      </Card>
    );
  }

  // Process order book data
  const processedData = useMemo(() => {
    if (!orderBook) return null;

    // Sort and limit levels
    const bids = [...(orderBook.bids || [])]
      .sort((a, b) => Number.parseFloat(b.price) - Number.parseFloat(a.price))
      .slice(0, maxLevels);

    const asks = [...(orderBook.asks || [])]
      .sort((a, b) => Number.parseFloat(a.price) - Number.parseFloat(b.price))
      .slice(0, maxLevels);

    // Calculate spread and midpoint
    const bestBid = bids[0] ? Number.parseFloat(bids[0].price) : 0;
    const bestAsk = asks[0] ? Number.parseFloat(asks[0].price) : 1;
    const spread = bestAsk - bestBid;
    const midpoint = (bestBid + bestAsk) / 2;

    // Calculate max sizes for depth visualization
    const maxBidSize = calculateMaxSize(bids);
    const maxAskSize = calculateMaxSize(asks);

    return {
      bids,
      asks,
      spread,
      midpoint,
      maxBidSize,
      maxAskSize,
      bestBid,
      bestAsk,
    };
  }, [orderBook, maxLevels]);

  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Order Book</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Array.from({ length: maxLevels }).map((_, i) => (
              <Skeleton key={`ask-skeleton-${i}`} className="h-6 w-full" />
            ))}
            <Skeleton className="h-8 w-full my-2" />
            {Array.from({ length: maxLevels }).map((_, i) => (
              <Skeleton key={`bid-skeleton-${i}`} className="h-6 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Order Book</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <p>Failed to load order book</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => refetch()}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // No data state
  if (!processedData) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Order Book</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            No order book data available
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Order Book</CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw
              className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {/* Header */}
        <div className="grid grid-cols-3 px-4 py-2 text-xs font-medium text-muted-foreground border-b">
          <span>Price</span>
          <span className="text-right">Size</span>
          <span className="text-right">Total</span>
        </div>

        {/* Asks (Sells) - displayed in reverse order */}
        <div className="divide-y divide-border/50">
          {[...processedData.asks].reverse().map((level, index) => {
            const size = Number.parseFloat(level.size);
            const depthPercent = (size / processedData.maxAskSize) * 100;
            const cumulativeSize = processedData.asks
              .slice(0, processedData.asks.length - index)
              .reduce((sum, l) => sum + Number.parseFloat(l.size), 0);

            return (
              <motion.div
                key={`ask-${level.price}`}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.02 }}
                className="relative grid grid-cols-3 px-4 py-1.5 text-sm cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() =>
                  onPriceClick?.(Number.parseFloat(level.price), "SELL")
                }
              >
                {/* Depth bar */}
                <div
                  className="absolute right-0 top-0 bottom-0 bg-red-500/10"
                  style={{ width: `${depthPercent}%` }}
                />
                <span className="relative text-red-500 font-medium">
                  {formatPrice(level.price)}
                </span>
                <span className="relative text-right">{formatSize(size)}</span>
                <span className="relative text-right text-muted-foreground">
                  {formatSize(cumulativeSize)}
                </span>
              </motion.div>
            );
          })}
        </div>

        {/* Spread indicator */}
        <div className="px-4 py-3 bg-muted/30 border-y">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Spread</span>
            <span className="font-medium">
              {formatPrice(processedData.spread)} (
              {((processedData.spread / processedData.midpoint) * 100).toFixed(
                2,
              )}
              %)
            </span>
          </div>
          <div className="flex items-center justify-between text-xs mt-1">
            <span className="text-muted-foreground">Midpoint</span>
            <span>{formatPrice(processedData.midpoint)}</span>
          </div>
        </div>

        {/* Bids (Buys) */}
        <div className="divide-y divide-border/50">
          {processedData.bids.map((level, index) => {
            const size = Number.parseFloat(level.size);
            const depthPercent = (size / processedData.maxBidSize) * 100;
            const cumulativeSize = processedData.bids
              .slice(0, index + 1)
              .reduce((sum, l) => sum + Number.parseFloat(l.size), 0);

            return (
              <motion.div
                key={`bid-${level.price}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.02 }}
                className="relative grid grid-cols-3 px-4 py-1.5 text-sm cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() =>
                  onPriceClick?.(Number.parseFloat(level.price), "BUY")
                }
              >
                {/* Depth bar */}
                <div
                  className="absolute left-0 top-0 bottom-0 bg-green-500/10"
                  style={{ width: `${depthPercent}%` }}
                />
                <span className="relative text-green-500 font-medium">
                  {formatPrice(level.price)}
                </span>
                <span className="relative text-right">{formatSize(size)}</span>
                <span className="relative text-right text-muted-foreground">
                  {formatSize(cumulativeSize)}
                </span>
              </motion.div>
            );
          })}
        </div>

        {/* Empty state for sides */}
        {processedData.bids.length === 0 && processedData.asks.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No orders in the book
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Compact order book for sidebar display
 */
export function OrderBookCompact({
  tokenId,
  onPriceClick,
}: {
  tokenId: string;
  onPriceClick?: (price: number, side: "BUY" | "SELL") => void;
}) {
  const { data: orderBook, isLoading } = useQuery<OrderBookData>({
    queryKey: ["orderBook", tokenId],
    queryFn: () => fetchOrderBook(tokenId),
    refetchInterval: 10000,
    staleTime: 5000,
    enabled: !!tokenId,
  });

  if (isLoading || !orderBook) {
    return (
      <div className="space-y-1">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
      </div>
    );
  }

  const bestBid = orderBook.bids?.[0];
  const bestAsk = orderBook.asks?.[0];

  return (
    <div className="space-y-1">
      {bestAsk && (
        <button
          type="button"
          className="w-full flex justify-between items-center px-2 py-1 rounded hover:bg-muted/50 transition-colors"
          onClick={() =>
            onPriceClick?.(Number.parseFloat(bestAsk.price), "SELL")
          }
        >
          <span className="text-xs text-muted-foreground">Best Ask</span>
          <span className="text-sm font-medium text-red-500">
            {formatPrice(bestAsk.price)}
          </span>
        </button>
      )}
      {bestBid && (
        <button
          type="button"
          className="w-full flex justify-between items-center px-2 py-1 rounded hover:bg-muted/50 transition-colors"
          onClick={() =>
            onPriceClick?.(Number.parseFloat(bestBid.price), "BUY")
          }
        >
          <span className="text-xs text-muted-foreground">Best Bid</span>
          <span className="text-sm font-medium text-green-500">
            {formatPrice(bestBid.price)}
          </span>
        </button>
      )}
    </div>
  );
}
