"use client";

import { motion } from "framer-motion";
import { ArrowLeft, Loader2, RefreshCw, TrendingUp } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { Navbar } from "@/components/navbar";
import { NegRiskBadge } from "@/components/neg-risk-badge";
import { Badge } from "@/components/ui/badge";
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

interface Event {
  id: string;
  slug: string;
  title: string;
  description?: string;
  image?: string;
  startDate?: string;
  endDate?: string;
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  volume?: string;
  liquidity?: string;
  markets?: Array<{
    id: string;
    question: string;
  }>;
  tags?: Array<string | { id?: string; slug?: string; label?: string }>;
  negRisk?: boolean;
  enableNegRisk?: boolean;
  negRiskAugmented?: boolean;
}

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
      { threshold: 0.1 }
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
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            className="mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>

          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-4xl font-bold mb-2">{tagLabel} Events</h1>
              <p className="text-muted-foreground">
                Browse live prediction events for {tagLabel.toLowerCase()}
              </p>
              {tagDetails?.description && (
                <p className="text-sm text-muted-foreground mt-2">
                  {tagDetails.description}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-2">Refresh</span>
          </Button>
        </div>

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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <Card key={`skeleton-${i}`}>
                <CardHeader>
                  <Skeleton className="h-48 w-full mb-4 rounded" />
                  <Skeleton className="h-6 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-full" />
                </CardHeader>
              </Card>
            ))}
          </div>
        )}

        {/* Events List */}
        {!isLoading && !error && (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              Showing {events.length} active event
              {events.length !== 1 ? "s" : ""}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {events.map((event, index) => (
                <EventCard
                  key={`${event.id}-${index}`}
                  event={event}
                  index={index}
                />
              ))}
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
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-6"
              >
                {[...Array(4)].map((_, i) => (
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

function EventCard({ event, index }: { event: Event; index?: number }) {
  const router = useRouter();

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

  const handleViewEvent = () => {
    if (event.id) {
      router.push(`/events/detail/${event.id}`);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: (index || 0) * 0.05 }}
      whileHover={{ y: -4 }}
      className="h-full"
    >
      <Card
        className="cursor-pointer transition-all h-full hover:shadow-lg"
        onClick={handleViewEvent}
      >
        {event.image && (
          <div className="aspect-video w-full overflow-hidden rounded-t-lg">
            <img
              src={event.image}
              alt={event.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}
        <CardHeader>
          <div className="flex items-center gap-2 mb-2">
            <Badge>Active</Badge>
            {event.negRisk && <NegRiskBadge />}
          </div>
          <CardTitle className="line-clamp-2">
            {event.title || "Untitled Event"}
          </CardTitle>
          {event.description && (
            <CardDescription className="line-clamp-2">
              {event.description}
            </CardDescription>
          )}
          <div className="flex items-center justify-between pt-4 text-sm">
            {event.volume && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <TrendingUp className="h-4 w-4" />
                <span>{formatVolume(event.volume)}</span>
              </div>
            )}
            {event.markets && event.markets.length > 0 && (
              <Badge variant="outline">
                {event.markets.length} market
                {event.markets.length !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        </CardHeader>
      </Card>
    </motion.div>
  );
}
