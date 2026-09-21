import { createLogger } from "@knoww/logger";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/api-rate-limit";
import { isAbortLikeError } from "@/lib/fetch-with-timeout";
import { fetchWalletDataResponse } from "@/polymarket/wallet-reads";

const log = createLogger("api.market.holders");
const querySchema = z.object({
  market: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  limit: z.coerce.number().int().min(1).max(20).default(20),
});

/**
 * @openapi
 * /api/polymarket/markets/holders:
 *   get:
 *     summary: Get top holders for each outcome token in a market.
 *     tags: [Markets]
 *     parameters:
 *       - in: query
 *         name: market
 *         required: true
 *         schema: { type: string, pattern: '^0x[0-9a-fA-F]{64}$' }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 20, default: 20 }
 *     responses:
 *       200:
 *         description: Holder groups with amounts in shares.
 *       400:
 *         description: Invalid query parameters.
 *       429:
 *         description: Rate limit exceeded.
 *       502:
 *         description: Upstream request failed.
 *       504:
 *         description: Upstream request timed out.
 */
export async function GET(request: NextRequest) {
  const limited = checkRateLimit(request, { uniqueTokenPerInterval: 60 });
  if (limited) return limited;
  const parsed = querySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams)
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid query parameters" },
      { status: 400 }
    );
  try {
    return await fetchWalletDataResponse(
      "holders",
      new URLSearchParams({
        market: parsed.data.market,
        limit: String(parsed.data.limit),
      }),
      { signal: request.signal, cache: { revalidateSeconds: 60 } }
    );
  } catch (error) {
    if (isAbortLikeError(error))
      return NextResponse.json(
        { error: "Polymarket request timed out" },
        { status: 504 }
      );
    log.error("holders.fetch_failed", { error });
    return NextResponse.json(
      { error: "Polymarket data unavailable" },
      { status: 502 }
    );
  }
}
