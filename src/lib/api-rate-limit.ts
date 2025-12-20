import { type NextRequest, NextResponse } from "next/server";
import { rateLimit } from "./rate-limit";

/**
 * Get unique identifier for rate limiting (IP address or fallback)
 */
function getIdentifier(request: NextRequest): string {
  // Try to get real IP from headers (Cloudflare, Vercel, etc.)
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const cfConnectingIp = request.headers.get("cf-connecting-ip");

  return cfConnectingIp || realIp || forwarded?.split(",")[0] || "anonymous";
}

/**
 * Apply rate limiting to an API route
 * Returns a NextResponse with 429 status if rate limit exceeded
 */
export function checkRateLimit(
  request: NextRequest,
  options?: {
    interval?: number;
    uniqueTokenPerInterval?: number;
  }
): NextResponse | null {
  const identifier = getIdentifier(request);

  const rateLimitResult = rateLimit(identifier, {
    interval: options?.interval || 60 * 1000, // Default: 1 minute
    uniqueTokenPerInterval: options?.uniqueTokenPerInterval || 60, // Default: 60 req/min
  });

  // If rate limit exceeded, return 429 response
  if (!rateLimitResult.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Too many requests. Please try again later.",
        rateLimit: {
          limit: rateLimitResult.limit,
          remaining: 0,
          reset: new Date(rateLimitResult.reset).toISOString(),
        },
      },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": rateLimitResult.limit.toString(),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": rateLimitResult.reset.toString(),
          "Retry-After": Math.ceil(
            (rateLimitResult.reset - Date.now()) / 1000
          ).toString(),
        },
      }
    );
  }

  // Rate limit not exceeded, return null to continue
  return null;
}
