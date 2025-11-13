/**
 * Simple in-memory rate limiter for API routes
 * In production, consider using Redis or a dedicated rate limiting service
 */

interface RateLimitStore {
  count: number;
  resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitStore>();

interface RateLimitOptions {
  interval: number; // Time window in milliseconds
  uniqueTokenPerInterval: number; // Max requests per interval
}

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";
  }
}

/**
 * Rate limiter using token bucket algorithm
 * @param uniqueId - Unique identifier (e.g., IP address, user ID)
 * @param options - Rate limit configuration
 * @returns true if request is allowed, false otherwise
 */
export function rateLimit(
  uniqueId: string,
  options: RateLimitOptions = {
    interval: 60 * 1000, // 1 minute
    uniqueTokenPerInterval: 60, // 60 requests per minute
  },
): { success: boolean; limit: number; remaining: number; reset: number } {
  const now = Date.now();
  const store = rateLimitMap.get(uniqueId);

  // If no store exists or reset time has passed, create new store
  if (!store || now > store.resetTime) {
    const resetTime = now + options.interval;
    rateLimitMap.set(uniqueId, {
      count: 1,
      resetTime,
    });

    return {
      success: true,
      limit: options.uniqueTokenPerInterval,
      remaining: options.uniqueTokenPerInterval - 1,
      reset: resetTime,
    };
  }

  // Increment count
  store.count += 1;

  // Check if limit exceeded
  if (store.count > options.uniqueTokenPerInterval) {
    return {
      success: false,
      limit: options.uniqueTokenPerInterval,
      remaining: 0,
      reset: store.resetTime,
    };
  }

  return {
    success: true,
    limit: options.uniqueTokenPerInterval,
    remaining: options.uniqueTokenPerInterval - store.count,
    reset: store.resetTime,
  };
}

/**
 * Cleanup old entries periodically to prevent memory leaks
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitMap.entries()) {
    if (now > value.resetTime) {
      rateLimitMap.delete(key);
    }
  }
}, 60 * 1000); // Clean up every minute
