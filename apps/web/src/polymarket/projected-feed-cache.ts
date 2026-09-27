import { createLogger } from "@knoww/logger";

const log = createLogger("projected-feed-cache");

/** Ephemeral per-location caching for arbitrary public filters and continuations. */
export async function withProjectedFeedCache(
  key: string,
  load: () => Promise<Response>,
  ttlSeconds = 60
): Promise<Response> {
  if (ttlSeconds <= 0) return load();
  const cache =
    typeof caches === "undefined"
      ? undefined
      : (caches as CacheStorage & { default?: Cache }).default;
  const request = new Request(`https://knoww.app/__feed-cache/${key}`);
  const cached = await cache?.match(request);
  if (cached) return cached;
  const response = await load();
  if (cache && response.ok && ttlSeconds > 0) {
    response.headers.set("Cache-Control", `public, max-age=${ttlSeconds}`);
    try {
      // Only bounded projections reach this cache. Awaiting avoids detached work
      // and the size is already checked before cloning the response.
      await cache.put(request, response.clone());
    } catch (error) {
      log.warn("write.failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return response;
}
