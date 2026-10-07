import { createLogger } from "@knoww/logger";
import {
  DEFAULT_UPSTREAM_JSON_MAX_BYTES,
  readBoundedJson,
} from "@knoww/shared-types/bounded-json";
import {
  decodePolymarketV2AssetId,
  getGammaTokenIdForOutcome,
  parseGammaStringArray,
  resolvePolymarketProtocolVersion,
} from "@knoww/shared-types/polymarket";
import { type NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/api-rate-limit";
import { getCacheHeaders } from "@/lib/cache-headers";

const log = createLogger("api.markets.by-token");

/**
 * Polymarket Gamma API URL
 */
const GAMMA_API = "https://gamma-api.polymarket.com";

/**
 * Resolve the parent event slug for a market.
 *
 * The Gamma API nests the parent event inside `market.events[]`.
 * We prefer `events[0].slug` (the actual event slug) over the market's own slug,
 * since these differ for multi-outcome events.
 * Falls back to top-level `eventSlug` fields, then fetching by event ID.
 */
async function resolveEventSlug(
  market: Record<string, unknown>
): Promise<string> {
  // 1. Preferred: embedded events array from Gamma API
  const events = market.events as
    | Array<{ id?: string; slug?: string }>
    | undefined;
  if (Array.isArray(events) && events.length > 0 && events[0].slug) {
    return events[0].slug;
  }

  // 2. Direct top-level field (some API shapes include this)
  const direct = (market.eventSlug as string) || (market.event_slug as string);
  if (direct) return direct;

  // 3. Fetch parent event by numeric ID as last resort
  const eventId =
    (market.events_id as string) ||
    (market.eventId as string) ||
    (market.event_id as string);

  if (eventId) {
    try {
      const res = await fetch(`${GAMMA_API}/events/${eventId}`, {
        headers: { Accept: "application/json" },
        next: { revalidate: 300 },
      });
      if (res.ok) {
        const event = (await readBoundedJson(
          res,
          DEFAULT_UPSTREAM_JSON_MAX_BYTES
        )) as Record<string, unknown>;
        if (event.slug) return event.slug as string;
      }
    } catch {
      // fall through to market slug
    }
  }

  return (market.slug as string) || "";
}

/**
 * GET /api/polymarket/markets/by-token/:tokenId
 * Get market information by an outcome asset ID
 *
 * V1 assets use Gamma clob_token_ids. V2 positions encode their condition ID
 * and use Gamma condition_ids with exact outcome verification.
 */
/**
 * @openapi
 * /api/polymarket/markets/by-token/{tokenId}:
 *   get:
 *     summary: Fetch /api/polymarket/markets/by-token/{tokenId}.
 *     tags: [Markets]
 *     responses:
 *       200:
 *         description: Successful response.
 *       400:
 *         description: Invalid request.
 *       401:
 *         description: Authentication required.
 *       403:
 *         description: Request forbidden.
 *       404:
 *         description: Resource not found.
 *       429:
 *         description: Rate limit exceeded.
 *       500:
 *         description: Request failed.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tokenId: string }> }
) {
  // Rate limit: 60 requests per minute
  const rateLimitResponse = checkRateLimit(_request, {
    uniqueTokenPerInterval: 60,
  });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { tokenId } = await params;

    let protocolVersion: "v1" | "v2";
    let position: ReturnType<typeof decodePolymarketV2AssetId> | null;
    try {
      if (
        !/^[0-9]+$/.test(tokenId) ||
        BigInt(tokenId) >= BigInt(2) ** BigInt(256)
      )
        throw new Error("Invalid token ID");
      protocolVersion = resolvePolymarketProtocolVersion(tokenId);
      position =
        protocolVersion === "v2" ? decodePolymarketV2AssetId(tokenId) : null;
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid token ID" },
        { status: 400 }
      );
    }

    const lookup = new URLSearchParams(
      position
        ? { condition_ids: position.conditionId }
        : { clob_token_ids: tokenId }
    );
    const gammaResponse = await fetch(
      `${GAMMA_API}/markets?${lookup.toString()}`,
      {
        headers: { Accept: "application/json" },
        next: { revalidate: 300 },
      }
    );

    if (gammaResponse.ok) {
      const gammaData = await readBoundedJson(
        gammaResponse,
        DEFAULT_UPSTREAM_JSON_MAX_BYTES
      );

      if (Array.isArray(gammaData) && gammaData.length > 0) {
        const market = gammaData[0];
        if (
          position &&
          market.conditionId?.toLowerCase() !== position.conditionId &&
          market.conditionId?.toLowerCase() !== `${position.conditionId}00`
        )
          throw new Error("Gamma condition does not match position");

        const outcomes = parseGammaStringArray(market.outcomes);
        const tokenIndex = outcomes.findIndex(
          (_: string, index: number) =>
            getGammaTokenIdForOutcome(market, index) === tokenId
        );
        if (tokenIndex < 0)
          return NextResponse.json(
            { success: false, error: "Market not found for token ID" },
            { status: 404 }
          );
        const outcome = outcomes[tokenIndex];

        const eventSlug = await resolveEventSlug(market);

        return NextResponse.json(
          {
            success: true,
            market: {
              question: market.question || market.title || "Unknown Market",
              slug: market.slug || market.marketSlug || "",
              eventSlug,
              conditionId: market.conditionId || "",
              outcome,
              endDate: market.endDate || market.endDateIso || null,
              icon: market.image || market.icon || null,
            },
          },
          { headers: getCacheHeaders("events") }
        );
      }
    }

    // If API fails or no market found, return not found
    return NextResponse.json({
      success: false,
      error: "Market not found for token ID",
    });
  } catch (error) {
    log.error("fetch.failed", { error });
    return NextResponse.json(
      {
        success: false,
        error: "Unable to load market for token ID",
      },
      { status: 500 }
    );
  }
}
