"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Activity, Radio, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { EventCard } from "@/components/event-card";
import { EventFilterBar } from "@/components/event-filter-bar";
import { Navbar } from "@/components/navbar";
import { PageBackground } from "@/components/page-background";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePaginatedEvents } from "@/hooks/use-paginated-events";

export default function LiveMarketsPage() {
  const [loadMoreElement, setLoadMoreElement] = useState<HTMLDivElement | null>(
    null
  );

  // Fetch only active (live) markets
  const {
    data: paginatedData,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = usePaginatedEvents({
    limit: 20,
    order: "volume24hr",
    ascending: false,
    active: true,
    closed: false,
  });

  // Flatten paginated data
  const events =
    paginatedData?.pages.flatMap((page) => page.events || page) || [];

  // Infinite scroll
  useEffect(() => {
    if (!loadMoreElement) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        if (hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1, rootMargin: "400px" }
    );

    observer.observe(loadMoreElement);
    return () => observer.disconnect();
  }, [loadMoreElement, hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div className="min-h-screen bg-background relative overflow-x-hidden selection:bg-purple-500/30">
      <PageBackground />
      <Navbar />

      <main className="relative z-10 px-3 sm:px-4 md:px-6 lg:px-8 pt-4 sm:pt-6 pb-24 xl:pb-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex items-center justify-between mb-4 sm:mb-6"
        >
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-xl animate-pulse" />
              <div className="relative flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30">
                <Radio className="h-6 w-6 text-emerald-500" />
              </div>
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight flex items-center gap-2">
                Live Markets
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                </span>
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Active markets currently open for trading
              </p>
            </div>
          </div>

          {/* Market Count - Hidden for now */}
          {/* <div className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <Activity className="h-4 w-4 text-emerald-500" />
            <span className="font-bold text-emerald-600 dark:text-emerald-400">
              {events.length}
            </span>
            <span className="text-sm text-emerald-600/70 dark:text-emerald-400/70">
              live
            </span>
          </div> */}
        </motion.div>

        {/* Filter Bar */}
        <EventFilterBar />

        {/* Content */}
        <AnimatePresence mode="wait">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            {/* Error State */}
            {error && (
              <Card className="border-destructive/50 bg-destructive/5 backdrop-blur-sm mb-6">
                <CardHeader>
                  <CardTitle className="text-destructive flex items-center gap-2">
                    <Sparkles className="h-5 w-5" />
                    Oops! Something went wrong
                  </CardTitle>
                  <CardDescription>
                    {error?.message || "Unable to load live markets"}
                  </CardDescription>
                </CardHeader>
              </Card>
            )}

            {/* Loading State */}
            {isLoading && !error && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-4 md:gap-5">
                {[...Array(10)].map((_, i) => (
                  <motion.div
                    key={`skeleton-${i}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="rounded-2xl sm:rounded-3xl bg-card/30 backdrop-blur-sm border border-border/30 overflow-hidden"
                  >
                    <Skeleton className="aspect-16/10 w-full bg-muted/50" />
                    <div className="p-3 sm:p-5 space-y-3 sm:space-y-4">
                      <Skeleton className="h-5 sm:h-6 w-4/5 rounded-lg sm:rounded-xl bg-muted/50" />
                      <Skeleton className="h-3 sm:h-4 w-full rounded-md sm:rounded-lg bg-muted/30" />
                      <Skeleton className="h-3 sm:h-4 w-2/3 rounded-md sm:rounded-lg bg-muted/30" />
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Events Grid */}
            {!isLoading && events.length > 0 && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-4 md:gap-5">
                  {events.map((event, index) => (
                    <EventCard
                      key={`${event.id}-${index}`}
                      event={event}
                      index={index}
                      priority={index < 4}
                    />
                  ))}
                </div>

                {/* Load More Trigger */}
                {hasNextPage && (
                  <div
                    ref={setLoadMoreElement}
                    className="flex justify-center py-8"
                  >
                    {isFetchingNextPage ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        <span className="text-sm">Loading more...</span>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        Scroll for more
                      </span>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Empty State */}
            {!isLoading && !error && events.length === 0 && (
              <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                <CardHeader className="text-center py-12">
                  <div className="mx-auto w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                    <Radio className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <CardTitle className="text-xl">No Live Markets</CardTitle>
                  <CardDescription className="max-w-sm mx-auto">
                    There are no active markets at the moment. Check back later
                    for new trading opportunities.
                  </CardDescription>
                </CardHeader>
              </Card>
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
