"use client";

import { motion } from "framer-motion";
import {
  ArrowLeft,
  Bookmark,
  Clock,
  Copy,
  Share2,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { MarketPriceChart } from "@/components/market-price-chart";
import { Navbar } from "@/components/navbar";
import { NegRiskBadge } from "@/components/neg-risk-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEventDetail } from "@/hooks/use-event-detail";

interface Market {
  id: string;
  question: string;
  groupItemTitle?: string;
  slug?: string;
  description?: string;
  image?: string;
  outcomes?: string;
  outcomePrices?: string;
  volume?: string;
  liquidity?: string;
  active?: boolean;
  closed?: boolean;
  createdAt?: string;
}

interface MarketData {
  id: string;
  question: string;
  groupItemTitle: string;
  yesProbability: number;
  yesPrice: string;
  noPrice: string;
  change: number;
  volume: string;
  color: string;
  image?: string;
}

export default function EventDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [selectedMarketId, setSelectedMarketId] = useState<string>("");

  const eventId = params?.id as string;
  const { data: event, isLoading: loading, error } = useEventDetail(eventId);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8 space-y-8">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-96 w-full" />
        </main>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8">
          <Card className="text-center py-12">
            <CardHeader>
              <CardTitle>Event Not Found</CardTitle>
            </CardHeader>
            <Button onClick={() => router.back()}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </Card>
        </main>
      </div>
    );
  }

  const markets = (event.markets || []).filter(
    (market) => market.active !== false && market.closed !== true
  );

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

  // Prepare data for all markets
  const marketData = markets.map((market, idx) => {
    const outcomes = market.outcomes ? JSON.parse(market.outcomes) : [];
    const prices = market.outcomePrices ? JSON.parse(market.outcomePrices) : [];

    const yesIndex = outcomes.findIndex((o: string) =>
      o.toLowerCase().includes("yes")
    );
    const noIndex = outcomes.findIndex((o: string) =>
      o.toLowerCase().includes("no")
    );

    const yesPrice = yesIndex !== -1 ? prices[yesIndex] : prices[0];
    const noPrice = noIndex !== -1 ? prices[noIndex] : prices[1];

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
      change: Number.parseFloat(change),
      volume: market.volume || "0",
      color: colors[idx % colors.length],
      image: market.image,
    };
  });

  // Sort all markets by probability (highest first)
  const sortedMarketData = [...marketData].sort(
    (a, b) => b.yesProbability - a.yesProbability
  );

  // Set default selected market to the first one (highest probability)
  const selectedMarket =
    sortedMarketData.find((m) => m.id === selectedMarketId) ||
    sortedMarketData[0];

  // Get top 4 markets for the chart
  const top4Markets = sortedMarketData.slice(0, 4);

  // Extract market groupItemTitles and yes prices for the chart (top 4 only)
  const marketTitles = top4Markets.map((m) => m.groupItemTitle);
  const yesProb = top4Markets.map((m) => m.yesPrice);

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
        className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8 space-y-6"
      >
        {/* Back Button */}
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        {/* Header Section */}
        <Card className="border-none shadow-none bg-card/50">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4 flex-1">
                {event.image && (
                  <img
                    src={event.image}
                    alt={event.title}
                    className="w-16 h-16 rounded-lg object-cover shrink-0"
                  />
                )}

                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-3">
                    <h1 className="text-2xl md:text-3xl font-bold">
                      {event.title}
                    </h1>
                    {event.negRisk && <NegRiskBadge />}
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Trophy className="h-4 w-4" />
                      <span className="font-medium">
                        {formatVolume(event.volume)} Vol.
                      </span>
                    </div>
                    {event.endDate && (
                      <div className="flex items-center gap-1.5">
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
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      navigator.share?.({
                        title: event.title,
                        url: window.location.href,
                      });
                    }
                  }}
                >
                  <Share2 className="h-5 w-5" />
                </Button>
                <Button type="button" variant="ghost" size="icon">
                  <Bookmark className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main Content: Chart + Trading Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Chart + Outcomes Table */}
          <div className="lg:col-span-2 space-y-6">
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
                    <div
                      key={market.id}
                      className={`p-3 md:p-4 rounded-lg border transition-all cursor-pointer ${
                        selectedMarket?.id === market.id
                          ? "bg-primary/10 border-primary"
                          : "hover:bg-accent/50 border-border"
                      }`}
                      onClick={() => setSelectedMarketId(market.id)}
                    >
                      {/* Mobile & Desktop Layout */}
                      <div className="flex flex-col md:flex-row md:items-center gap-3">
                        {/* Top Row (Mobile) / Left Section (Desktop): Image + Market Title + Percentage */}
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {market.image && (
                            <img
                              src={market.image}
                              alt={market.groupItemTitle}
                              className="w-10 h-10 rounded object-cover shrink-0"
                            />
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
          </div>

          {/* Trading Panel */}
          <div className="lg:col-span-1">
            <Card className="lg:sticky lg:top-4">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  {selectedMarket?.image && (
                    <img
                      src={selectedMarket.image}
                      alt={selectedMarket?.groupItemTitle || "Market"}
                      className="w-10 h-10 rounded object-cover shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate">
                      {selectedMarket?.groupItemTitle || "Select a market"}
                    </h3>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Buy/Sell Toggle */}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="default"
                    className="flex-1"
                    size="lg"
                  >
                    Buy
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    size="lg"
                  >
                    Sell
                  </Button>
                </div>

                {/* Limit */}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="default"
                    className="flex-1"
                    size="sm"
                  >
                    Limit
                  </Button>
                </div>

                {/* Yes/No Buttons */}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    disabled
                  >
                    Yes {formatPrice(selectedMarket?.yesPrice || "0")}¢
                  </Button>
                  <Button type="button" variant="destructive" disabled>
                    No {formatPrice(selectedMarket?.noPrice || "0")}¢
                  </Button>
                </div>

                {/* Limit Price */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-medium">Limit Price</label>
                    <div className="text-sm text-muted-foreground">
                      Balance $2.72
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      disabled
                    >
                      −
                    </Button>
                    <div className="flex-1 text-center">
                      <span className="text-2xl font-semibold">
                        {formatPrice(selectedMarket?.yesPrice || "0")}¢
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      disabled
                    >
                      +
                    </Button>
                  </div>
                </div>

                {/* Shares */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-medium">Shares</label>
                    <div className="text-sm text-muted-foreground">Max</div>
                  </div>
                  <div className="flex-1 text-center">
                    <span className="text-2xl font-semibold">0</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 md:gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs md:text-sm"
                      disabled
                    >
                      -100
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs md:text-sm"
                      disabled
                    >
                      -10
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs md:text-sm"
                      disabled
                    >
                      +10
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs md:text-sm"
                      disabled
                    >
                      +100
                    </Button>
                  </div>
                </div>

                {/* Set Expiration */}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Set Expiration</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-11 p-0 rounded-full bg-muted"
                    disabled
                  >
                    <div className="h-5 w-5 rounded-full bg-background ml-auto" />
                  </Button>
                </div>

                {/* Totals */}
                <div className="space-y-2 pt-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Total</span>
                    <span className="text-xl font-bold text-primary">$0</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">To Win</span>
                    <span className="text-xl font-bold text-green-500">$0</span>
                  </div>
                </div>

                {/* Buy Button */}
                <Button
                  type="button"
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  size="lg"
                  disabled
                >
                  Buy Yes
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  By trading, you agree to the Terms of Use
                </p>
              </CardContent>
            </Card>
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
