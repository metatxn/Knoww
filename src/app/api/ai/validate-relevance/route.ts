import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, Output } from "ai";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/api-rate-limit";

const AI_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;

const ValidationSchema = z.object({
  relevant: z
    .boolean()
    .describe("Whether the market is genuinely relevant to the post"),
  reason: z
    .string()
    .max(80)
    .describe(
      "A short, user-facing reason explaining the connection (e.g., 'Post discusses Bitcoin price')"
    ),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("How confident you are in this relevance judgment"),
});

const SYSTEM_PROMPT = `You are a relevance judge for a prediction market Chrome extension.

Given a social media post and a prediction market title, decide whether the market is genuinely relevant to what the post is discussing.

Rules:
1. The market must be DIRECTLY related to the topic of the post — not just loosely associated.
2. Sharing a single common word (like "golden", "cup", "race") is NOT enough. The actual subject matter must match.
3. A post about food promotions is NOT relevant to entertainment awards, even if both contain "golden".
4. A post about a sports team is NOT relevant to a political market just because both mention the same city.
5. If the market IS relevant, write a short (under 80 chars) reason that a user would understand, like "Post discusses Bitcoin price target" or "Mentions Trump's tariff policy".
6. If the market is NOT relevant, set reason to an empty string.
7. Be strict. When in doubt, mark as NOT relevant. False positives hurt user trust more than false negatives.`;

interface ValidationResponse {
  relevant: boolean;
  reason: string;
  confidence: number;
  cached?: boolean;
  durationMs?: number;
  error?: string;
}

interface CacheEntry {
  value: ValidationResponse;
  cachedAt: number;
}

const cache = new Map<string, CacheEntry>();

function getCacheKey(postText: string, marketTitle: string): string {
  const p = postText.toLowerCase().slice(0, 300);
  const m = marketTitle.toLowerCase().slice(0, 150);
  return `${p}|||${m}`;
}

function getCached(
  postText: string,
  marketTitle: string
): ValidationResponse | null {
  const key = getCacheKey(postText, marketTitle);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return { ...entry.value, cached: true, durationMs: 0 };
}

function setCache(
  postText: string,
  marketTitle: string,
  value: ValidationResponse
): void {
  const key = getCacheKey(postText, marketTitle);

  // Evict expired entries when near capacity
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const now = Date.now();
    for (const [k, v] of cache.entries()) {
      if (now - v.cachedAt > CACHE_TTL_MS) cache.delete(k);
    }
    // If still too large, remove oldest
    while (cache.size >= CACHE_MAX_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  }

  cache.set(key, {
    value: { ...value, cached: undefined, durationMs: undefined },
    cachedAt: Date.now(),
  });
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  msg: string
): Promise<T> {
  let tid: ReturnType<typeof setTimeout> | null = null;
  try {
    const tp = new Promise<T>((_, reject) => {
      tid = setTimeout(() => reject(new Error(msg)), timeoutMs);
    });
    return await Promise.race([promise, tp]);
  } finally {
    if (tid) clearTimeout(tid);
  }
}

async function validateRelevance(
  postText: string,
  marketTitle: string,
  marketTags: string[]
): Promise<ValidationResponse> {
  const startedAt = Date.now();

  const cached = getCached(postText, marketTitle);
  if (cached) return cached;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return {
      relevant: true,
      reason: "",
      confidence: 0,
      error: "AI service not configured",
      durationMs: Date.now() - startedAt,
    };
  }

  try {
    const openrouter = createOpenRouter({ apiKey });
    const tagsStr =
      marketTags.length > 0 ? `\nMarket tags: ${marketTags.join(", ")}` : "";

    const aiResult = await withTimeout(
      generateText({
        model: openrouter.chat("google/gemini-3-flash-preview"),
        output: Output.object({ schema: ValidationSchema }),
        system: SYSTEM_PROMPT,
        prompt: `Social media post:
<<<POST>>>
${postText.slice(0, 400)}
<<<END_POST>>>

Prediction market title: "${marketTitle}"${tagsStr}

Is this market relevant to what the post is discussing?`,
        temperature: 0.1,
        maxOutputTokens: 150,
      }),
      AI_TIMEOUT_MS,
      "Validation timeout"
    );

    const output = aiResult.output;
    if (!output) {
      return {
        relevant: true,
        reason: "",
        confidence: 0,
        error: "AI response missing",
        durationMs: Date.now() - startedAt,
      };
    }

    const response: ValidationResponse = {
      relevant: output.relevant,
      reason: output.relevant ? output.reason : "",
      confidence: output.confidence ?? 0,
      durationMs: Date.now() - startedAt,
    };

    setCache(postText, marketTitle, response);
    return response;
  } catch (error) {
    const isTimeout =
      error instanceof Error && error.message === "Validation timeout";
    console.error("Validate relevance error:", { isTimeout, error });
    // On failure, allow the market through (fail-open)
    return {
      relevant: true,
      reason: "",
      confidence: 0,
      error: isTimeout ? "timeout" : "provider-error",
      durationMs: Date.now() - startedAt,
    };
  }
}

export async function POST(request: NextRequest) {
  const rateLimitResponse = checkRateLimit(request, {
    uniqueTokenPerInterval: 30,
  });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = (await request.json()) as {
      postText?: string;
      marketTitle?: string;
      marketTags?: string[];
    };

    if (
      !body.postText ||
      typeof body.postText !== "string" ||
      !body.marketTitle ||
      typeof body.marketTitle !== "string"
    ) {
      return NextResponse.json(
        { error: "Missing 'postText' or 'marketTitle'" },
        { status: 400 }
      );
    }

    const result = await validateRelevance(
      body.postText,
      body.marketTitle,
      body.marketTags || []
    );
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("Validate relevance request error:", error);
    return NextResponse.json(
      { relevant: true, reason: "", confidence: 0, error: "Invalid request" },
      { status: 400 }
    );
  }
}
