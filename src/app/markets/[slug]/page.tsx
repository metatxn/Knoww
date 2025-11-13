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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMarketDetail } from "@/hooks/use-market-detail";

export default function MarketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [selectedOutcome, setSelectedOutcome] = useState(0);

  const slug = params?.slug as string;

  // Fetch market details with TanStack Query (slug-based only, as recommended by API team)
  const { data: market, isLoading: loading, error } = useMarketDetail(slug);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8 space-y-8">
          {/* Back Button Skeleton */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-2"
          >
            <Skeleton className="h-10 w-32" />
          </motion.div>

          {/* Market Header Skeleton */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, delay: 0.05 }}
            className="space-y-4"
          >
            <div className="flex items-start gap-4">
              <Skeleton className="w-20 h-20 rounded-lg shrink-0" />
              <div className="flex-1 space-y-3">
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-4 w-full max-w-3xl" />
                <div className="flex gap-4">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-28" />
                </div>
              </div>
            </div>
          </motion.div>

          {/* Separator */}
          <Skeleton className="h-px w-full" />

          {/* Main Content Grid Skeleton */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Chart Skeleton */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2, delay: 0.1 }}
              className="lg:col-span-2"
            >
              <Card>
                <CardHeader>
                  <Skeleton className="h-6 w-32" />
                  <Skeleton className="h-4 w-48" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-[350px] w-full" />
                </CardContent>
              </Card>
            </motion.div>

            {/* Trading Panel Skeleton */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2, delay: 0.15 }}
            >
              <Card>
                <CardHeader>
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-4 w-40" />
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Tabs Skeleton */}
                  <div className="flex gap-2">
                    <Skeleton className="h-10 flex-1" />
                    <Skeleton className="h-10 flex-1" />
                  </div>

                  {/* Outcome Buttons Skeleton */}
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                  </div>

                  <Skeleton className="h-px w-full" />

                  {/* Form Skeleton */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-4 w-20" />
                      </div>
                      <div className="flex justify-between">
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-4 w-20" />
                      </div>
                    </div>
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Order Book Skeleton */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, delay: 0.2 }}
          >
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-48" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-64 w-full" />
              </CardContent>
            </Card>
          </motion.div>
        </main>
      </div>
    );
  }

  if (error || !market) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8">
          <Card className="text-center py-12">
            <CardHeader>
              <CardTitle>Market Not Found</CardTitle>
              <CardDescription>
                {error?.message || "Unable to load market"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => router.back()}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const outcomes = market.outcomes ? JSON.parse(market.outcomes) : [];
  const prices = market.outcomePrices ? JSON.parse(market.outcomePrices) : [];

  const formatPrice = (price: string) => {
    const num = Number.parseFloat(price);
    return (num * 100).toFixed(1);
  };

  const formatVolume = (vol?: number | string) => {
    if (!vol) return "N/A";
    const num = typeof vol === "string" ? Number.parseFloat(vol) : vol;
    if (num >= 1_000_000) {
      return `$${(num / 1_000_000).toFixed(2)}M`;
    }
    if (num >= 1_000) {
      return `$${(num / 1_000).toFixed(2)}K`;
    }
    return `$${num.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const _priceChange = market.oneDayPriceChange || 0;

  // Calculate outcome-specific data
  const outcomeData = outcomes.map((outcome: string, idx: number) => {
    const price = prices[idx] ? Number.parseFloat(prices[idx]) : 0;
    const probability = (price * 100).toFixed(0);
    const change = ((Math.random() - 0.5) * 10).toFixed(1); // Mock change data
    return {
      name: outcome,
      probability: Number.parseInt(probability, 10),
      change: Number.parseFloat(change),
      volume: market.volumeNum || market.volume || 0,
      color:
        idx === 0
          ? "orange"
          : idx === 1
            ? "blue"
            : idx === 2
              ? "purple"
              : "green",
    };
  });

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <motion.main
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
        className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8 space-y-6"
      >
        {/* Back Button */}
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.back()}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        {/* Header Section */}
        <Card className="border-none shadow-none bg-card/50">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4 flex-1">
                {market.image && (
                  <img
                    src={market.image}
                    alt={market.question}
                    className="w-16 h-16 rounded-lg object-cover shrink-0"
                  />
                )}

                <div className="flex-1">
                  <h1 className="text-2xl md:text-3xl font-bold mb-4">
                    {market.question}
                  </h1>

                  {/* Metadata */}
                  <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Trophy className="h-4 w-4" />
                      <span className="font-medium">
                        {formatVolume(market.volumeNum || market.volume)} Vol.
                      </span>
                    </div>
                    {market.end_date_iso && (
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-4 w-4" />
                        <span>
                          {new Date(market.end_date_iso).toLocaleDateString(
                            "en-US",
                            {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            },
                          )}
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
                        title: market.question,
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

            {/* Date Selection Pills - Mock for now */}
            <div className="flex items-center gap-2 mt-4">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div className="flex gap-2 overflow-x-auto">
                <Badge variant="default" className="shrink-0">
                  Dec 10
                </Badge>
                <Badge variant="outline" className="shrink-0">
                  Jan 28, 2026
                </Badge>
                <Badge variant="outline" className="shrink-0">
                  Mar 18, 2026
                </Badge>
              </div>
            </div>

            {/* Probability Legend */}
            <div className="flex flex-wrap gap-4 mt-6">
              {outcomeData.map(
                (
                  outcome: { name: string; probability: number; color: string },
                  idx: number,
                ) => (
                  <div key={idx} className="flex items-center gap-2">
                    <div
                      className={`w-3 h-3 rounded-full ${
                        outcome.color === "orange"
                          ? "bg-orange-500"
                          : outcome.color === "blue"
                            ? "bg-blue-500"
                            : outcome.color === "purple"
                              ? "bg-purple-400"
                              : "bg-green-500"
                      }`}
                    />
                    <span className="text-sm">
                      {outcome.name} {outcome.probability}%
                    </span>
                  </div>
                ),
              )}
            </div>
          </CardContent>
        </Card>

        {/* Main Content: Chart + Trading Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Chart Section - Left Side (2/3 width) */}
          <div className="lg:col-span-2">
            <Card>
              <CardContent className="pt-6">
                <MarketPriceChart
                  outcomes={outcomes}
                  outcomePrices={prices.map((p: string) => p.toString())}
                />
              </CardContent>
            </Card>
          </div>

          {/* Trading Panel - Right Side (1/3 width) */}
          <div className="lg:col-span-1">
            <Card className="sticky top-4">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  {market.image && (
                    <img
                      src={market.image}
                      alt={outcomeData[selectedOutcome]?.name || "Market"}
                      className="w-10 h-10 rounded object-cover shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate">
                      {outcomeData[selectedOutcome]?.name ||
                        "Select an outcome"}
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

                {/* Outcome Selector */}
                <div className="space-y-2">
                  <div className="text-sm font-medium text-muted-foreground">
                    Outcome
                  </div>
                  <div className="space-y-2">
                    {outcomeData.map(
                      (
                        outcome: {
                          name: string;
                          probability: number;
                          volume: number;
                          change: number;
                          color: string;
                        },
                        idx: number,
                      ) => (
                        <Button
                          key={idx}
                          type="button"
                          variant={
                            selectedOutcome === idx ? "default" : "outline"
                          }
                          className="w-full justify-between h-auto py-3"
                          onClick={() => setSelectedOutcome(idx)}
                        >
                          <span className="font-medium text-left flex-1">
                            {outcome.name}
                          </span>
                          <span className="font-bold">
                            {formatPrice(prices[idx] || "0")}¢
                          </span>
                        </Button>
                      ),
                    )}
                  </div>
                </div>

                {/* Yes/No Buttons */}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    disabled
                  >
                    Yes {formatPrice(prices[selectedOutcome] || "0")}¢
                  </Button>
                  <Button type="button" variant="destructive" disabled>
                    No{" "}
                    {formatPrice(
                      (
                        1 - Number.parseFloat(prices[selectedOutcome] || "0")
                      ).toString(),
                    )}
                    ¢
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
                      <span className="text-2xl font-semibold">0.0¢</span>
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
                  <div className="flex items-center gap-2">
                    <div className="flex-1 text-center">
                      <span className="text-2xl font-semibold">0</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      disabled
                    >
                      -100
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      disabled
                    >
                      -10
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      disabled
                    >
                      +10
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      disabled
                    >
                      +100
                    </Button>
                  </div>
                </div>

                {/* Set Expiration Toggle */}
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

        {/* Outcomes List */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">OUTCOME</h2>
          <div className="space-y-3">
            {outcomeData.map(
              (
                outcome: {
                  name: string;
                  probability: number;
                  volume: number;
                  change: number;
                  color: string;
                },
                idx: number,
              ) => (
                <Card key={idx}>
                  <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      {/* Left: Outcome info */}
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{outcome.name}</h3>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <span className="text-2xl font-bold">
                              {outcome.probability}%
                            </span>
                            <div
                              className={`flex items-center gap-1 text-sm ${
                                outcome.change >= 0
                                  ? "text-green-500"
                                  : "text-red-500"
                              }`}
                            >
                              <TrendingUp
                                className={`h-4 w-4 ${
                                  outcome.change < 0 ? "rotate-180" : ""
                                }`}
                              />
                              <span>
                                {outcome.change >= 0 ? "+" : ""}
                                {outcome.change}%
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span>{formatVolume(outcome.volume)} Vol.</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() =>
                                copyToClipboard(formatVolume(outcome.volume))
                              }
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Right: Action buttons */}
                      <div className="flex items-center gap-3">
                        <Button
                          type="button"
                          size="lg"
                          className="bg-green-600 hover:bg-green-700 text-white min-w-[120px]"
                          disabled
                        >
                          Buy Yes {formatPrice(prices[idx] || "0")}¢
                        </Button>
                        <Button
                          type="button"
                          size="lg"
                          variant="destructive"
                          className="min-w-[120px]"
                          disabled
                        >
                          Buy No{" "}
                          {formatPrice(
                            (
                              1 - Number.parseFloat(prices[idx] || "0")
                            ).toString(),
                          )}
                          ¢
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ),
            )}
          </div>

          {/* Trading Notice */}
          <p className="text-sm text-muted-foreground text-center pt-4">
            Trading functionality coming soon. Connect your wallet to get
            started.
          </p>
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
                <TabsTrigger
                  value="politics"
                  className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent"
                >
                  Politics
                </TabsTrigger>
                <TabsTrigger
                  value="trump"
                  className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent"
                >
                  Trump
                </TabsTrigger>
                <TabsTrigger
                  value="fed-rates"
                  className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent"
                >
                  Fed Rates
                </TabsTrigger>
              </TabsList>

              <TabsContent value="all" className="mt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Mock Related Market Cards */}
                  {[
                    {
                      title: "Fed rate hike in 2025?",
                      probability: "1%",
                      image: market.image,
                    },
                    {
                      title: "Will 2 Fed rate cuts happen in 2026?",
                      probability: "25%",
                      image: market.image,
                    },
                    {
                      title: "Fed emergency rate cut in 2025?",
                      probability: "3%",
                      image: market.image,
                    },
                  ].map((relatedMarket, idx) => (
                    <Card
                      key={idx}
                      className="cursor-pointer hover:bg-accent/50 transition-colors"
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          {relatedMarket.image && (
                            <img
                              src={relatedMarket.image}
                              alt={relatedMarket.title}
                              className="w-12 h-12 rounded object-cover shrink-0"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-sm mb-2 line-clamp-2">
                              {relatedMarket.title}
                            </h4>
                            <div className="text-2xl font-bold text-primary">
                              {relatedMarket.probability}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="politics" className="mt-6">
                <div className="text-center py-8 text-muted-foreground">
                  No related markets in Politics
                </div>
              </TabsContent>

              <TabsContent value="trump" className="mt-6">
                <div className="text-center py-8 text-muted-foreground">
                  No related markets in Trump
                </div>
              </TabsContent>

              <TabsContent value="fed-rates" className="mt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[
                    {
                      title: "Fed rate hike in 2025?",
                      probability: "1%",
                      image: market.image,
                    },
                    {
                      title: "Will 2 Fed rate cuts happen in 2026?",
                      probability: "25%",
                      image: market.image,
                    },
                    {
                      title: "Fed emergency rate cut in 2025?",
                      probability: "3%",
                      image: market.image,
                    },
                  ].map((relatedMarket, idx) => (
                    <Card
                      key={idx}
                      className="cursor-pointer hover:bg-accent/50 transition-colors"
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          {relatedMarket.image && (
                            <img
                              src={relatedMarket.image}
                              alt={relatedMarket.title}
                              className="w-12 h-12 rounded object-cover shrink-0"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-sm mb-2 line-clamp-2">
                              {relatedMarket.title}
                            </h4>
                            <div className="text-2xl font-bold text-primary">
                              {relatedMarket.probability}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </motion.main>
    </div>
  );
}
