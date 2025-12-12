"use client";

import { motion } from "framer-motion";
import {
  Bookmark,
  ChevronLeft,
  Clock,
  Copy,
  ChevronDown,
  Share2,
  TrendingUp,
  Trophy,
  Wifi,
} from "lucide-react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { MarketPriceChart } from "@/components/market-price-chart";
import { Navbar } from "@/components/navbar";
import { NegRiskBadge } from "@/components/neg-risk-badge";
import { OrderBook } from "@/components/order-book";
import { OrderBookInline } from "@/components/order-book-summary";
import { type OutcomeData, TradingForm } from "@/components/trading-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEventDetail } from "@/hooks/use-event-detail";
import {
  useOrderBookWebSocket,
  type ConnectionState,
} from "@/hooks/use-shared-websocket";
import {
  useOrderBookStore,
  useOrderBook as useOrderBookFromStore,
  useBestPrices,
} from "@/hooks/use-orderbook-store";
import { cn } from "@/lib/utils";

// Order book response type - defined outside component to avoid hook order issues
interface OrderBookResponse {
  success: boolean;
  tokenID: string;
  orderBook: {
    market: string;
    asset_id: string;
    timestamp: string;
    hash: string;
    bids: Array<{ price: string; size: string }>;
    asks: Array<{ price: string; size: string }>;
    min_order_size: string;
    tick_size: string;
    neg_risk: boolean;
  };
}

export default function EventDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [selectedMarketId, setSelectedMarketId] = useState<string>("");
  const [selectedOutcomeIndex, setSelectedOutcomeIndex] = useState(0);
  // Track which market has its order book expanded (null = none)
  const [expandedOrderBookMarketId, setExpandedOrderBookMarketId] = useState<
    string | null
  >(null);
  const [showClosedMarkets, setShowClosedMarkets] = useState(false);

  // Order book store action for preloading from REST
  const { setOrderBookFromRest } = useOrderBookStore();

  // Helper to quickly seed order book from REST (direct Polymarket call) for a token
  const preloadOrderBook = useCallback(
    async (tokenId: string | undefined) => {
      if (!tokenId) return;
      try {
        const res = await fetch(
          `https://clob.polymarket.com/book?token_id=${tokenId}`,
          { headers: { Accept: "application/json" } }
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          bids?: Array<{ price: string; size: string }>;
          asks?: Array<{ price: string; size: string }>;
        };
        setOrderBookFromRest(tokenId, data.bids || [], data.asks || []);
      } catch (err) {
        console.error("Preload order book failed", err);
      }
    },
    [setOrderBookFromRest]
  );

  const eventId = params?.id as string;
  const { data: event, isLoading: loading, error } = useEventDetail(eventId);

  // Handle order success
  const handleOrderSuccess = useCallback((_order: unknown) => {
    // console.log("Order placed successfully:", order);
  }, []);

  // Handle order error
  const handleOrderError = useCallback((_error: Error) => {
    // console.error("Order failed:", error);
  }, []);

  // Handle price click from order book
  const handlePriceClick = useCallback((_price: number) => {
    // console.log("Price clicked:", price);
  }, []);

  // Compute markets safely (even when event is null/undefined)
  const allMarkets = useMemo(() => {
    if (!event?.markets) return [];
    // Keep inactive markets hidden from UI
    return event.markets.filter((market) => market.active !== false);
  }, [event?.markets]);

  const openMarkets = useMemo(
    () => allMarkets.filter((m) => m.closed !== true),
    [allMarkets]
  );

  const closedMarkets = useMemo(
    () => allMarkets.filter((m) => m.closed === true),
    [allMarkets]
  );

  // Closed market rows (precomputed; used later in the dropdown)
  const closedMarketData = useMemo(() => {
    return closedMarkets
      .map((market, idx) => {
        const outcomes = market.outcomes ? JSON.parse(market.outcomes) : [];
        const prices = market.outcomePrices
          ? JSON.parse(market.outcomePrices)
          : [];
        const tokens = market.tokens || [];
        const clobTokenIds = market.clobTokenIds
          ? JSON.parse(market.clobTokenIds)
          : [];

        const yesIndex = outcomes.findIndex((o: string) =>
          o.toLowerCase().includes("yes")
        );
        const noIndex = outcomes.findIndex((o: string) =>
          o.toLowerCase().includes("no")
        );

        const yesPrice = yesIndex !== -1 ? prices[yesIndex] : prices[0];
        const noPrice = noIndex !== -1 ? prices[noIndex] : prices[1];

        let yesTokenId = "";
        let noTokenId = "";

        if (tokens.length > 0) {
          const yesToken = tokens.find(
            (t) => t.outcome?.toLowerCase() === "yes"
          );
          const noToken = tokens.find((t) => t.outcome?.toLowerCase() === "no");
          yesTokenId = yesToken?.token_id || "";
          noTokenId = noToken?.token_id || "";
        } else if (clobTokenIds.length > 0) {
          yesTokenId =
            yesIndex !== -1 ? clobTokenIds[yesIndex] : clobTokenIds[0];
          noTokenId = noIndex !== -1 ? clobTokenIds[noIndex] : clobTokenIds[1];
        }

        const yesProbability = yesPrice
          ? Number.parseFloat((Number.parseFloat(yesPrice) * 100).toFixed(0))
          : 0;
        const change = ((Math.random() - 0.5) * 10).toFixed(1);
        const colors = ["orange", "blue", "purple", "green"];

        return {
          id: market.id,
          question: market.question,
          groupItemTitle: market.groupItemTitle || market.question,
          yesProbability,
          yesPrice: yesPrice || "0",
          noPrice: noPrice || "0",
          yesTokenId: yesTokenId || "",
          noTokenId: noTokenId || "",
          negRisk: market.negRisk || false,
          change: Number.parseFloat(change),
          volume: market.volume || "0",
          color: colors[idx % colors.length],
          image: market.image,
          closed: true,
        };
      })
      .sort((a, b) => b.yesProbability - a.yesProbability);
  }, [closedMarkets]);

  // "Single outcome" in this UI means: the event only has ONE market.
  // If there are multiple markets under the event, we only show order books when a user expands a specific market row.
  const totalMarketsCount = event?.markets?.length ?? 0;
  const isSingleMarketEvent = totalMarketsCount === 1;

  // Compute selected market and trading outcomes
  const { selectedMarket, tradingOutcomes, currentTokenId, allTokenIds } =
    useMemo(() => {
      if (!event || openMarkets.length === 0) {
        return {
          selectedMarket: null,
          tradingOutcomes: [] as OutcomeData[],
          currentTokenId: "",
          allTokenIds: [] as string[],
        };
      }

      // Build market data
      const marketData = openMarkets.map((market, idx) => {
        const outcomes = market.outcomes ? JSON.parse(market.outcomes) : [];
        const prices = market.outcomePrices
          ? JSON.parse(market.outcomePrices)
          : [];
        const tokens = market.tokens || [];
        const clobTokenIds = market.clobTokenIds
          ? JSON.parse(market.clobTokenIds)
          : [];

        const yesIndex = outcomes.findIndex((o: string) =>
          o.toLowerCase().includes("yes")
        );
        const noIndex = outcomes.findIndex((o: string) =>
          o.toLowerCase().includes("no")
        );

        const yesPrice = yesIndex !== -1 ? prices[yesIndex] : prices[0];
        const noPrice = noIndex !== -1 ? prices[noIndex] : prices[1];

        let yesTokenId = "";
        let noTokenId = "";

        if (tokens.length > 0) {
          const yesToken = tokens.find(
            (t) => t.outcome?.toLowerCase() === "yes"
          );
          const noToken = tokens.find((t) => t.outcome?.toLowerCase() === "no");
          yesTokenId = yesToken?.token_id || "";
          noTokenId = noToken?.token_id || "";
        } else if (clobTokenIds.length > 0) {
          yesTokenId =
            yesIndex !== -1 ? clobTokenIds[yesIndex] : clobTokenIds[0];
          noTokenId = noIndex !== -1 ? clobTokenIds[noIndex] : clobTokenIds[1];
        }

        const yesProbability = yesPrice
          ? Number.parseFloat((Number.parseFloat(yesPrice) * 100).toFixed(0))
          : 0;
        const change = ((Math.random() - 0.5) * 10).toFixed(1);
        const colors = ["orange", "blue", "purple", "green"];

        return {
          id: market.id,
          question: market.question,
          groupItemTitle: market.groupItemTitle || market.question,
          yesProbability,
          yesPrice: yesPrice || "0",
          noPrice: noPrice || "0",
          yesTokenId: yesTokenId || "",
          noTokenId: noTokenId || "",
          negRisk: market.negRisk || false,
          change: Number.parseFloat(change),
          volume: market.volume || "0",
          color: colors[idx % colors.length],
          image: market.image,
        };
      });

      const sortedMarketData = [...marketData].sort(
        (a, b) => b.yesProbability - a.yesProbability
      );

      const selected =
        sortedMarketData.find((m) => m.id === selectedMarketId) ||
        sortedMarketData[0];

      // Build trading outcomes
      const outcomes: OutcomeData[] = selected
        ? [
            {
              name: "Yes",
              tokenId: selected.yesTokenId,
              price: Number.parseFloat(selected.yesPrice) || 0.5,
              probability: (Number.parseFloat(selected.yesPrice) || 0.5) * 100,
            },
            {
              name: "No",
              tokenId: selected.noTokenId,
              price: Number.parseFloat(selected.noPrice) || 0.5,
              probability: (Number.parseFloat(selected.noPrice) || 0.5) * 100,
            },
          ]
        : [];

      const tokenId = outcomes[selectedOutcomeIndex]?.tokenId || "";

      // Collect all valid token IDs for WebSocket subscription
      const tokenIds = marketData
        .flatMap((m) => [m.yesTokenId, m.noTokenId])
        .filter(Boolean);

      return {
        selectedMarket: selected,
        tradingOutcomes: outcomes,
        currentTokenId: tokenId,
        allTokenIds: tokenIds,
      };
    }, [event, openMarkets, selectedMarketId, selectedOutcomeIndex]);

  // Auto-expand the order book upfront when the event has exactly one market.
  useEffect(() => {
    if (!isSingleMarketEvent) return;
    const onlyMarketId = openMarkets[0]?.id;
    if (!onlyMarketId) return;

    setSelectedMarketId((prev) => prev || onlyMarketId);
    setExpandedOrderBookMarketId((prev) => prev ?? onlyMarketId);

    // Preload both sides so the order book renders immediately once expanded.
    if (selectedMarket) {
      void preloadOrderBook(selectedMarket.yesTokenId);
      void preloadOrderBook(selectedMarket.noTokenId);
    }
  }, [isSingleMarketEvent, openMarkets, preloadOrderBook, selectedMarket]);

  // ARCHITECTURE: REST first, then WebSocket for real-time updates
  // This is how Binance, Coinbase, and Polymarket work

  // STEP 1: Fetch initial order book snapshot directly from Polymarket CLOB API
  // Direct fetch is faster than going through our Next.js API route
  const { data: orderBookData } = useQuery<OrderBookResponse | null>({
    queryKey: ["orderBook", currentTokenId],
    queryFn: async (): Promise<OrderBookResponse | null> => {
      if (!currentTokenId) return null;
      // Direct call to Polymarket CLOB API (public, allows CORS)
      const response = await fetch(
        `https://clob.polymarket.com/book?token_id=${currentTokenId}`,
        { headers: { Accept: "application/json" } }
      );
      if (!response.ok) return null;
      const data = (await response.json()) as {
        market?: string;
        asset_id?: string;
        timestamp?: string;
        hash?: string;
        bids?: Array<{ price: string; size: string }>;
        asks?: Array<{ price: string; size: string }>;
        min_order_size?: string;
        tick_size?: string;
        neg_risk?: boolean;
      };
      // Wrap in our expected format
      return {
        success: true,
        tokenID: currentTokenId,
        orderBook: {
          market: data.market || "",
          asset_id: data.asset_id || currentTokenId,
          timestamp: data.timestamp || "",
          hash: data.hash || "",
          bids: data.bids || [],
          asks: data.asks || [],
          min_order_size: data.min_order_size || "1",
          tick_size: data.tick_size || "0.01",
          neg_risk: data.neg_risk || false,
        },
      };
    },
    enabled: !!currentTokenId,
    staleTime: 30000, // Consider fresh for 30s (WebSocket will update)
  });

  // STEP 2: Seed the store with REST data when it arrives
  useEffect(() => {
    if (orderBookData?.orderBook && currentTokenId) {
      setOrderBookFromRest(
        currentTokenId,
        orderBookData.orderBook.bids || [],
        orderBookData.orderBook.asks || []
      );
    }
  }, [orderBookData, currentTokenId, setOrderBookFromRest]);

  // STEP 3: Connect to shared WebSocket for real-time incremental updates
  // Uses singleton WebSocket manager - only ONE connection for all components
  const { connectionState, isConnected } = useOrderBookWebSocket(allTokenIds);

  // Get order book from store (seeded by REST, updated by WebSocket)
  const storeOrderBook = useOrderBookFromStore(currentTokenId);
  const wsBestPrices = useBestPrices(currentTokenId);

  // Extract best bid, ask, tick_size, min_order_size, and full order book for slippage
  // Store has merged REST + WebSocket data
  const { bestBid, bestAsk, tickSize, minOrderSize, orderBook } =
    useMemo(() => {
      // Use store data (seeded by REST, updated by WebSocket)
      if (storeOrderBook) {
        return {
          bestBid: storeOrderBook.bestBid ?? undefined,
          bestAsk: storeOrderBook.bestAsk ?? undefined,
          tickSize: 0.01, // Default tick size
          minOrderSize: 1, // Default min order size
          orderBook: {
            bids: storeOrderBook.bids,
            asks: storeOrderBook.asks,
          },
        };
      }

      // Fall back to raw REST API data if store is empty
      if (!orderBookData?.orderBook) {
        return {
          bestBid: undefined,
          bestAsk: undefined,
          tickSize: 0.01,
          minOrderSize: 1,
          orderBook: undefined,
        };
      }

      const ob = orderBookData.orderBook;
      const bids = ob.bids || [];
      const asks = ob.asks || [];

      const sortedBids = [...bids].sort(
        (a, b) => Number.parseFloat(b.price) - Number.parseFloat(a.price)
      );
      const sortedAsks = [...asks].sort(
        (a, b) => Number.parseFloat(a.price) - Number.parseFloat(b.price)
      );

      const bestBidLevel = sortedBids.length > 0 ? sortedBids[0] : null;
      const bestAskLevel = sortedAsks.length > 0 ? sortedAsks[0] : null;

      const tickSizeValue = ob.tick_size
        ? Number.parseFloat(ob.tick_size)
        : 0.01;
      const minOrderSizeValue = ob.min_order_size
        ? Number.parseFloat(ob.min_order_size)
        : 1;

      return {
        bestBid: bestBidLevel
          ? Number.parseFloat(bestBidLevel.price)
          : undefined,
        bestAsk: bestAskLevel
          ? Number.parseFloat(bestAskLevel.price)
          : undefined,
        tickSize: tickSizeValue,
        minOrderSize: minOrderSizeValue,
        orderBook: { bids, asks },
      };
    }, [storeOrderBook, orderBookData]);

  // Loading state - AFTER all hooks
  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="px-4 md:px-6 lg:px-8 py-8 space-y-8">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-96 w-full" />
        </main>
      </div>
    );
  }

  // Error state - AFTER all hooks
  if (error || !event) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="px-4 md:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="flex items-center gap-1 hover:text-foreground transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>All Markets</span>
            </button>
          </div>
          <Card className="text-center py-12">
            <CardHeader>
              <CardTitle>Event Not Found</CardTitle>
            </CardHeader>
            <Button onClick={() => router.push("/")}>
              <ChevronLeft className="mr-2 h-4 w-4" />
              Back to Markets
            </Button>
          </Card>
        </main>
      </div>
    );
  }

  const formatVolume = (vol?: number | string) => {
    if (!vol) return "N/A";
    const num = typeof vol === "string" ? Number.parseFloat(vol) : vol;
    if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`;
    return `$${num.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  };

  const formatPrice = (price: string) => {
    const num = Number.parseFloat(price);
    return (num * 100).toFixed(1);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Build market data for display (reuse the computed markets)
  const marketData = openMarkets.map((market, idx) => {
    const outcomes = market.outcomes ? JSON.parse(market.outcomes) : [];
    const prices = market.outcomePrices ? JSON.parse(market.outcomePrices) : [];
    const tokens = market.tokens || [];
    const clobTokenIds = market.clobTokenIds
      ? JSON.parse(market.clobTokenIds)
      : [];

    const yesIndex = outcomes.findIndex((o: string) =>
      o.toLowerCase().includes("yes")
    );
    const noIndex = outcomes.findIndex((o: string) =>
      o.toLowerCase().includes("no")
    );

    const yesPrice = yesIndex !== -1 ? prices[yesIndex] : prices[0];
    const noPrice = noIndex !== -1 ? prices[noIndex] : prices[1];

    let yesTokenId = "";
    let noTokenId = "";

    if (tokens.length > 0) {
      const yesToken = tokens.find((t) => t.outcome?.toLowerCase() === "yes");
      const noToken = tokens.find((t) => t.outcome?.toLowerCase() === "no");
      yesTokenId = yesToken?.token_id || "";
      noTokenId = noToken?.token_id || "";
    } else if (clobTokenIds.length > 0) {
      yesTokenId = yesIndex !== -1 ? clobTokenIds[yesIndex] : clobTokenIds[0];
      noTokenId = noIndex !== -1 ? clobTokenIds[noIndex] : clobTokenIds[1];
    }

    const yesProbability = yesPrice
      ? Number.parseFloat((Number.parseFloat(yesPrice) * 100).toFixed(0))
      : 0;
    const change = ((Math.random() - 0.5) * 10).toFixed(1);
    const colors = ["orange", "blue", "purple", "green"];

    return {
      id: market.id,
      question: market.question,
      groupItemTitle: market.groupItemTitle || market.question,
      yesProbability,
      yesPrice: yesPrice || "0",
      noPrice: noPrice || "0",
      yesTokenId: yesTokenId || "",
      noTokenId: noTokenId || "",
      negRisk: market.negRisk || false,
      change: Number.parseFloat(change),
      volume: market.volume || "0",
      color: colors[idx % colors.length],
      image: market.image,
    };
  });

  const sortedMarketData = [...marketData].sort(
    (a, b) => b.yesProbability - a.yesProbability
  );

  // Chart behavior:
  // - If the event has ONE market, show BOTH Yes + No on the main chart.
  // - If the event has multiple markets, show top 4 markets (Yes) like before.
  const topMarketsForChart = isSingleMarketEvent
    ? sortedMarketData.slice(0, 1)
    : sortedMarketData.slice(0, 4);

  const singleMarketForChart = topMarketsForChart[0];

  const chartColors = [
    "hsl(25, 95%, 53%)", // Orange
    "hsl(221, 83%, 53%)", // Blue
    "hsl(280, 100%, 70%)", // Purple/Pink
    "hsl(142, 76%, 36%)", // Green
  ];

  const marketTitles = isSingleMarketEvent
    ? ["Yes", "No"]
    : topMarketsForChart.map((m) => m.groupItemTitle);

  const yesProb = isSingleMarketEvent
    ? [
        singleMarketForChart?.yesPrice || "0",
        singleMarketForChart?.noPrice || "0",
      ]
    : topMarketsForChart.map((m) => m.yesPrice);

  const chartTokens = isSingleMarketEvent
    ? [
        {
          tokenId: singleMarketForChart?.yesTokenId || "",
          name: "Yes",
          color: "hsl(142, 76%, 36%)", // Green
        },
        {
          tokenId: singleMarketForChart?.noTokenId || "",
          name: "No",
          color: "hsl(0, 84%, 60%)", // Red
        },
      ]
    : topMarketsForChart.map((m, idx) => ({
        tokenId: m.yesTokenId,
        name: m.groupItemTitle,
        color: chartColors[idx % chartColors.length],
      }));

  // Find the earliest createdAt from all markets or use event createdAt
  const earliestCreatedAt = openMarkets.reduce<string | undefined>(
    (earliest, market) => {
      if (!market.createdAt) return earliest;
      if (!earliest) return market.createdAt;
      return new Date(market.createdAt) < new Date(earliest)
        ? market.createdAt
        : earliest;
    },
    event.createdAt
  );

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <motion.main
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="px-4 md:px-6 lg:px-8 py-6 space-y-6"
      >
        {/* Breadcrumb Navigation */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>All Markets</span>
          </button>
          <span>/</span>
          <span className="text-foreground font-medium truncate max-w-[200px] sm:max-w-none">
            {event.title}
          </span>
        </div>

        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-4 flex-1">
            {event.image && (
              <div className="relative w-16 h-16 md:w-20 md:h-20 shrink-0">
                <Image
                  src={event.image}
                  alt={event.title}
                  fill
                  sizes="80px"
                  className="rounded-xl object-cover"
                />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <h1 className="text-2xl md:text-3xl font-bold">
                  {event.title}
                </h1>
                {event.negRisk && <NegRiskBadge />}
              </div>

              <div className="flex flex-wrap items-center gap-3 md:gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5 bg-muted/50 px-2.5 py-1 rounded-full">
                  <Trophy className="h-4 w-4" />
                  <span className="font-medium">
                    {formatVolume(event.volume)} Vol.
                  </span>
                </div>
                {event.endDate && (
                  <div className="flex items-center gap-1.5 bg-muted/50 px-2.5 py-1 rounded-full">
                    <Clock className="h-4 w-4" />
                    <span>
                      {new Date(event.endDate).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 bg-muted/50 px-2.5 py-1 rounded-full">
                  <span className="font-medium">
                    {totalMarketsCount} markets
                  </span>
                </div>
                {closedMarkets.length > 0 && (
                  <div className="flex items-center gap-1.5 bg-muted/50 px-2.5 py-1 rounded-full">
                    <span className="font-medium">
                      {openMarkets.length} open • {closedMarkets.length} closed
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={async () => {
                if (typeof window !== "undefined" && navigator.share) {
                  try {
                    await navigator.share({
                      title: event.title,
                      url: window.location.href,
                    });
                  } catch (err) {
                    // User cancelled or share failed - ignore
                    if ((err as Error).name !== "AbortError") {
                      console.error("Share failed:", err);
                    }
                  }
                }
              }}
            >
              <Share2 className="h-4 w-4" />
              <span className="hidden sm:inline">Share</span>
            </Button>
            <Button type="button" variant="outline" size="sm" className="gap-2">
              <Bookmark className="h-4 w-4" />
              <span className="hidden sm:inline">Save</span>
            </Button>
          </div>
        </div>

        {/* Main Content: Chart + Trading Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Left Column: Chart + Outcomes Table */}
          <div className="lg:col-span-2 space-y-4 sm:space-y-6">
            {/* Chart */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap gap-2 md:gap-4">
                  {isSingleMarketEvent && singleMarketForChart ? (
                    <>
                      <div className="flex items-center gap-1.5 md:gap-2">
                        <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full shrink-0 bg-green-500" />
                        <span className="text-xs md:text-sm">
                          Yes {singleMarketForChart.yesProbability}%
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 md:gap-2">
                        <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full shrink-0 bg-red-500" />
                        <span className="text-xs md:text-sm">
                          No{" "}
                          {Math.max(
                            0,
                            100 - singleMarketForChart.yesProbability
                          )}
                          %
                        </span>
                      </div>
                    </>
                  ) : (
                    topMarketsForChart.map((market, idx) => (
                      <div
                        key={market.id}
                        className="flex items-center gap-1.5 md:gap-2"
                      >
                        <div
                          className={`w-2.5 h-2.5 md:w-3 md:h-3 rounded-full shrink-0 ${
                            idx === 0
                              ? "bg-orange-500"
                              : idx === 1
                              ? "bg-blue-500"
                              : idx === 2
                              ? "bg-purple-400"
                              : "bg-green-500"
                          }`}
                        />
                        <span className="text-xs md:text-sm truncate max-w-[120px] sm:max-w-[150px] md:max-w-[200px]">
                          {market.groupItemTitle} {market.yesProbability}%
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <MarketPriceChart
                  tokens={chartTokens}
                  outcomes={marketTitles}
                  outcomePrices={yesProb}
                  startDate={earliestCreatedAt}
                />
              </CardContent>
            </Card>

            {/* Outcomes Table */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">OUTCOME</CardTitle>
                  {/* WebSocket connection indicator */}
                  <div className="flex items-center gap-1.5">
                    <Wifi
                      className={cn(
                        "h-3.5 w-3.5",
                        isConnected
                          ? "text-emerald-500"
                          : connectionState === "connecting" ||
                            connectionState === "reconnecting"
                          ? "text-amber-500 animate-pulse"
                          : "text-muted-foreground"
                      )}
                    />
                    <span
                      className={cn(
                        "text-[10px]",
                        isConnected
                          ? "text-emerald-500"
                          : connectionState === "connecting" ||
                            connectionState === "reconnecting"
                          ? "text-amber-500"
                          : "text-muted-foreground"
                      )}
                    >
                      {isConnected
                        ? "Live"
                        : connectionState === "connecting"
                        ? "Connecting..."
                        : connectionState === "reconnecting"
                        ? "Reconnecting..."
                        : "Offline"}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-0">
                  {sortedMarketData.map((market) => {
                    const isMarketClosed = false;
                    // Build outcomes for this specific market
                    const marketOutcomes = [
                      {
                        name: "Yes",
                        tokenId: market.yesTokenId,
                        price: Number.parseFloat(market.yesPrice) || 0.5,
                      },
                      {
                        name: "No",
                        tokenId: market.noTokenId,
                        price: Number.parseFloat(market.noPrice) || 0.5,
                      },
                    ];
                    const isExpanded = expandedOrderBookMarketId === market.id;

                    return (
                      <div key={market.id}>
                        {/* Market Row - Clickable to expand/collapse */}
                        {/* biome-ignore lint/a11y/useSemanticElements: Contains interactive buttons */}
                        <div
                          role="button"
                          tabIndex={0}
                          className={cn(
                            "w-full text-left p-3 md:p-4 border-b border-border transition-all cursor-pointer",
                            selectedMarket?.id === market.id
                              ? "bg-primary/5"
                              : "hover:bg-accent/30",
                            isExpanded && "bg-muted/30"
                          )}
                          onClick={() => {
                            // Toggle order book expansion
                            if (isExpanded) {
                              setExpandedOrderBookMarketId(null);
                            } else {
                              setExpandedOrderBookMarketId(market.id);
                              // Only open markets can drive the trading panel selection
                              if (!isMarketClosed) {
                                setSelectedMarketId(market.id);
                              }
                              // Preload both Yes and No order books for this market
                              void preloadOrderBook(market.yesTokenId);
                              void preloadOrderBook(market.noTokenId);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              if (isExpanded) {
                                setExpandedOrderBookMarketId(null);
                              } else {
                                setExpandedOrderBookMarketId(market.id);
                                setSelectedMarketId(market.id);
                              }
                            }
                          }}
                        >
                          {/* Mobile Layout */}
                          <div className="flex flex-col gap-3 md:hidden">
                            {/* Top Row: Image + Title + Percentage */}
                            <div className="flex items-center gap-3">
                              {market.image && (
                                <div className="relative w-10 h-10 shrink-0">
                                  <Image
                                    src={market.image}
                                    alt={market.groupItemTitle || "Market"}
                                    fill
                                    sizes="40px"
                                    className="rounded object-cover"
                                  />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-sm truncate">
                                  {market.groupItemTitle}
                                </h3>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                  <span>
                                    {formatVolume(market.volume)} Vol.
                                  </span>
                                  {market.yesTokenId && (
                                    <OrderBookInline
                                      tokenId={market.yesTokenId}
                                      connectionState={connectionState}
                                      className="hidden sm:flex"
                                    />
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-lg font-bold tabular-nums">
                                  {market.yesProbability}%
                                </span>
                                <div
                                  className={`flex items-center gap-0.5 text-xs ${
                                    market.change >= 0
                                      ? "text-green-500"
                                      : "text-red-500"
                                  }`}
                                >
                                  <TrendingUp
                                    className={`h-3 w-3 ${
                                      market.change < 0 ? "rotate-180" : ""
                                    }`}
                                  />
                                  <span className="tabular-nums">
                                    {market.change >= 0 ? "+" : ""}
                                    {market.change}%
                                  </span>
                                </div>
                              </div>
                            </div>
                            {/* Bottom Row: Yes/No Buttons */}
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                size="sm"
                                className={cn(
                                  "flex-1 h-9 text-xs bg-green-600 hover:bg-green-700 text-white font-medium",
                                  isExpanded &&
                                    selectedOutcomeIndex === 0 &&
                                    "ring-2 ring-green-400"
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedOrderBookMarketId(market.id);
                                  setSelectedMarketId(market.id);
                                  setSelectedOutcomeIndex(0);
                                  void preloadOrderBook(market.yesTokenId);
                                }}
                              >
                                Yes {formatPrice(market.yesPrice)}¢
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                className={cn(
                                  "flex-1 h-9 text-xs font-medium",
                                  isExpanded &&
                                    selectedOutcomeIndex === 1 &&
                                    "ring-2 ring-red-400"
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedOrderBookMarketId(market.id);
                                  setSelectedMarketId(market.id);
                                  setSelectedOutcomeIndex(1);
                                  void preloadOrderBook(market.noTokenId);
                                }}
                              >
                                No {formatPrice(market.noPrice)}¢
                              </Button>
                            </div>
                          </div>

                          {/* Desktop Layout - Grid for proper alignment */}
                          <div className="hidden md:grid md:grid-cols-[1fr_120px_240px] md:items-center md:gap-4">
                            {/* Column 1: Image + Title + Volume */}
                            <div className="flex items-center gap-3 min-w-0">
                              {market.image && (
                                <div className="relative w-10 h-10 shrink-0">
                                  <Image
                                    src={market.image}
                                    alt={market.groupItemTitle || "Market"}
                                    fill
                                    sizes="40px"
                                    className="rounded object-cover"
                                  />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-base truncate">
                                  {market.groupItemTitle}
                                </h3>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
                                  <span>
                                    {formatVolume(market.volume)} Vol.
                                  </span>
                                  {market.yesTokenId && (
                                    <OrderBookInline
                                      tokenId={market.yesTokenId}
                                      connectionState={connectionState}
                                    />
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Column 2: Percentage + Change - Fixed width for alignment */}
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-xl font-bold tabular-nums">
                                {market.yesProbability}%
                              </span>
                              <div
                                className={`flex items-center gap-1 text-sm min-w-[60px] ${
                                  market.change >= 0
                                    ? "text-green-500"
                                    : "text-red-500"
                                }`}
                              >
                                <TrendingUp
                                  className={`h-4 w-4 shrink-0 ${
                                    market.change < 0 ? "rotate-180" : ""
                                  }`}
                                />
                                <span className="tabular-nums">
                                  {market.change >= 0 ? "+" : ""}
                                  {market.change}%
                                </span>
                              </div>
                            </div>

                            {/* Column 3: Yes/No Buttons - Fixed width for alignment */}
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                type="button"
                                size="sm"
                                className={cn(
                                  "w-[110px] h-9 text-sm bg-green-600 hover:bg-green-700 text-white font-medium",
                                  isExpanded &&
                                    selectedOutcomeIndex === 0 &&
                                    "ring-2 ring-green-400"
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedOrderBookMarketId(market.id);
                                  setSelectedMarketId(market.id);
                                  setSelectedOutcomeIndex(0);
                                  void preloadOrderBook(market.yesTokenId);
                                }}
                              >
                                Buy Yes {formatPrice(market.yesPrice)}¢
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                className={cn(
                                  "w-[110px] h-9 text-sm font-medium",
                                  isExpanded &&
                                    selectedOutcomeIndex === 1 &&
                                    "ring-2 ring-red-400"
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedOrderBookMarketId(market.id);
                                  setSelectedMarketId(market.id);
                                  setSelectedOutcomeIndex(1);
                                  void preloadOrderBook(market.noTokenId);
                                }}
                              >
                                Buy No {formatPrice(market.noPrice)}¢
                              </Button>
                            </div>
                          </div>
                        </div>

                        {/* Expanded Content - Order Book, Graph, Resolution Tabs */}
                        <div
                          className={cn(
                            "grid transition-all duration-300 ease-in-out border-b border-border bg-muted/10",
                            isExpanded
                              ? "grid-rows-[1fr] opacity-100"
                              : "grid-rows-[0fr] opacity-0"
                          )}
                        >
                          <div className="overflow-hidden">
                            <Tabs defaultValue="orderbook" className="w-full">
                              <div className="flex items-center justify-between px-4 border-b border-border">
                                <TabsList className="h-auto p-0 bg-transparent gap-0">
                                  <TabsTrigger
                                    value="orderbook"
                                    className="px-4 py-3 rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none text-sm font-medium"
                                  >
                                    Order Book
                                  </TabsTrigger>
                                  <TabsTrigger
                                    value="graph"
                                    className="px-4 py-3 rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none text-sm font-medium"
                                  >
                                    Graph
                                  </TabsTrigger>
                                  <TabsTrigger
                                    value="resolution"
                                    className="px-4 py-3 rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none text-sm font-medium"
                                  >
                                    Resolution
                                  </TabsTrigger>
                                </TabsList>
                                <div className="flex items-center gap-2 text-xs">
                                  <span className="text-muted-foreground">
                                    Rewards
                                  </span>
                                  <span className="text-emerald-500 font-medium">
                                    0.1¢
                                  </span>
                                </div>
                              </div>

                              {/* Order Book Tab - forceMount keeps it mounted */}
                              <TabsContent
                                value="orderbook"
                                className="m-0 data-[state=inactive]:hidden"
                                forceMount
                              >
                                <OrderBook
                                  outcomes={marketOutcomes}
                                  defaultOutcomeIndex={selectedOutcomeIndex}
                                  maxLevels={4}
                                  onPriceClick={handlePriceClick}
                                  onOutcomeChange={(index) =>
                                    setSelectedOutcomeIndex(index)
                                  }
                                  embedded
                                />
                              </TabsContent>

                              {/* Graph Tab - Price history for Yes and No */}
                              <TabsContent value="graph" className="m-0 p-4">
                                <MarketPriceChart
                                  tokens={[
                                    {
                                      tokenId: market.yesTokenId,
                                      name: "Yes",
                                      color: "hsl(142, 76%, 36%)", // green-600
                                    },
                                    {
                                      tokenId: market.noTokenId,
                                      name: "No",
                                      color: "hsl(0, 84%, 60%)", // red-500
                                    },
                                  ]}
                                  outcomes={["Yes", "No"]}
                                  outcomePrices={[
                                    market.yesPrice,
                                    market.noPrice,
                                  ]}
                                />
                              </TabsContent>

                              {/* Resolution Tab */}
                              <TabsContent
                                value="resolution"
                                className="m-0 p-4"
                              >
                                <div className="space-y-4 text-sm">
                                  <div>
                                    <h4 className="font-medium mb-1">
                                      Resolution Source
                                    </h4>
                                    <p className="text-muted-foreground">
                                      Official announcement or verified news
                                      source
                                    </p>
                                  </div>
                                  <div>
                                    <h4 className="font-medium mb-1">
                                      Resolution Rules
                                    </h4>
                                    <p className="text-muted-foreground">
                                      This market will resolve based on the
                                      official outcome as reported by verified
                                      sources.
                                    </p>
                                  </div>
                                </div>
                              </TabsContent>
                            </Tabs>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Closed markets dropdown (only render when user expands) */}
                {closedMarketData.length > 0 && (
                  <div className="pt-2">
                    <Collapsible
                      open={showClosedMarkets}
                      onOpenChange={setShowClosedMarkets}
                    >
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            "w-full flex items-center justify-between px-3 md:px-4 py-3 text-sm font-medium border-t border-border hover:bg-accent/30 transition-colors"
                          )}
                        >
                          <span>
                            Closed markets ({closedMarketData.length})
                          </span>
                          <ChevronDown
                            className={cn(
                              "h-4 w-4 transition-transform",
                              showClosedMarkets && "rotate-180"
                            )}
                          />
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="space-y-0">
                          {closedMarketData.map((market) => {
                            const marketOutcomes = [
                              {
                                name: "Yes",
                                tokenId: market.yesTokenId,
                                price:
                                  Number.parseFloat(market.yesPrice) || 0.5,
                              },
                              {
                                name: "No",
                                tokenId: market.noTokenId,
                                price: Number.parseFloat(market.noPrice) || 0.5,
                              },
                            ];
                            const isExpanded =
                              expandedOrderBookMarketId === market.id;

                            return (
                              <div key={`closed-${market.id}`}>
                                {/* Closed Market Row */}
                                {/* biome-ignore lint/a11y/useSemanticElements: Contains interactive buttons */}
                                <div
                                  role="button"
                                  tabIndex={0}
                                  className={cn(
                                    "w-full text-left p-3 md:p-4 border-t border-border transition-all cursor-pointer",
                                    "hover:bg-accent/30",
                                    isExpanded && "bg-muted/30"
                                  )}
                                  onClick={() => {
                                    if (isExpanded) {
                                      setExpandedOrderBookMarketId(null);
                                    } else {
                                      setExpandedOrderBookMarketId(market.id);
                                      // Market is closed — do not fetch order book snapshots.
                                    }
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      if (isExpanded) {
                                        setExpandedOrderBookMarketId(null);
                                      } else {
                                        setExpandedOrderBookMarketId(market.id);
                                      }
                                    }
                                  }}
                                >
                                  <div className="flex flex-col md:flex-row md:items-center gap-3">
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                      {market.image && (
                                        <div className="relative w-10 h-10 shrink-0 opacity-70">
                                          <Image
                                            src={market.image}
                                            alt={
                                              market.groupItemTitle || "Market"
                                            }
                                            fill
                                            sizes="40px"
                                            className="rounded object-cover"
                                          />
                                        </div>
                                      )}
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                          <h3 className="font-semibold text-sm md:text-base truncate">
                                            {market.groupItemTitle}
                                          </h3>
                                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                                            Closed
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs md:text-sm text-muted-foreground mt-0.5">
                                          <span>
                                            {formatVolume(market.volume)} Vol.
                                          </span>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-3 w-full md:w-auto">
                                      <Button
                                        type="button"
                                        size="sm"
                                        disabled
                                        className="flex-1 md:flex-initial md:min-w-[100px] text-xs md:text-sm bg-green-600/50 text-white cursor-not-allowed"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        Yes {formatPrice(market.yesPrice)}¢
                                      </Button>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="destructive"
                                        disabled
                                        className="flex-1 md:flex-initial md:min-w-[100px] text-xs md:text-sm opacity-60 cursor-not-allowed"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        No {formatPrice(market.noPrice)}¢
                                      </Button>
                                    </div>
                                  </div>
                                </div>

                                {/* Expanded Content - allow viewing order book even if market is closed */}
                                <div
                                  className={cn(
                                    "grid transition-all duration-300 ease-in-out border-t border-border bg-muted/10",
                                    isExpanded
                                      ? "grid-rows-[1fr] opacity-100"
                                      : "grid-rows-[0fr] opacity-0"
                                  )}
                                >
                                  <div className="overflow-hidden">
                                    <Tabs
                                      defaultValue="orderbook"
                                      className="w-full"
                                    >
                                      <div className="flex items-center justify-between px-4 border-b border-border">
                                        <TabsList className="h-auto p-0 bg-transparent gap-0">
                                          <TabsTrigger
                                            value="orderbook"
                                            className="px-4 py-3 rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none text-sm font-medium"
                                          >
                                            Order Book
                                          </TabsTrigger>
                                          <TabsTrigger
                                            value="graph"
                                            className="px-4 py-3 rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none text-sm font-medium"
                                          >
                                            Graph
                                          </TabsTrigger>
                                          <TabsTrigger
                                            value="resolution"
                                            className="px-4 py-3 rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none text-sm font-medium"
                                          >
                                            Resolution
                                          </TabsTrigger>
                                        </TabsList>
                                        <div className="text-xs text-muted-foreground">
                                          Closed market
                                        </div>
                                      </div>

                                      <TabsContent
                                        value="orderbook"
                                        className="m-0 data-[state=inactive]:hidden"
                                        forceMount
                                      >
                                        <div className="p-4 text-sm text-muted-foreground">
                                          This market is closed. Order book data
                                          is not fetched.
                                        </div>
                                      </TabsContent>

                                      {/* Graph Tab - Price history for closed market */}
                                      <TabsContent
                                        value="graph"
                                        className="m-0 p-4"
                                      >
                                        <MarketPriceChart
                                          tokens={[
                                            {
                                              tokenId: market.yesTokenId,
                                              name: "Yes",
                                              color: "hsl(142, 76%, 36%)", // green-600
                                            },
                                            {
                                              tokenId: market.noTokenId,
                                              name: "No",
                                              color: "hsl(0, 84%, 60%)", // red-500
                                            },
                                          ]}
                                          outcomes={["Yes", "No"]}
                                          outcomePrices={[
                                            market.yesPrice,
                                            market.noPrice,
                                          ]}
                                        />
                                      </TabsContent>

                                      <TabsContent
                                        value="resolution"
                                        className="m-0 p-4"
                                      >
                                        <div className="text-sm text-muted-foreground">
                                          This market is closed.
                                        </div>
                                      </TabsContent>
                                    </Tabs>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Trading Panel */}
          <div className="lg:col-span-1">
            {/* Trading Form with Merged Header */}
            {selectedMarket && tradingOutcomes.length > 0 && (
              <TradingForm
                marketTitle={selectedMarket.groupItemTitle || event.title}
                tokenId={tradingOutcomes[selectedOutcomeIndex]?.tokenId || ""}
                outcomes={tradingOutcomes}
                selectedOutcomeIndex={selectedOutcomeIndex}
                onOutcomeChange={setSelectedOutcomeIndex}
                negRisk={selectedMarket.negRisk || event.negRisk}
                tickSize={tickSize}
                minOrderSize={minOrderSize}
                bestBid={bestBid}
                bestAsk={bestAsk}
                orderBook={orderBook}
                maxSlippagePercent={2}
                onOrderSuccess={handleOrderSuccess}
                onOrderError={handleOrderError}
                marketImage={selectedMarket.image}
                yesProbability={selectedMarket.yesProbability}
                isLiveData={isConnected}
              />
            )}
          </div>
        </div>

        {/* Related Markets Section */}
        <Card>
          <CardContent className="pt-6">
            <Tabs defaultValue="all" className="w-full">
              <TabsList className="w-full justify-start h-auto p-1 bg-transparent border-b rounded-none">
                <TabsTrigger
                  value="all"
                  className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent"
                >
                  All
                </TabsTrigger>
                {event.tags &&
                  event.tags.length > 0 &&
                  event.tags.slice(0, 3).map((tag, idx) => {
                    const tagLabel =
                      typeof tag === "string"
                        ? tag
                        : (tag as { label?: string })?.label || "Tag";
                    return (
                      <TabsTrigger
                        key={idx}
                        value={tagLabel.toLowerCase()}
                        className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent"
                      >
                        {tagLabel}
                      </TabsTrigger>
                    );
                  })}
              </TabsList>

              <TabsContent value="all" className="mt-6">
                <div className="text-center py-8 text-muted-foreground">
                  Related markets coming soon
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </motion.main>
    </div>
  );
}
