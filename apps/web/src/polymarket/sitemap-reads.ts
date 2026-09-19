import type { EventPageParams } from "@knoww/services/platforms/polymarket";
import { getPlatformRegistry } from "@/lib/platform-registry";
import { fetchKeysetEventPage } from "./event-reads";

const SITEMAP_PAGE_LIMIT = 100;
// Keep the sitemap focused on canonical, high-value URLs. The app can browse
// the full catalog, but SEO should not ask crawlers to revisit thousands of
// low-volume or duplicate market detail URLs every hour.
const SITEMAP_MAX_EVENTS = 1000;
const DURABLE_PENDING_SITEMAP_MAX_EVENTS = 500;
const EVERGREEN_SITEMAP_MAX_EVENTS = 500;
const RECENT_CLOSED_SITEMAP_MAX_EVENTS = 500;

export type SitemapMarketKind = "active" | "evergreen";

export type SitemapEvent = {
  slug?: string;
  title?: string;
  description?: string;
  volume?: string | number;
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  ended?: boolean;
  parentEventId?: string | number | null;
  marketCount?: number;
  markets?: Array<{
    id?: string | number;
    active?: boolean;
    closed?: boolean;
    outcomePrices?: string | null;
    umaResolutionStatus?: string | null;
    umaResolutionStatuses?: string | null;
  }>;
  updatedAt?: string;
};

/** Keep Gamma filters and cursor paging in the Polymarket escape-hatch folder. */
export async function readSitemapEventPages<T>(
  kind: SitemapMarketKind,
  mapPage: (events: SitemapEvent[]) => T[]
): Promise<T[]> {
  if (!getPlatformRegistry().getEnabledPlatforms().includes("polymarket")) {
    return [];
  }

  const results = await Promise.all(
    buildSitemapEventQueries(kind).map(async ({ params, maxItems }) => {
      const items: T[] = [];
      let sourceItemCount = 0;
      let cursor: string | undefined;
      const seenCursors = new Set<string>();

      while (sourceItemCount < maxItems) {
        const page = await fetchKeysetEventPage(
          { ...params, cursor },
          { revalidateSeconds: 0 }
        );
        if (page.rawEvents.length === 0) break;

        // The client validates the records. Preserve the raw fields, including
        // omitted markets and outcomePrices, for the existing SEO policy.
        const events = page.rawEvents.slice(
          0,
          maxItems - sourceItemCount
        ) as SitemapEvent[];
        items.push(...mapPage(events));
        sourceItemCount += events.length;

        if (!page.nextCursor || seenCursors.has(page.nextCursor)) break;
        seenCursors.add(page.nextCursor);
        cursor = page.nextCursor;
      }
      return items;
    })
  );
  return results.flat();
}

export function buildSitemapEventQueries(
  kind: SitemapMarketKind = "active"
): Array<{ params: EventPageParams; maxItems: number }> {
  if (kind === "evergreen") {
    return [
      {
        params: {
          closed: true,
          archived: false,
          order: "volume",
          ascending: false,
          limit: SITEMAP_PAGE_LIMIT,
        },
        maxItems: EVERGREEN_SITEMAP_MAX_EVENTS,
      },
      {
        // Give recent results a discovery path even when their total volume
        // cannot compete with the largest historical events.
        params: {
          closed: true,
          archived: false,
          order: "closedTime",
          ascending: false,
          limit: SITEMAP_PAGE_LIMIT,
        },
        maxItems: RECENT_CLOSED_SITEMAP_MAX_EVENTS,
      },
    ];
  }

  return [
    {
      params: {
        active: true,
        closed: false,
        archived: false,
        order: "volume24hr",
        ascending: false,
        limit: SITEMAP_PAGE_LIMIT,
      },
      maxItems: SITEMAP_MAX_EVENTS,
    },
    {
      // A finished event can remain closed=false while settlement is pending,
      // but its 24-hour volume quickly becomes zero. A total-volume pass keeps
      // substantial pending/disputed pages discoverable during that interval.
      params: {
        closed: false,
        archived: false,
        order: "volume",
        ascending: false,
        limit: SITEMAP_PAGE_LIMIT,
      },
      maxItems: DURABLE_PENDING_SITEMAP_MAX_EVENTS,
    },
  ];
}
