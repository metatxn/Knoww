"use client";

import { motion } from "framer-motion";
import {
  BarChart3,
  Bitcoin,
  Briefcase,
  Clock,
  Flame,
  Globe,
  Landmark,
  MessageSquare,
  Sparkles,
  TrendingUp,
  Trophy,
  Tv,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
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

// Icon mapping for different categories
const CATEGORY_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  sports: Trophy,
  nfl: Trophy,
  nba: Trophy,
  mlb: Trophy,
  nhl: Trophy,
  soccer: Trophy,
  epl: Trophy,
  politics: Landmark,
  crypto: Bitcoin,
  world: Globe,
  finance: Briefcase,
  entertainment: Tv,
  trending: TrendingUp,
  technology: Zap,
  tech: Zap,
  social: MessageSquare,
  business: BarChart3,
};

// Color themes for different categories
const CATEGORY_COLORS: Record<string, string> = {
  sports: "bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/20",
  nfl: "bg-blue-600/10 hover:bg-blue-600/20 border-blue-600/20",
  nba: "bg-orange-500/10 hover:bg-orange-500/20 border-orange-500/20",
  mlb: "bg-red-500/10 hover:bg-red-500/20 border-red-500/20",
  nhl: "bg-cyan-500/10 hover:bg-cyan-500/20 border-cyan-500/20",
  soccer: "bg-green-500/10 hover:bg-green-500/20 border-green-500/20",
  epl: "bg-green-600/10 hover:bg-green-600/20 border-green-600/20",
  politics: "bg-purple-500/10 hover:bg-purple-500/20 border-purple-500/20",
  crypto: "bg-yellow-500/10 hover:bg-yellow-500/20 border-yellow-500/20",
  world: "bg-teal-500/10 hover:bg-teal-500/20 border-teal-500/20",
  finance: "bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/20",
  entertainment: "bg-pink-500/10 hover:bg-pink-500/20 border-pink-500/20",
  trending: "bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/20",
  technology: "bg-foreground/5 hover:bg-foreground/10 border-foreground/10",
  tech: "bg-foreground/5 hover:bg-foreground/10 border-foreground/10",
  social: "bg-violet-500/10 hover:bg-violet-500/20 border-violet-500/20",
  business: "bg-slate-500/10 hover:bg-slate-500/20 border-slate-500/20",
};

// Quick access categories (like Polymarket's top bar)
const QUICK_CATEGORIES = [
  { label: "Trending", slug: "trending", icon: Flame },
  { label: "Breaking", slug: "breaking", icon: Sparkles },
  { label: "New", slug: "new", icon: Clock },
];

type ViewMode = "categories" | "trending" | "breaking" | "new";

export default function Home() {
  const router = useRouter();
  // Initialize viewMode - always start with "categories" on server
  const [viewMode, setViewMode] = useState<ViewMode>("categories");
  const [mounted, setMounted] = useState(false);

  // Reference for infinite scroll observer
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Hydrate viewMode from sessionStorage after mount
  useEffect(() => {
    setMounted(true);
    const saved = sessionStorage.getItem("homeViewMode");
    if (saved) {
      setViewMode(saved as ViewMode);
    }
  }, []);

  // Save viewMode to sessionStorage whenever it changes (only after mount)
  useEffect(() => {
    if (mounted) {
      sessionStorage.setItem("homeViewMode", viewMode);
    }
  }, [viewMode, mounted]);

  // Fetch all tags
  const { data: tags, isLoading: loadingTags, error: tagsError } = useTags();

  // Fetch paginated events for "All Categories" (no tagSlug = all events)
  const {
    data: allPaginatedData,
    isLoading: loadingAllPaginated,
    error: allPaginatedError,
    fetchNextPage: fetchNextAllPaginated,
    hasNextPage: hasNextAllPaginated,
    isFetchingNextPage: isFetchingNextAllPaginated,
  } = usePaginatedEvents({
    // No tagSlug = fetch all events
    limit: 20,
    order: "volume24hr",
    ascending: false,
  });

  // Fetch trending, new, and breaking events
  const {
    data: trendingData,
    isLoading: loadingTrending,
    error: trendingError,
  } = useTrendingEvents(12);
  const {
    data: newData,
    isLoading: loadingNew,
    error: newError,
  } = useNewEvents(12);
  const {
    data: breakingData,
    isLoading: loadingBreaking,
    error: breakingError,
  } = useBreakingEvents(12);

  // Debug: Log tags data
  useEffect(() => {
    if (tags) {
      console.log("Tags data:", tags);
    }
    if (tagsError) {
      console.error("Tags error:", tagsError);
    }
  }, [tags, tagsError]);

  // Infinite scroll: auto-load more when reaching bottom (only for "categories" view)
  useEffect(() => {
    if (viewMode !== "categories") return;
    if (
      !loadMoreRef.current ||
      !hasNextAllPaginated ||
      isFetchingNextAllPaginated
    )
      return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          fetchNextAllPaginated();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(loadMoreRef.current);

    return () => observer.disconnect();
  }, [
    viewMode,
    hasNextAllPaginated,
    isFetchingNextAllPaginated,
    fetchNextAllPaginated,
  ]);

  const _getIcon = (slug: string) => {
    if (!slug) return TrendingUp;
    const Icon = CATEGORY_ICONS[slug.toLowerCase()] || TrendingUp;
    return Icon;
  };

  const _getColorClass = (slug: string) => {
    if (!slug)
      return "bg-foreground/5 hover:bg-foreground/10 border-foreground/10";
    return (
      CATEGORY_COLORS[slug.toLowerCase()] ||
      "bg-foreground/5 hover:bg-foreground/10 border-foreground/10"
    );
  };

  const _handleTagClick = (slug: string) => {
    router.push(`/events/${slug}`);
  };

  const handleQuickCategoryClick = (mode: ViewMode) => {
    setViewMode(mode);
  };

  const handleEventClick = (eventId: string) => {
    router.push(`/events/detail/${eventId}`);
  };

  // Get current events based on view mode
  const getCurrentEvents = () => {
    switch (viewMode) {
      case "categories": {
        // Flatten all pages of paginated data
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
      case "trending":
        return {
          events: trendingData?.events || [],
          isLoading: loadingTrending,
          error: trendingError,
          hasMore: false,
          fetchMore: () => {},
          isFetchingMore: false,
        };
      case "new":
        return {
          events: newData?.events || [],
          isLoading: loadingNew,
          error: newError,
          hasMore: false,
          fetchMore: () => {},
          isFetchingMore: false,
        };
      case "breaking":
        return {
          events: breakingData?.events || [],
          isLoading: loadingBreaking,
          error: breakingError,
          hasMore: false,
          fetchMore: () => {},
          isFetchingMore: false,
        };
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
  const formatVolume = (vol?: string) => {
    if (!vol) return "N/A";
    const num = parseFloat(vol);
    if (num >= 1000000) {
      return `$${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `$${(num / 1000).toFixed(0)}K`;
    }
    return `$${num.toFixed(0)}`;
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Main Content */}
      <main className="px-4 md:px-6 lg:px-8 py-8">
        {/* Hero Section */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">
            Explore Prediction Markets
          </h1>
          <p className="text-muted-foreground text-lg">
            Browse markets across all categories and make your predictions
          </p>
        </div>

        {/* Quick Access Categories Bar */}
        <div className="mb-8">
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            <Button
              variant={viewMode === "categories" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("categories")}
              className="whitespace-nowrap gap-2"
            >
              <BarChart3 className="h-4 w-4" />
              All Categories
            </Button>
            {QUICK_CATEGORIES.map((category) => {
              const Icon = category.icon;
              const isActive = viewMode === category.slug;
              return (
                <Button
                  key={category.slug}
                  variant={isActive ? "default" : "outline"}
                  size="sm"
                  onClick={() =>
                    handleQuickCategoryClick(category.slug as ViewMode)
                  }
                  className="whitespace-nowrap gap-2"
                >
                  <Icon className="h-4 w-4" />
                  {category.label}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Show Events (Trending, Breaking, New) */}
        {viewMode !== "categories" && (
          <>
            {/* Error State */}
            {currentData.error && (
              <Card className="border-destructive mb-6">
                <CardHeader>
                  <CardTitle className="text-destructive">
                    Error Loading{" "}
                    {viewMode.charAt(0).toUpperCase() + viewMode.slice(1)}{" "}
                    Events
                  </CardTitle>
                  <CardDescription>
                    {currentData.error?.message || "Unable to load events"}
                  </CardDescription>
                </CardHeader>
              </Card>
            )}

            {/* Loading State */}
            {currentData.isLoading && !currentData.error && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
                {[...Array(10)].map((_, i) => (
                  <div
                    key={`event-skeleton-${i}`}
                    className="rounded-2xl bg-card border border-border/50 overflow-hidden"
                  >
                    <Skeleton className="aspect-[16/10] w-full" />
                    <div className="p-4 space-y-3">
                      <Skeleton className="h-5 w-3/4" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-2/3" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Events Grid */}
            {!currentData.isLoading && currentData.events.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
                {currentData.events.map((event, index) => (
                  <EventCard key={event.id} event={event} index={index} />
                ))}
              </div>
            )}

            {/* Empty State */}
            {!currentData.isLoading &&
              currentData.events.length === 0 &&
              !currentData.error && (
                <Card className="text-center py-12">
                  <CardHeader>
                    <CardTitle>No Events Found</CardTitle>
                    <CardDescription>
                      No {viewMode} events available at the moment.
                    </CardDescription>
                  </CardHeader>
                </Card>
              )}
          </>
        )}

        {/* Show All Categories Events */}
        {viewMode === "categories" && (
          <>
            {/* Error State */}
            {currentData.error && (
              <Card className="border-destructive mb-6">
                <CardHeader>
                  <CardTitle className="text-destructive">
                    Error Loading Events
                  </CardTitle>
                  <CardDescription>
                    {currentData.error?.message || "Unable to load events"}
                  </CardDescription>
                </CardHeader>
              </Card>
            )}

            {/* Loading State */}
            {currentData.isLoading && !currentData.error && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
                {[...Array(10)].map((_, i) => (
                  <div
                    key={`cat-skeleton-${i}`}
                    className="rounded-2xl bg-card border border-border/50 overflow-hidden"
                  >
                    <Skeleton className="aspect-[16/10] w-full" />
                    <div className="p-4 space-y-3">
                      <Skeleton className="h-5 w-3/4" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-2/3" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Events Grid */}
            {!currentData.isLoading && currentData.events.length > 0 && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
                  {currentData.events.map((event, index) => (
                    <EventCard
                      key={`${event.id}-${index}`}
                      event={event}
                      index={index}
                    />
                  ))}
                </div>

                {/* Loading skeleton for next page */}
                {currentData.isFetchingMore && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 mt-6"
                  >
                    {[...Array(5)].map((_, i) => (
                      <motion.div
                        key={`loading-skeleton-${i}`}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                      >
                        <Card>
                          <CardHeader>
                            <Skeleton className="h-48 w-full mb-4 rounded" />
                            <Skeleton className="h-6 w-3/4 mb-2" />
                            <Skeleton className="h-4 w-full mb-2" />
                            <Skeleton className="h-4 w-2/3" />
                          </CardHeader>
                        </Card>
                      </motion.div>
                    ))}
                  </motion.div>
                )}

                {/* Invisible trigger for infinite scroll */}
                {currentData.hasMore && !currentData.isFetchingMore && (
                  <div ref={loadMoreRef} className="h-10 w-full" />
                )}
              </>
            )}

            {/* Empty State */}
            {!currentData.isLoading && currentData.events.length === 0 && (
              <Card className="text-center py-12">
                <CardHeader>
                  <CardTitle>No Events Found</CardTitle>
                  <CardDescription>
                    No events available at the moment.
                  </CardDescription>
                </CardHeader>
              </Card>
            )}
          </>
        )}

        {/* Features Section */}
        <div className="border-t border-foreground/10 pt-8 mt-12">
          <h3 className="text-xl font-semibold mb-4">Why Polycaster?</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Trophy className="h-5 w-5 text-blue-500" />
                </div>
                <h4 className="font-semibold">Prediction Markets</h4>
              </div>
              <p className="text-sm text-muted-foreground">
                Trade on real-world events across sports, politics, crypto, and
                more
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <Zap className="h-5 w-5 text-purple-500" />
                </div>
                <h4 className="font-semibold">Powered by Polymarket</h4>
              </div>
              <p className="text-sm text-muted-foreground">
                Built on the world's largest prediction market platform
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <MessageSquare className="h-5 w-5 text-green-500" />
                </div>
                <h4 className="font-semibold">Farcaster Integration</h4>
              </div>
              <p className="text-sm text-muted-foreground">
                Share and discuss predictions with the Farcaster community
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t mt-12 py-8">
        <div className="px-4 md:px-6 lg:px-8 text-center text-sm text-muted-foreground">
          <p>Powered by Reown AppKit & Polymarket</p>
        </div>
      </footer>
    </div>
  );
}
