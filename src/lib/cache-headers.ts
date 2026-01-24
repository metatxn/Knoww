/**
 * Cache Headers Utility for Cloudflare Workers
 *
 * Cloudflare Workers use the Cache-Control header to determine how to cache
 * responses at the edge. This utility provides consistent cache headers
 * for different types of data.
 *
 * Key concepts:
 * - s-maxage: Cache lifetime at CDN/edge (Cloudflare)
 * - max-age: Cache lifetime in browser
 * - stale-while-revalidate: Serve stale content while fetching fresh
 * - stale-if-error: Serve stale content if origin fails
 */

export type CacheProfile =
  | "static" // Long-lived data (tags, categories)
  | "events" // Event data (1 minute)
  | "realtime" // Price data, order books (10 seconds)
  | "user" // User-specific data (no cache)
  | "leaderboard"; // Leaderboard data (1 minute)

interface CacheConfig {
  maxAge: number; // Browser cache (seconds)
  sMaxAge: number; // CDN/Edge cache (seconds)
  staleWhileRevalidate: number;
  staleIfError: number;
  isPrivate: boolean;
}

const CACHE_PROFILES: Record<CacheProfile, CacheConfig> = {
  static: {
    maxAge: 300, // 5 minutes in browser
    sMaxAge: 3600, // 1 hour at edge
    staleWhileRevalidate: 86400, // 24 hours
    staleIfError: 86400, // 24 hours
    isPrivate: false,
  },
  events: {
    maxAge: 30, // 30 seconds in browser
    sMaxAge: 60, // 1 minute at edge
    staleWhileRevalidate: 120, // 2 minutes
    staleIfError: 300, // 5 minutes
    isPrivate: false,
  },
  realtime: {
    maxAge: 5, // 5 seconds in browser
    sMaxAge: 10, // 10 seconds at edge
    staleWhileRevalidate: 30, // 30 seconds
    staleIfError: 60, // 1 minute
    isPrivate: false,
  },
  leaderboard: {
    maxAge: 30, // 30 seconds in browser
    sMaxAge: 60, // 1 minute at edge
    staleWhileRevalidate: 120, // 2 minutes
    staleIfError: 300, // 5 minutes
    isPrivate: false,
  },
  user: {
    maxAge: 0,
    sMaxAge: 0,
    staleWhileRevalidate: 0,
    staleIfError: 0,
    isPrivate: true, // User data should never be cached at edge
  },
};

/**
 * Get cache headers for a specific profile
 */
export function getCacheHeaders(profile: CacheProfile): HeadersInit {
  const config = CACHE_PROFILES[profile];

  if (config.isPrivate) {
    return {
      "Cache-Control": "private, no-store, must-revalidate",
    };
  }

  return {
    "Cache-Control": [
      "public",
      `max-age=${config.maxAge}`,
      `s-maxage=${config.sMaxAge}`,
      `stale-while-revalidate=${config.staleWhileRevalidate}`,
      `stale-if-error=${config.staleIfError}`,
    ].join(", "),
    // Cloudflare-specific header for edge caching
    "CDN-Cache-Control": `max-age=${config.sMaxAge}`,
  };
}

/**
 * Create a cached JSON response
 */
export function cachedJsonResponse(
  data: unknown,
  profile: CacheProfile,
  status = 200
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...getCacheHeaders(profile),
    },
  });
}

/**
 * Add cache headers to an existing NextResponse
 */
export function addCacheHeaders(headers: Headers, profile: CacheProfile): void {
  const cacheHeaders = getCacheHeaders(profile);
  for (const [key, value] of Object.entries(cacheHeaders)) {
    headers.set(key, value);
  }
}
