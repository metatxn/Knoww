"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Activity, Flame, Sparkles, Star, Zap } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { EventCard } from "@/components/event-card";
import { EventFilterBar } from "@/components/event-filter-bar";
import { MarketSearch } from "@/components/market-search";
import { Navbar } from "@/components/navbar";
import { PageBackground } from "@/components/page-background";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useEventFilters } from "@/context/event-filter-context";
import { useBreakingEvents } from "@/hooks/use-breaking-events";
import { useNewEvents } from "@/hooks/use-new-events";
import { usePaginatedEvents } from "@/hooks/use-paginated-events";
import { useTags } from "@/hooks/use-tags";
import { useTrendingEvents } from "@/hooks/use-trending-events";

// Tab categories
const TAB_CATEGORIES = [
  { label: "All", slug: "categories", icon: Activity },
  { label: "Trending", slug: "trending", icon: Flame },
  { label: "Breaking", slug: "breaking", icon: Zap },
  { label: "New", slug: "new", icon: Sparkles },
];

type ViewMode = "categories" | "trending" | "breaking" | "new";

// Event interface for client-side date filtering (fallback if API doesn't support date filters)
interface EventWithDates {
  id: string;
  title: string;
  startDate?: string;
  endDate?: string;
}

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

  // Get filter context with server-side filter params
  const {
    filters,
    hasActiveFilters,
    clearAllFilters,
    serverFilterParams,
    apiQueryParams,
  } = useEventFilters();

  // Client-side date filter as fallback (in case API doesn't support date filtering)
  const applyDateFilter = useCallback(
    <T extends EventWithDates>(events: T[]): T[] => {
      // Only apply client-side date filtering if date range is set
      if (!filters.dateRange.start && !filters.dateRange.end) {
        return events;
      }

      return events.filter((event) => {
        const eventStartDate = event.startDate
          ? new Date(event.startDate)
          : null;
        const eventEndDate = event.endDate ? new Date(event.endDate) : null;

        // If filtering by start date: event must end after the filter start date
        if (filters.dateRange.start && eventEndDate) {
          if (eventEndDate < filters.dateRange.start) return false;
        }

        // If filtering by end date: event must start before the filter end date
        if (filters.dateRange.end && eventStartDate) {
          if (eventStartDate > filters.dateRange.end) return false;
        }

        return true;
      });
    },
    [filters.dateRange],
  );

  // Use server-side filtering for paginated events
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
    active: apiQueryParams.active,
    closed: apiQueryParams.closed,
    tagSlug: apiQueryParams.tagSlug,
    filters: serverFilterParams,
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

  // Simple infinite scroll - server handles filtering now
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

  // Get current events - server handles most filtering, client-side date filter as fallback
  const getCurrentEvents = () => {
    switch (viewMode) {
      case "categories": {
        const allEvents =
          allPaginatedData?.pages.flatMap((page) => page.events) || [];
        const filteredEvents = applyDateFilter(allEvents);
        return {
          events: filteredEvents,
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
        const filteredEvents = applyDateFilter(trendingEvents);
        const totalTrending =
          trendingPaginatedData?.pages[0]?.totalResults ?? 0;
        const hasMoreTrending =
          (hasNextTrending ?? false) ||
          (totalTrending > 0 && trendingEvents.length < totalTrending);
        return {
          events: filteredEvents,
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
        const filteredEvents = applyDateFilter(newEvents);
        const totalNew = newPaginatedData?.pages[0]?.totalResults ?? 0;
        const hasMoreNew =
          (hasNextNew ?? false) ||
          (totalNew > 0 && newEvents.length < totalNew);
        return {
          events: filteredEvents,
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
        const filteredEvents = applyDateFilter(breakingEvents);
        const totalBreaking =
          breakingPaginatedData?.pages[0]?.totalResults ?? 0;
        const hasMoreBreaking =
          (hasNextBreaking ?? false) ||
          (totalBreaking > 0 && breakingEvents.length < totalBreaking);
        return {
          events: filteredEvents,
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

  return (
    <div className="min-h-screen bg-linear-to-b from-slate-50 via-white to-slate-50 dark:from-background dark:via-background dark:to-background relative overflow-x-hidden selection:bg-purple-500/30">
      <PageBackground />

      <Navbar />

      {/* Main Content */}
      <main className="relative z-10 px-3 sm:px-4 md:px-6 lg:px-8 pt-6 pb-8">
        {/* Header Row: Live Badge + Title + Market Count */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex items-center justify-between mb-6"
        >
          {/* Left: Live Badge + Title */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 w-fit">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                Live Markets
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Explore Markets
            </h1>
          </div>

          {/* Right: Market Count */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 border border-border/50 text-sm">
              <span className="font-bold text-foreground">
                {currentData.events.length}
              </span>
              <span className="text-muted-foreground">active markets</span>
            </div>
          </div>
        </motion.div>

        {/* Tab Pills Row + Search */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="flex items-center justify-between gap-4 mb-2"
        >
          {/* Tab Pills */}
          <div className="flex items-center gap-1 bg-muted/30 rounded-full p-1">
            {TAB_CATEGORIES.map((tab) => {
              const isActive = viewMode === tab.slug;
              const Icon = tab.icon;
              return (
                <button
                  type="button"
                  key={tab.slug}
                  onClick={() =>
                    tab.slug === "categories"
                      ? setViewMode("categories")
                      : handleQuickCategoryClick(tab.slug as ViewMode)
                  }
                  className={`relative flex items-center gap-2 px-4 py-2 rounded-full font-semibold text-sm whitespace-nowrap transition-all duration-200 ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Search Input */}
          <MarketSearch className="hidden sm:block w-64" />
        </motion.div>

        {/* Filter Bar */}
        <EventFilterBar />

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

                {/* End of results message */}
                {!currentData.hasMore &&
                  !currentData.isFetchingMore &&
                  currentData.events.length > 0 && (
                    <div className="flex justify-center py-6">
                      <p className="text-sm text-muted-foreground">
                        {hasActiveFilters
                          ? `Found ${currentData.events.length} markets matching your filters`
                          : `Showing all ${currentData.events.length} markets`}
                      </p>
                    </div>
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
                  <h3 className="text-2xl font-black mb-2">
                    {hasActiveFilters
                      ? "No Matching Markets"
                      : "No Markets Found"}
                  </h3>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    {hasActiveFilters
                      ? "No markets match your current filters. Try adjusting or clearing your filters."
                      : `Looks like there are no ${viewMode} markets right now. Check back soon or explore other categories!`}
                  </p>
                  {hasActiveFilters && (
                    <Button
                      variant="outline"
                      onClick={clearAllFilters}
                      className="mt-4 rounded-xl"
                    >
                      Clear All Filters
                    </Button>
                  )}
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
