"use client";

import { AnimatePresence, motion } from "framer-motion";
import { BarChart3, Clock, Flame, Sparkles, Star, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { EventCard } from "@/components/event-card";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useBreakingEvents } from "@/hooks/use-breaking-events";
import { useNewEvents } from "@/hooks/use-new-events";
import { usePaginatedEvents } from "@/hooks/use-paginated-events";
import { useTags } from "@/hooks/use-tags";
import { useTrendingEvents } from "@/hooks/use-trending-events";

// Quick access categories with emojis for GenZ vibes
const QUICK_CATEGORIES = [
  { label: "🔥 Trending", slug: "trending", icon: Flame, emoji: "🔥" },
  { label: "⚡ Breaking", slug: "breaking", icon: Sparkles, emoji: "⚡" },
  { label: "✨ New", slug: "new", icon: Clock, emoji: "✨" },
];

type ViewMode = "categories" | "trending" | "breaking" | "new";

export default function Home() {
  const [viewMode, setViewMode] = useState<ViewMode>("categories");
  const [mounted, setMounted] = useState(false);

  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    const saved = sessionStorage.getItem("homeViewMode");
    if (saved) {
      setViewMode(saved as ViewMode);
    }
  }, []);

  useEffect(() => {
    if (mounted) {
      sessionStorage.setItem("homeViewMode", viewMode);
    }
  }, [viewMode, mounted]);

  // Tags available for category filtering if needed
  const { data: _tags, error: _tagsError } = useTags();

  const {
    data: allPaginatedData,
    isLoading: loadingAllPaginated,
    error: allPaginatedError,
    fetchNextPage: fetchNextAllPaginated,
    hasNextPage: hasNextAllPaginated,
    isFetchingNextPage: isFetchingNextAllPaginated,
  } = usePaginatedEvents({
    limit: 20,
    order: "volume24hr",
    ascending: false,
  });

  const {
    data: trendingPaginatedData,
    isLoading: loadingTrending,
    error: trendingError,
    hasNextPage: hasNextTrending,
    fetchNextPage: fetchNextTrending,
    isFetchingNextPage: isFetchingNextTrending,
  } = useTrendingEvents(15);

  const {
    data: newPaginatedData,
    isLoading: loadingNew,
    error: newError,
    hasNextPage: hasNextNew,
    fetchNextPage: fetchNextNew,
    isFetchingNextPage: isFetchingNextNew,
  } = useNewEvents(15);

  const {
    data: breakingPaginatedData,
    isLoading: loadingBreaking,
    error: breakingError,
    hasNextPage: hasNextBreaking,
    fetchNextPage: fetchNextBreaking,
    isFetchingNextPage: isFetchingNextBreaking,
  } = useBreakingEvents(15);

  useEffect(() => {
    let hasMore = false;
    let isFetching = false;
    let fetchMore: () => void = () => {};

    switch (viewMode) {
      case "categories":
        hasMore = hasNextAllPaginated ?? false;
        isFetching = isFetchingNextAllPaginated;
        fetchMore = fetchNextAllPaginated;
        break;
      case "trending":
        hasMore = hasNextTrending ?? false;
        isFetching = isFetchingNextTrending;
        fetchMore = fetchNextTrending;
        break;
      case "new":
        hasMore = hasNextNew ?? false;
        isFetching = isFetchingNextNew;
        fetchMore = fetchNextNew;
        break;
      case "breaking":
        hasMore = hasNextBreaking ?? false;
        isFetching = isFetchingNextBreaking;
        fetchMore = fetchNextBreaking;
        break;
      default:
        return;
    }

    if (!loadMoreRef.current || !hasMore || isFetching) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          fetchMore();
        }
      },
      { threshold: 0.1, rootMargin: "200px" },
    );

    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [
    viewMode,
    hasNextAllPaginated,
    isFetchingNextAllPaginated,
    fetchNextAllPaginated,
    hasNextTrending,
    isFetchingNextTrending,
    fetchNextTrending,
    hasNextNew,
    isFetchingNextNew,
    fetchNextNew,
    hasNextBreaking,
    isFetchingNextBreaking,
    fetchNextBreaking,
  ]);

  const handleQuickCategoryClick = (mode: ViewMode) => {
    setViewMode(mode);
  };

  const getCurrentEvents = () => {
    switch (viewMode) {
      case "categories": {
        const allEvents =
          allPaginatedData?.pages.flatMap((page) => page.events) || [];
        return {
          events: allEvents,
          isLoading: loadingAllPaginated,
          error: allPaginatedError,
          hasMore: hasNextAllPaginated,
          fetchMore: fetchNextAllPaginated,
          isFetchingMore: isFetchingNextAllPaginated,
        };
      }
      case "trending": {
        const trendingEvents =
          trendingPaginatedData?.pages.flatMap((page) => page.events) || [];
        const totalTrending =
          trendingPaginatedData?.pages[0]?.totalResults ?? 0;
        const hasMoreTrending =
          (hasNextTrending ?? false) ||
          (totalTrending > 0 && trendingEvents.length < totalTrending);
        return {
          events: trendingEvents,
          isLoading: loadingTrending,
          error: trendingError,
          hasMore: hasMoreTrending,
          fetchMore: fetchNextTrending,
          isFetchingMore: isFetchingNextTrending,
        };
      }
      case "new": {
        const newEvents =
          newPaginatedData?.pages.flatMap((page) => page.events) || [];
        const totalNew = newPaginatedData?.pages[0]?.totalResults ?? 0;
        const hasMoreNew =
          (hasNextNew ?? false) ||
          (totalNew > 0 && newEvents.length < totalNew);
        return {
          events: newEvents,
          isLoading: loadingNew,
          error: newError,
          hasMore: hasMoreNew,
          fetchMore: fetchNextNew,
          isFetchingMore: isFetchingNextNew,
        };
      }
      case "breaking": {
        const breakingEvents =
          breakingPaginatedData?.pages.flatMap((page) => page.events) || [];
        const totalBreaking =
          breakingPaginatedData?.pages[0]?.totalResults ?? 0;
        const hasMoreBreaking =
          (hasNextBreaking ?? false) ||
          (totalBreaking > 0 && breakingEvents.length < totalBreaking);
        return {
          events: breakingEvents,
          isLoading: loadingBreaking,
          error: breakingError,
          hasMore: hasMoreBreaking,
          fetchMore: fetchNextBreaking,
          isFetchingMore: isFetchingNextBreaking,
        };
      }
      default:
        return {
          events: [],
          isLoading: false,
          error: null,
          hasMore: false,
          fetchMore: () => {},
          isFetchingMore: false,
        };
    }
  };

  const currentData = getCurrentEvents();

  // Get label for current view
  const getViewLabel = () => {
    switch (viewMode) {
      case "trending":
        return "🔥 Trending Markets";
      case "breaking":
        return "⚡ Breaking News";
      case "new":
        return "✨ Fresh Markets";
      default:
        return "🎯 All Markets";
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-b from-slate-50 via-white to-slate-50 dark:from-background dark:via-background dark:to-background relative overflow-x-hidden selection:bg-purple-500/30">
      {/* Subtle Grid Pattern - More visible in light mode */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgb(0_0_0/0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgb(0_0_0/0.04)_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,hsl(var(--border)/0.3)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.3)_1px,transparent_1px)] bg-size-[60px_60px] mask-[radial-gradient(ellipse_80%_50%_at_50%_0%,black_70%,transparent_110%)]" />
      </div>

      {/* Animated Background Orbs - Theme Aware */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        {/* Purple Orb - Top Left */}
        <motion.div
          animate={{
            x: [0, 30, 0],
            y: [0, -20, 0],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-[30%] -left-[15%] w-[60%] h-[60%] rounded-full blur-[150px] bg-violet-300/20 dark:bg-purple-500/8"
        />
        {/* Blue Orb - Right */}
        <motion.div
          animate={{
            x: [0, -40, 0],
            y: [0, 30, 0],
          }}
          transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[30%] -right-[15%] w-[50%] h-[50%] rounded-full blur-[130px] bg-sky-300/15 dark:bg-blue-500/6"
        />
        {/* Teal Orb - Bottom */}
        <motion.div
          animate={{
            x: [0, 20, 0],
            y: [0, -40, 0],
          }}
          transition={{ duration: 30, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -bottom-[20%] left-[10%] w-[70%] h-[70%] rounded-full blur-[180px] bg-emerald-300/10 dark:bg-emerald-500/4"
        />
        {/* Accent Orb - Center for Light Mode */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] rounded-full blur-[200px] bg-indigo-200/10 dark:bg-transparent" />
      </div>

      {/* Film Grain Overlay */}
      <div className="fixed inset-0 z-1 pointer-events-none opacity-[0.015] dark:opacity-[0.04]">
        <div className="absolute inset-0 bg-noise" />
      </div>

      <Navbar />

      {/* Main Content */}
      <main className="relative z-10 px-3 sm:px-4 md:px-6 lg:px-8 pt-4 pb-8">
        {/* Compact Header Row */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6"
        >
          {/* Live Badge + Title */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                Live
              </span>
            </div>
            <motion.h1
              key={viewMode}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-2xl sm:text-3xl font-black tracking-tight"
            >
              {getViewLabel()}
            </motion.h1>
          </div>

          {/* Stats Pills */}
          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 rounded-full bg-white/80 dark:bg-card/50 backdrop-blur-sm border border-gray-200 dark:border-border/50 text-xs font-medium text-muted-foreground shadow-sm">
              <span className="text-foreground font-bold">
                {currentData.events.length}
              </span>{" "}
              markets loaded
            </div>
          </div>
        </motion.div>

        {/* Category Pills - Horizontal Scroll */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="mb-8 -mx-3 px-3 sm:mx-0 sm:px-0"
        >
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {/* All Markets */}
            <button
              type="button"
              onClick={() => setViewMode("categories")}
              className={`group relative flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-sm whitespace-nowrap transition-all duration-300 ${
                viewMode === "categories"
                  ? "bg-gray-900 dark:bg-foreground text-white dark:text-background shadow-lg scale-105"
                  : "bg-white/80 dark:bg-card/60 hover:bg-white dark:hover:bg-card border border-gray-200 dark:border-border/50 hover:border-gray-300 dark:hover:border-border text-gray-600 dark:text-muted-foreground hover:text-gray-900 dark:hover:text-foreground shadow-sm"
              }`}
            >
              <BarChart3 className="h-4 w-4" />
              All
              {viewMode === "categories" && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-0 bg-gray-900 dark:bg-foreground rounded-2xl -z-10"
                />
              )}
            </button>

            {/* Divider */}
            <div className="w-px h-6 bg-border/50 mx-1" />

            {/* Quick Categories */}
            {QUICK_CATEGORIES.map((category) => {
              const isActive = viewMode === category.slug;
              return (
                <button
                  type="button"
                  key={category.slug}
                  onClick={() =>
                    handleQuickCategoryClick(category.slug as ViewMode)
                  }
                  className={`group relative flex items-center gap-1.5 px-4 py-2.5 rounded-2xl font-bold text-sm whitespace-nowrap transition-all duration-300 ${
                    isActive
                      ? "bg-gray-900 dark:bg-foreground text-white dark:text-background shadow-lg scale-105"
                      : "bg-white/80 dark:bg-card/60 hover:bg-white dark:hover:bg-card border border-gray-200 dark:border-border/50 hover:border-gray-300 dark:hover:border-border text-gray-600 dark:text-muted-foreground hover:text-gray-900 dark:hover:text-foreground shadow-sm"
                  }`}
                >
                  <span className="text-base">{category.emoji}</span>
                  {category.label.split(" ")[1]}
                  {isActive && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute inset-0 bg-gray-900 dark:bg-foreground rounded-2xl -z-10"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </motion.div>

        {/* Events Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={viewMode}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            {/* Error State */}
            {currentData.error && (
              <Card className="border-destructive/50 bg-destructive/5 backdrop-blur-sm mb-6">
                <CardHeader>
                  <CardTitle className="text-destructive flex items-center gap-2">
                    <Sparkles className="h-5 w-5" />
                    Oops! Something went wrong
                  </CardTitle>
                  <CardDescription>
                    {currentData.error?.message || "Unable to load markets"}
                  </CardDescription>
                </CardHeader>
              </Card>
            )}

            {/* Loading State */}
            {currentData.isLoading && !currentData.error && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5">
                {[...Array(10)].map((_, i) => (
                  <motion.div
                    key={`skeleton-${i}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="rounded-3xl bg-card/30 backdrop-blur-sm border border-border/30 overflow-hidden"
                  >
                    <Skeleton className="aspect-16/10 w-full bg-muted/50" />
                    <div className="p-5 space-y-4">
                      <Skeleton className="h-6 w-4/5 rounded-xl bg-muted/50" />
                      <Skeleton className="h-4 w-full rounded-lg bg-muted/30" />
                      <Skeleton className="h-4 w-2/3 rounded-lg bg-muted/30" />
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Events Grid */}
            {!currentData.isLoading && currentData.events.length > 0 && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5">
                  {currentData.events.map((event, index) => (
                    <EventCard
                      key={`${event.id}-${index}`}
                      event={event}
                      index={index}
                    />
                  ))}
                </div>

                {/* Loading More */}
                {currentData.isFetchingMore && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5 mt-5">
                    {[...Array(5)].map((_, i) => (
                      <div
                        key={`loading-${i}`}
                        className="rounded-3xl bg-card/30 backdrop-blur-sm border border-border/30 overflow-hidden animate-pulse"
                      >
                        <div className="aspect-16/10 w-full bg-muted/30" />
                        <div className="p-5 space-y-4">
                          <div className="h-6 w-4/5 rounded-xl bg-muted/30" />
                          <div className="h-4 w-full rounded-lg bg-muted/20" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Infinite Scroll Trigger */}
                {currentData.hasMore && !currentData.isFetchingMore && (
                  <div ref={loadMoreRef} className="h-20 w-full" />
                )}
              </>
            )}

            {/* Empty State */}
            {!currentData.isLoading &&
              currentData.events.length === 0 &&
              !currentData.error && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-20"
                >
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-muted/50 mb-6">
                    <Star className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <h3 className="text-2xl font-black mb-2">No Markets Found</h3>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    Looks like there are no {viewMode} markets right now. Check
                    back soon or explore other categories!
                  </p>
                </motion.div>
              )}
          </motion.div>
        </AnimatePresence>

        {/* Bottom CTA Section */}
        <motion.section
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          className="mt-20 mb-8"
        >
          <div className="relative overflow-hidden rounded-4xl bg-linear-to-br from-purple-500/10 via-blue-500/5 to-emerald-500/10 border border-white/10 p-8 md:p-12">
            {/* Background Glow */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/20 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/20 rounded-full blur-[80px] translate-y-1/2 -translate-x-1/2" />

            <div className="relative z-10 text-center max-w-2xl mx-auto">
              <h2 className="text-3xl md:text-4xl font-black tracking-tight mb-4">
                Ready to make your{" "}
                <span className="bg-clip-text text-transparent bg-linear-to-r from-purple-500 to-blue-500">
                  predictions
                </span>
                ?
              </h2>
              <p className="text-muted-foreground text-lg mb-8">
                Connect your wallet and start trading on real-world events.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button
                  size="lg"
                  className="rounded-2xl px-8 font-bold shadow-lg shadow-primary/25"
                >
                  <Zap className="mr-2 h-5 w-5" />
                  Start Trading
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="rounded-2xl px-8 font-bold"
                >
                  Learn More
                </Button>
              </div>
            </div>
          </div>
        </motion.section>
      </main>

      {/* Minimal Footer */}
      <footer className="relative z-10 border-t border-border/30 py-8 bg-background/50 backdrop-blur-xl">
        <div className="px-3 sm:px-4 md:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="text-base">📊</span>
            <span className="font-bold text-foreground">Polycaster</span>
            <span>•</span>
            <span>Powered by Polymarket</span>
          </div>
          <div className="flex items-center gap-4">
            <span>© 2024</span>
            <span className="hidden sm:inline">•</span>
            <span className="hidden sm:inline">
              Decentralized & Unstoppable
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
