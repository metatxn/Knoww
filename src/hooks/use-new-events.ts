import { useQuery } from "@tanstack/react-query";

interface NewEvent {
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

interface NewEventsResponse {
  success: boolean;
  count: number;
  events: NewEvent[];
  error?: string;
}

export function useNewEvents(limit = 12) {
  return useQuery<NewEventsResponse, Error>({
    queryKey: ["new-events", limit],
    queryFn: async () => {
      const response = await fetch(`/api/events/new?limit=${limit}`);

      if (!response.ok) {
        throw new Error("Failed to fetch new events");
      }

      return response.json();
    },
    staleTime: 60 * 1000, // 1 minute
    refetchOnWindowFocus: false,
  });
}
