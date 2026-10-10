import { createLogger } from "@knoww/logger";
import { tokenLookupInputSchema } from "@knoww/services/platforms/polymarket";
import { type NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/api-rate-limit";
import { getPlatformRegistry } from "@/lib/platform-registry";

const log = createLogger("api.markets.tokens");

/**
 * @openapi
 * /api/polymarket/markets/tokens:
 *   get:
 *     summary: Resolve outcome tokens to market and settlement metadata.
 *     description: Supply exactly one selector. Unknown token IDs are omitted. Results are not paginated.
 *     tags: [Markets]
 *     parameters:
 *       - in: query
 *         name: tokenIds
 *         description: Up to 50 ERC-1155 token IDs.
 *         style: form
 *         explode: false
 *         schema:
 *           type: array
 *           minItems: 1
 *           maxItems: 50
 *           items: { type: string }
 *       - in: query
 *         name: conditionIds
 *         description: Up to 10 condition or neg-risk structure IDs.
 *         style: form
 *         explode: false
 *         schema:
 *           type: array
 *           minItems: 1
 *           maxItems: 10
 *           items: { type: string }
 *     responses:
 *       200:
 *         description: Token metadata in a success and tokens envelope. Final prices are decimal strings or null.
 *       400:
 *         description: Invalid, duplicate or conflicting selectors.
 *       429:
 *         description: Rate limit exceeded.
 *       502:
 *         description: Token metadata is unavailable.
 */
export async function GET(request: NextRequest) {
  const limited = checkRateLimit(request, { uniqueTokenPerInterval: 60 });
  if (limited) return limited;

  const params = request.nextUrl.searchParams;
  const parsed = tokenLookupInputSchema.safeParse(
    Object.fromEntries(
      [...params].map(([key, value]) => [key, value.split(",")])
    )
  );
  if (
    !parsed.success ||
    params.getAll("tokenIds").length > 1 ||
    params.getAll("conditionIds").length > 1
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Supply up to 50 tokenIds or up to 10 conditionIds, using exactly one selector",
      },
      { status: 400 }
    );
  }

  try {
    const { client } = getPlatformRegistry().getPlatformAdapter("polymarket");
    const tokens = await client.fetchTokenLookup(parsed.data, {
      signal: request.signal,
    });
    return NextResponse.json(
      { success: true, tokens },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    log.error("fetch.failed", { error });
    return NextResponse.json(
      { success: false, error: "Unable to load token metadata" },
      { status: 502 }
    );
  }
}
