import { isUpstreamPublicDataError } from "@knoww/services/platforms/polymarket";
import { BoundedJsonError } from "@knoww/shared-types/bounded-json";
import { CACHE_DURATION } from "@/constants/polymarket";
import { PRIORITY_EVENT_CARD_COUNT } from "@/lib/lcp-images";
import { getPlatformRegistry } from "@/lib/platform-registry";

export interface SportsInitialEvents {
  events: Array<{ id: string; image?: string }>;
}

/** Inventory for sports SEO and preloads; the browser owns the full feed. */
export async function fetchSportsInitialEvents(
  tagSlug: string,
  seriesId?: number
): Promise<SportsInitialEvents> {
  const { client } = getPlatformRegistry().getPlatformAdapter("polymarket");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8500);
  let limit = PRIORITY_EVENT_CARD_COUNT;
  try {
    while (true) {
      try {
        const page = await client.fetchEventPage(
          {
            limit,
            closed: false,
            order: "volume24hr",
            ascending: false,
            ...(seriesId
              ? { seriesIds: [seriesId], active: true }
              : { tagSlug }),
          },
          {
            signal: controller.signal,
            cache: { revalidateSeconds: CACHE_DURATION.EVENTS },
          }
        );
        return {
          events: page.rawEvents.map((event) => ({
            id: String(event.id),
            ...(typeof event.image === "string" ? { image: event.image } : {}),
          })),
        };
      } catch (error) {
        if (
          controller.signal.aborted ||
          limit <= 1 ||
          !isUpstreamPublicDataError(error) ||
          !(error.cause instanceof BoundedJsonError) ||
          error.cause.reason !== "too_large"
        )
          throw error;
        limit = Math.max(1, Math.floor(limit / 2));
      }
    }
  } finally {
    clearTimeout(timer);
  }
}
