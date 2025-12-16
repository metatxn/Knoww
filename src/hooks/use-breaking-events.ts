import { useInfiniteQuery } from "@tanstack/react-query";

interface BreakingEvent {
  id: string;
  slug: string;
  title: string;
  description?: string;
  image?: string;
  startDate?: string;
  endDate?: string;
  active?: boolean;
  closed?: boolean;
  volume?: string;
  liquidity?: string;
  markets?: Array<{
    id: string;
    question: string;
    slug?: string;
  }>;
  negRisk?: boolean;
  enableNegRisk?: boolean;
  negRiskAugmented?: boolean;
}

interface BreakingEventsResponse {
  success: boolean;
  data?: BreakingEvent[];
  pagination?: {
    hasMore: boolean;
    totalResults: number;
  };
  error?: string;
}

export function useBreakingEvents(limit = 15) {
  return useInfiniteQuery({
    queryKey: ["breaking-events", limit],
    queryFn: async ({ pageParam = 0 }) => {
      const response = await fetch(
        `/api/events/breaking?limit=${limit}&offset=${pageParam}`,
      );

      if (!response.ok) {
        throw new Error("Failed to fetch breaking events");
      }

      const result = (await response.json()) as BreakingEventsResponse;

      if (!result.success) {
        throw new Error(result.error || "Failed to fetch breaking events");
      }

      return {
        events: result.data || [],
        nextOffset: result.pagination?.hasMore ? pageParam + limit : undefined,
        totalResults: result.pagination?.totalResults || 0,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    initialPageParam: 0,
    staleTime: 60 * 1000, // 1 minute
    refetchOnWindowFocus: false,
  });
}
