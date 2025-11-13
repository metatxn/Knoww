import { useInfiniteQuery } from "@tanstack/react-query";

interface PaginatedEvent {
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

interface PaginatedEventsResponse {
  success: boolean;
  data?: PaginatedEvent[];
  pagination?: {
    hasMore: boolean;
    totalResults: number;
  };
  error?: string;
}

interface UsePaginatedEventsParams {
  tagSlug?: string; // Now optional
  limit?: number;
  active?: boolean;
  archived?: boolean;
  closed?: boolean;
  order?: string;
  ascending?: boolean;
}

export function usePaginatedEvents({
  tagSlug,
  limit = 20,
  active = true,
  archived = false,
  closed = false,
  order = "volume24hr",
  ascending = false,
}: UsePaginatedEventsParams = {}) {
  return useInfiniteQuery({
    queryKey: [
      "events",
      "paginated",
      tagSlug || "all",
      limit,
      active,
      archived,
      closed,
      order,
      ascending,
    ],
    queryFn: async ({ pageParam = 0 }) => {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: pageParam.toString(),
        active: active.toString(),
        archived: archived.toString(),
        closed: closed.toString(),
        order,
        ascending: ascending.toString(),
      });

      // Only add tag_slug if provided
      if (tagSlug) {
        params.set("tag_slug", tagSlug);
      }

      const response = await fetch(
        `/api/events/paginated?${params.toString()}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch paginated events");
      }

      const result = (await response.json()) as PaginatedEventsResponse;

      if (!result.success) {
        throw new Error(result.error || "Failed to fetch paginated events");
      }

      return {
        events: result.data || [],
        nextOffset: result.pagination?.hasMore ? pageParam + limit : undefined,
        totalResults: result.pagination?.totalResults || 0,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    initialPageParam: 0,
    staleTime: 60000, // 1 minute
    refetchOnWindowFocus: false,
  });
}
