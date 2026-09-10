import type { SearchResponseData } from "@knoww/services/platforms/polymarket";
import { getPlatformRegistry } from "@/lib/platform-registry";

/**
 * The `/api/search` composition: Gamma's public search merged with the
 * tag-scoped keyset lists, plus the `degraded` and `truncated` flags the
 * extension and the scoped search page act on. Tag-scoped search and the
 * degraded signal have no canonical counterpart yet, and both consumers read
 * the events as Gamma sends them, so this composes the platform client
 * directly, which is what this folder is for. The payload is served as-is.
 */
export function searchPolymarket(
  query: string,
  limit: number,
  tagSlugs: string[],
  options?: { signal?: AbortSignal }
): Promise<SearchResponseData> {
  const { client } = getPlatformRegistry().getPlatformAdapter("polymarket");
  return client.fetchAggregatedSearchData(query, limit, tagSlugs, options);
}

export {
  buildEmptySearchResponse,
  DEFAULT_SEARCH_LIMIT,
  MAX_SEARCH_LIMIT,
  type SearchResponseData,
} from "@knoww/services/platforms/polymarket";
