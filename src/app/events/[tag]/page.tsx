"use client";

import { motion } from "framer-motion";
import { ChevronLeft, Loader2, RefreshCw } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { EventCard } from "@/components/event-card";
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
import { usePaginatedEvents } from "@/hooks/use-paginated-events";
import { useTagDetails } from "@/hooks/use-tag-details";

export default function TagEventsPage() {
  const router = useRouter();
  const params = useParams();

  const tagSlug = params?.tag as string;

  // Fetch tag details for display name
  const {
    data: tagDetails,
    isLoading: loadingTag,
    error: tagError,
  } = useTagDetails(tagSlug);

  // Fetch paginated events using tag_slug
  const {
    data,
    isLoading: loadingEvents,
    error: eventsError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = usePaginatedEvents({
    tagSlug,
    limit: 20,
    active: true,
    archived: false,
    closed: false,
    order: "volume24hr",
    ascending: false,
  });

  // Reference for infinite scroll observer
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Infinite scroll: auto-load more when reaching bottom
  useEffect(() => {
    if (!loadMoreRef.current || !hasNextPage || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(loadMoreRef.current);

    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Flatten all pages into a single events array
  const events = data?.pages.flatMap((page) => page.events) || [];
  const error = tagError?.message || eventsError?.message;
  const isLoading = loadingTag || loadingEvents;

  // Format tag name for display - capitalize first letter of each word
  const formatTagLabel = (label: string) => {
    return label
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  };

  const tagLabel = tagDetails?.label
    ? formatTagLabel(tagDetails.label)
    : tagSlug
      ? formatTagLabel(tagSlug.replace(/-/g, " "))
      : "Markets";

  return (
    <div className="min-h-screen bg-linear-to-b from-slate-50 via-white to-slate-50 dark:from-background dark:via-background dark:to-background relative overflow-x-hidden selection:bg-purple-500/30">
      <PageBackground />

      <Navbar />

      <main className="relative z-10 px-4 md:px-6 lg:px-8 py-6">
        {/* Breadcrumb Navigation */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>All Markets</span>
          </button>
          <span>/</span>
          <span className="text-foreground font-medium">{tagLabel}</span>
        </div>

        {/* Header Row */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div className="space-y-2">
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
              <h1 className="text-3xl md:text-4xl font-black tracking-tight">
                {tagLabel}
              </h1>
            </div>
            <p className="text-muted-foreground">
              Browse live prediction markets for {tagLabel.toLowerCase()}
            </p>
            {tagDetails?.description && (
              <p className="text-sm text-muted-foreground/80 max-w-2xl">
                {tagDetails.description}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
              className="gap-2"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh
            </Button>
          </div>
        </div>

        {/* Stats Bar */}
        {!isLoading && !error && events.length > 0 && (
          <div className="flex items-center gap-4 py-3 px-4 rounded-xl bg-card/60 dark:bg-card/40 backdrop-blur-sm border border-border/40 mb-6">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-transparent bg-clip-text bg-linear-to-r from-violet-600 to-purple-600 dark:from-violet-400 dark:to-purple-400">
                {events.length}
              </span>
              <span className="text-sm text-muted-foreground">
                active market{events.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">
                Error Loading Events
              </CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
          </Card>
        )}

        {/* Loading State */}
        {isLoading && !error && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
            {[...Array(10)].map((_, i) => (
              <div
                key={`skeleton-${i}`}
                className="rounded-2xl bg-card border border-border/50 overflow-hidden"
              >
                <Skeleton className="aspect-16/10 w-full" />
                <div className="p-4 space-y-3">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Events List */}
        {!isLoading && !error && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
              {events.map(
                (
                  event: {
                    id: string;
                    slug?: string;
                    title: string;
                    description?: string;
                    image?: string;
                    volume?: string;
                    active?: boolean;
                    closed?: boolean;
                    negRisk?: boolean;
                    markets?: Array<{ id: string; question: string }>;
                  },
                  index: number,
                ) => (
                  <EventCard
                    key={`${event.id}-${index}`}
                    event={event}
                    index={index}
                  />
                ),
              )}
            </div>

            {events.length === 0 && (
              <Card className="text-center py-12">
                <CardHeader>
                  <CardTitle>No Events Found</CardTitle>
                  <CardDescription>
                    No active events found for this category at the moment.
                  </CardDescription>
                  <div className="mt-4">
                    <Button onClick={() => router.push("/")}>
                      Explore Other Categories
                    </Button>
                  </div>
                </CardHeader>
              </Card>
            )}

            {/* Loading skeleton for next page */}
            {isFetchingNextPage && (
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
                    <Card className="overflow-hidden">
                      <CardHeader className="space-y-4">
                        <Skeleton className="h-48 w-full rounded animate-pulse" />
                        <div className="space-y-3">
                          <Skeleton className="h-6 w-3/4 animate-pulse" />
                          <Skeleton className="h-4 w-full animate-pulse" />
                          <Skeleton className="h-4 w-5/6 animate-pulse" />
                        </div>
                        <div className="flex gap-2 pt-2">
                          <Skeleton className="h-6 w-16 rounded-full animate-pulse" />
                          <Skeleton className="h-6 w-20 rounded-full animate-pulse" />
                        </div>
                        <Skeleton className="h-10 w-full rounded animate-pulse" />
                      </CardHeader>
                    </Card>
                  </motion.div>
                ))}
              </motion.div>
            )}

            {/* Invisible trigger for infinite scroll */}
            {hasNextPage && !isFetchingNextPage && (
              <div ref={loadMoreRef} className="h-10 w-full" />
            )}
          </>
        )}
      </main>
    </div>
  );
}
