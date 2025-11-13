import { useQuery } from "@tanstack/react-query";

interface TrendingEvent {
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

interface TrendingEventsResponse {
  success: boolean;
  count: number;
  events: TrendingEvent[];
  error?: string;
}

export function useTrendingEvents(limit = 12) {
  return useQuery<TrendingEventsResponse, Error>({
    queryKey: ["trending-events", limit],
    queryFn: async () => {
      const response = await fetch(`/api/events/trending?limit=${limit}`);

      if (!response.ok) {
        throw new Error("Failed to fetch trending events");
      }

      return response.json();
    },
    staleTime: 60 * 1000, // 1 minute
    refetchOnWindowFocus: false,
  });
}
