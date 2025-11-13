import { useQuery } from "@tanstack/react-query";

interface Market {
  id: string;
  question: string;
  groupItemTitle?: string;
  slug?: string;
  description?: string;
  image?: string;
  outcomes?: string;
  outcomePrices?: string;
  volume?: string;
  liquidity?: string;
  active?: boolean;
  closed?: boolean;
  createdAt?: string;
}

interface Event {
  id: string;
  slug: string;
  title: string;
  description?: string;
  image?: string;
  startDate?: string;
  endDate?: string;
  createdAt?: string;
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  tags?: string[];
  markets?: Market[];
  marketCount?: number;
  volume?: string;
  liquidity?: string;
  negRisk?: boolean;
  enableNegRisk?: boolean;
  negRiskAugmented?: boolean;
}

interface EventDetailResponse {
  success: boolean;
  event: Event;
  error?: string;
}

/**
 * Fetch event details by ID including all associated markets
 */
async function fetchEventDetail(id: string | undefined): Promise<Event | null> {
  if (!id) return null;

  const response = await fetch(`/api/events/${id}`);

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Event not found");
    }
    throw new Error("Failed to fetch event details");
  }

  const data: EventDetailResponse = await response.json();

  if (!data.success) {
    throw new Error(data.error || "Failed to fetch event details");
  }

  return data.event;
}

/**
 * Hook to fetch event details by ID
 *
 * @param id - Event ID
 * @returns TanStack Query result with event data including markets
 */
export function useEventDetail(id: string | undefined) {
  return useQuery({
    queryKey: ["events", "detail", id],
    queryFn: () => fetchEventDetail(id),
    enabled: !!id,
    staleTime: 60 * 1000, // 1 minute
    refetchOnWindowFocus: false,
  });
}
