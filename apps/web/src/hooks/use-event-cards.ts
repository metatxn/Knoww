import { useInfiniteQuery } from "@tanstack/react-query";
import { EVENT_CARD_PAGE_SIZE } from "@/lib/event-feed-config";
import { fetchJson } from "@/lib/fetch-json";
import type { CardFeedQuery } from "@/polymarket/card-feed-query";
import type { EventCardData } from "@/polymarket/event-card-projection";
import type { EventFilterParams } from "./use-paginated-events";

interface CardFeedResponse {
  data: EventCardData[];
  pagination: { nextCursor?: string; totalResults?: number };
  freshness: { generatedAt: number; stale: boolean };
}

export function useEventCards({
  feed,
  tagSlug,
  limit = EVENT_CARD_PAGE_SIZE,
  closed = false,
  order = "volume24hr",
  ascending = false,
  filters,
  enabled = true,
}: {
  feed: CardFeedQuery["feed"];
  tagSlug?: string;
  limit?: number;
  closed?: boolean;
  order?: string;
  ascending?: boolean;
  filters?: EventFilterParams;
  enabled?: boolean;
}) {
  const params = new URLSearchParams({
    feed,
    limit: String(limit),
    closed: String(closed),
    order,
    ascending: String(ascending),
  });
  if (tagSlug) params.set("tag_slug", tagSlug);
  const optional = {
    volume24hr_min: filters?.volume24hrMin,
    volume1wk_min: filters?.volumeWeeklyMin,
    liquidity_min: filters?.liquidityMin,
    live: filters?.live || undefined,
    start_date_min: filters?.startDateFrom,
    start_date_max: filters?.startDateTo,
    end_date_min: filters?.endDateFrom,
    end_date_max: filters?.endDateTo,
  };
  for (const [key, value] of Object.entries(optional)) {
    if (value !== undefined && value !== null && value !== "")
      params.set(key, String(value));
  }
  const query = useInfiniteQuery({
    queryKey: ["events", "cards-v1", params.toString()],
    queryFn: async ({ pageParam, signal }) => {
      const requestParams = new URLSearchParams(params);
      if (pageParam) requestParams.set("after_cursor", pageParam);
      const result = await fetchJson<CardFeedResponse>(
        `/api/events/cards?${requestParams}`,
        { signal }
      );
      return {
        events: result.data,
        nextCursor: result.pagination.nextCursor,
        totalResults: result.pagination.totalResults,
        ...result.freshness,
      };
    },
    initialPageParam: "",
    getNextPageParam: (page) => page.nextCursor,
    select: (data) => {
      const seen = new Set<string>();
      return {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          events: page.events.filter((event) => {
            if (seen.has(event.id)) return false;
            seen.add(event.id);
            return true;
          }),
        })),
      };
    },
    staleTime: 60_000,
    refetchInterval: (query) =>
      query.state.data?.pages.some((page) => page.stale) ? 15_000 : false,
    refetchOnWindowFocus: false,
    enabled,
  });
  return {
    ...query,
    dataUpdatedAt: query.data?.pages[0]?.generatedAt ?? query.dataUpdatedAt,
    feedStale: query.data?.pages.some((page) => page.stale) ?? false,
  };
}
