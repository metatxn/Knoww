import { useQuery } from "@tanstack/react-query";

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
  count: number;
  events: BreakingEvent[];
  error?: string;
}

export function useBreakingEvents(limit = 12) {
  return useQuery<BreakingEventsResponse, Error>({
    queryKey: ["breaking-events", limit],
    queryFn: async () => {
      const response = await fetch(`/api/events/breaking?limit=${limit}`);

      if (!response.ok) {
        throw new Error("Failed to fetch breaking events");
      }

      return response.json();
    },
    staleTime: 60 * 1000, // 1 minute
    refetchOnWindowFocus: false,
  });
}
