import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, Output } from "ai";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/api-rate-limit";

// Schema for the AI response
const TopicExtractionSchema = z.object({
  category: z
    .enum([
      "politics",
      "sports",
      "crypto",
      "tech",
      "entertainment",
      "economy",
      "science",
      "other",
    ])
    .describe("The main category of the post"),
  entities: z
    .array(z.string())
    .max(5)
    .describe("Specific people, teams, companies, or events mentioned"),
  tags: z
    .array(z.string())
    .max(4)
    .describe("Relevant Polymarket tag slugs for searching"),
  searchQuery: z
    .string()
    .max(100)
    .describe("Optimized 3-6 word search query for Polymarket"),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Confidence score for the extraction (0-1)"),
});

// Common Polymarket tags for reference in the prompt
const POLYMARKET_TAGS = [
  // Politics
  "trump",
  "modi",
  "narendra-modi",
  "putin",
  "vladimir-putin",
  "zelensky",
  "volodymyr-zelensky",
  "biden",
  "elections",
  "us-politics",
  "congress",
  "supreme-court",
  "2024-election",
  "2026-election",
  "republicans",
  "democrats",
  // Sports
  "nfl",
  "nba",
  "mlb",
  "soccer",
  "tennis",
  "golf",
  "mma",
  "boxing",
  "f1",
  "super-bowl",
  "world-cup",
  "march-madness",
  "olympics",
  // Crypto
  "bitcoin",
  "ethereum",
  "crypto",
  "defi",
  "nfts",
  "solana",
  "xrp",
  // Tech
  "ai",
  "openai",
  "google",
  "apple",
  "meta",
  "microsoft",
  "tesla",
  "spacex",
  "elon-musk",
  // Economy
  "fed",
  "interest-rates",
  "inflation",
  "recession",
  "stock-market",
  "economy",
  // Entertainment
  "oscars",
  "grammys",
  "emmys",
  "movies",
  "tv-shows",
  "pop-culture",
  "taylor-swift",
  // World
  "ukraine",
  "russia",
  "china",
  "middle-east",
  "israel",
  "gaza",
  "europe",
  // Science
  "science",
  "space",
  "nasa",
  "climate",
  "health",
  "covid",
];

const SYSTEM_PROMPT = `You are a prediction market expert analyzing social media posts to find relevant Polymarket markets.

Your task is to extract topics and generate search queries that will find relevant prediction markets.

Available Polymarket tags (use these exact slugs when relevant):
${POLYMARKET_TAGS.join(", ")}

Guidelines:
1. Focus on topics that could have prediction markets (outcomes that can be verified)
2. Extract specific entities (people, teams, companies, events)
3. Generate a concise search query (3-6 words) optimized for Polymarket's search
4. Only include tags that are directly relevant
5. Set confidence based on how likely the post relates to prediction markets:
   - 0.8-1.0: Clearly about a predictable event (election, game, price target)
   - 0.5-0.7: Mentions topics that often have markets (politics, crypto, sports)
   - 0.2-0.4: General discussion that might relate to markets
   - 0.0-0.2: Unlikely to have relevant markets (personal posts, jokes)

Examples:
- "Trump is going to win 2024" → searchQuery: "Trump 2024 election", tags: ["trump", "2024-election"]
- "Bitcoin breaking $100k soon!" → searchQuery: "Bitcoin price 100k", tags: ["bitcoin", "crypto"]
- "Chiefs vs Eagles Super Bowl" → searchQuery: "Chiefs Eagles Super Bowl", tags: ["nfl", "super-bowl"]`;

export async function POST(request: NextRequest) {
  // Rate limit: 20 requests per minute (AI is expensive)
  const rateLimitResponse = checkRateLimit(request, {
    uniqueTokenPerInterval: 20,
  });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = (await request.json()) as { text?: string };
    const { text } = body;

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'text' field" },
        { status: 400 }
      );
    }

    // Limit text length to avoid excessive token usage
    const truncatedText = text.slice(0, 500);

    // Get API key from environment
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      console.error("OPENROUTER_API_KEY not configured");
      return NextResponse.json(
        { error: "AI service not configured" },
        { status: 503 }
      );
    }

    const openrouter = createOpenRouter({ apiKey });

    const response = await generateText({
      model: openrouter.chat("google/gemini-3-flash-preview"),
      output: Output.object({ schema: TopicExtractionSchema }),
      system: SYSTEM_PROMPT,
      prompt: `Analyze this social media post and extract prediction market topics:\n\n"${truncatedText}"`,
      temperature: 0.3,
      maxOutputTokens: 300,
    });

    const result = response.output;

    return NextResponse.json({
      success: true,
      ...result,
      // Include the original text length for debugging
      inputLength: text.length,
      truncated: text.length > 500,
    });
  } catch (error) {
    console.error("AI extraction error:", error);

    // Return a structured error response
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "AI extraction failed",
        // Return empty defaults so the extension can fall back to rule-based
        category: "other",
        entities: [],
        tags: [],
        searchQuery: "",
        confidence: 0,
      },
      { status: 500 }
    );
  }
}

// Also support GET for simple testing (rate limited same as POST)
export async function GET(request: NextRequest) {
  const rateLimitResponse = checkRateLimit(request, {
    uniqueTokenPerInterval: 20,
  });
  if (rateLimitResponse) return rateLimitResponse;

  const { searchParams } = new URL(request.url);
  const text = searchParams.get("text");

  if (!text) {
    return NextResponse.json(
      {
        error: "Missing 'text' query parameter",
        usage: "GET /api/ai/extract-topics?text=your+text+here",
      },
      { status: 400 }
    );
  }

  // Reuse POST logic
  const fakeRequest = {
    json: async () => ({ text }),
  } as NextRequest;

  return POST(fakeRequest);
}
