"use client";

import { motion } from "framer-motion";
import {
  Bookmark,
  ChevronLeft,
  Clock,
  Copy,
  Share2,
  TrendingUp,
  Trophy,
} from "lucide-react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MarketPriceChart } from "@/components/market-price-chart";
import { Navbar } from "@/components/navbar";
import { NegRiskBadge } from "@/components/neg-risk-badge";
import { OrderBook } from "@/components/order-book";
import { type OutcomeData, TradingForm } from "@/components/trading-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEventDetail } from "@/hooks/use-event-detail";

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

  const eventId = params?.id as string;
  const { data: event, isLoading: loading, error } = useEventDetail(eventId);

  // Handle order success
  const handleOrderSuccess = useCallback((order: unknown) => {
    console.log("Order placed successfully:", order);
  }, []);

  // Handle order error
  const handleOrderError = useCallback((error: Error) => {
    console.error("Order failed:", error);
  }, []);

  // Handle price click from order book
  const handlePriceClick = useCallback((price: number) => {
    console.log("Price clicked:", price);
  }, []);

  // Compute markets safely (even when event is null/undefined)
  const markets = useMemo(() => {
    if (!event?.markets) return [];
    return event.markets.filter(
      (market) => market.active !== false && market.closed !== true
    );
  }, [event?.markets]);

  // Compute selected market and trading outcomes
  const { selectedMarket, tradingOutcomes, currentTokenId } = useMemo(() => {
    if (!event || markets.length === 0) {
      return {
        selectedMarket: null,
        tradingOutcomes: [] as OutcomeData[],
        currentTokenId: "",
      };
    }

    // Build market data
    const marketData = markets.map((market, idx) => {
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

    return {
      selectedMarket: selected,
      tradingOutcomes: outcomes,
      currentTokenId: tokenId,
    };
  }, [event, markets, selectedMarketId, selectedOutcomeIndex]);

  // Fetch order book for the selected outcome - MUST be called unconditionally
  const { data: orderBookData } = useQuery<OrderBookResponse | null>({
    queryKey: ["orderBook", currentTokenId],
    queryFn: async () => {
      if (!currentTokenId || currentTokenId.length < 10) return null;
      const response = await fetch(`/api/markets/orderbook/${currentTokenId}`);
      if (!response.ok) return null;
      return response.json();
    },
    enabled: !!currentTokenId && currentTokenId.length > 10,
    staleTime: 5000,
    refetchInterval: 5000,
  });

  // Extract best bid, ask, tick_size, min_order_size, and full order book for slippage
  const { bestBid, bestAsk, tickSize, minOrderSize, orderBook } =
    useMemo(() => {
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
        // Pass the full order book for slippage calculation
        orderBook: { bids, asks },
      };
    }, [orderBookData]);

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
  const marketData = markets.map((market, idx) => {
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

  // Get top 4 markets for the chart
  const top4Markets = sortedMarketData.slice(0, 4);

  // Extract market groupItemTitles and yes prices for the chart (top 4 only)
  const marketTitles = top4Markets.map((m) => m.groupItemTitle);
  const yesProb = top4Markets.map((m) => m.yesPrice);

  // Prepare token info for the chart (uses Yes token IDs)
  const chartColors = [
    "hsl(25, 95%, 53%)", // Orange
    "hsl(221, 83%, 53%)", // Blue
    "hsl(280, 100%, 70%)", // Purple/Pink
    "hsl(142, 76%, 36%)", // Green
  ];
  const chartTokens = top4Markets.map((m, idx) => ({
    tokenId: m.yesTokenId,
    name: m.groupItemTitle,
    color: chartColors[idx % chartColors.length],
  }));

  // Find the earliest createdAt from all markets or use event createdAt
  const earliestCreatedAt = markets.reduce<string | undefined>(
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
                  <span className="font-medium">{markets.length} markets</span>
                </div>
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
                  {top4Markets.map((market, idx) => (
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
                  ))}
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
                <CardTitle className="text-lg">OUTCOME</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {sortedMarketData.map((market) => (
                    // biome-ignore lint/a11y/useSemanticElements: Cannot use button as it contains interactive Button children
                    <div
                      key={market.id}
                      role="button"
                      tabIndex={0}
                      className={`w-full text-left p-3 md:p-4 rounded-lg border transition-all cursor-pointer ${
                        selectedMarket?.id === market.id
                          ? "bg-primary/10 border-primary"
                          : "hover:bg-accent/50 border-border"
                      }`}
                      onClick={() => setSelectedMarketId(market.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedMarketId(market.id);
                        }
                      }}
                    >
                      {/* Mobile & Desktop Layout */}
                      <div className="flex flex-col md:flex-row md:items-center gap-3">
                        {/* Top Row (Mobile) / Left Section (Desktop): Image + Market Title + Percentage */}
                        <div className="flex items-center gap-3 flex-1 min-w-0">
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
                            <h3 className="font-semibold text-sm md:text-base truncate">
                              {market.groupItemTitle}
                            </h3>
                            <div className="flex items-center gap-2 text-xs md:text-sm text-muted-foreground mt-0.5">
                              <span>{formatVolume(market.volume)} Vol.</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-4 w-4 md:h-5 md:w-5"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyToClipboard(formatVolume(market.volume));
                                }}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>

                          {/* Percentage (visible on mobile, positioned here) */}
                          <div className="md:hidden flex items-center gap-2">
                            <span className="text-lg font-bold">
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
                              <span>
                                {market.change >= 0 ? "+" : ""}
                                {market.change}%
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Desktop Percentage + Change (hidden on mobile) */}
                        <div className="hidden md:flex items-center gap-2 px-4">
                          <span className="text-xl font-bold">
                            {market.yesProbability}%
                          </span>
                          <div
                            className={`flex items-center gap-1 text-sm ${
                              market.change >= 0
                                ? "text-green-500"
                                : "text-red-500"
                            }`}
                          >
                            <TrendingUp
                              className={`h-4 w-4 ${
                                market.change < 0 ? "rotate-180" : ""
                              }`}
                            />
                            <span>
                              {market.change >= 0 ? "+" : ""}
                              {market.change}%
                            </span>
                          </div>
                        </div>

                        {/* Bottom Row (Mobile) / Right Section (Desktop): Yes/No Buttons */}
                        <div className="flex items-center gap-2 w-full md:w-auto">
                          <Button
                            type="button"
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white flex-1 md:flex-initial text-xs md:text-sm"
                            disabled
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span className="hidden sm:inline">Buy </span>Yes{" "}
                            {formatPrice(market.yesPrice)}¢
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            disabled
                            className="flex-1 md:flex-initial text-xs md:text-sm"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span className="hidden sm:inline">Buy </span>No{" "}
                            {formatPrice(market.noPrice)}¢
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Order Book - Below Outcomes Table */}
            {selectedMarket &&
              tradingOutcomes[selectedOutcomeIndex]?.tokenId && (
                <OrderBook
                  tokenId={tradingOutcomes[selectedOutcomeIndex].tokenId}
                  maxLevels={10}
                  onPriceClick={handlePriceClick}
                />
              )}
          </div>

          {/* Trading Panel */}
          <div className="lg:col-span-1 space-y-3 sm:space-y-4">
            {/* Selected Market Header */}
            {selectedMarket && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    {selectedMarket.image && (
                      <div className="relative w-10 h-10 shrink-0">
                        <Image
                          src={selectedMarket.image}
                          alt={selectedMarket.groupItemTitle || "Market"}
                          fill
                          sizes="40px"
                          className="rounded object-cover"
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm truncate">
                        {selectedMarket.groupItemTitle || "Select a market"}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {selectedMarket.yesProbability}% Yes
                      </p>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            )}

            {/* Trading Form */}
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
