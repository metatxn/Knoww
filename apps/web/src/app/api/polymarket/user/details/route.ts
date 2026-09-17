import { createLogger } from "@knoww/logger";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ERROR_MESSAGES } from "@/constants/polymarket";
import { checkRateLimit } from "@/lib/api-rate-limit";
import { getCacheHeaders } from "@/lib/cache-headers";
import { sanitizeUpstreamBody } from "@/lib/upstream-error";
import { isValidAddress } from "@/lib/validation";
import { fetchWalletDataResponse } from "@/polymarket/wallet-reads";

const log = createLogger("api.user.details");

/**
 * User details from Polymarket leaderboard API
 * Based on: /v1/leaderboard?timePeriod=day&orderBy=PNL&limit=1&offset=0&user={address}&category=overall
 */
interface PolymarketUserDetails {
  rank: string;
  proxyWallet: string;
  userName: string;
  xUsername: string;
  verifiedBadge: boolean;
  vol: number;
  pnl: number;
  profileImage: string;
}

/**
 * Helper to convert null/empty to undefined for optional fields
 */
const optionalString = z
  .string()
  .optional()
  .nullable()
  .transform((val) => (val === null || val === "" ? undefined : val));

/**
 * Validation schema for query parameters
 */
const querySchema = z.object({
  user: z.string().min(1, "User address is required").refine(isValidAddress, {
    message: "Invalid Ethereum address format",
  }),
  timePeriod: optionalString.pipe(
    z.enum(["day", "week", "month", "all"]).optional().default("day")
  ),
  category: optionalString.pipe(
    z
      .enum(["overall", "crypto", "sports", "politics"])
      .optional()
      .default("overall")
  ),
});

/**
 * GET /api/polymarket/user/details
 *
 * Fetch user details from Polymarket leaderboard API
 * Uses: /v1/leaderboard?timePeriod=day&orderBy=PNL&limit=1&offset=0&user={address}&category=overall
 *
 * Query Parameters:
 * - user: User's wallet address (required)
 * - timePeriod: Time period for stats (day, week, month, all) (default: day)
 * - category: Category filter (overall, crypto, sports, politics) (default: overall)
 *
 * Response:
 * - User profile info, rank, volume, and P&L
 */
/**
 * @openapi
 * /api/polymarket/user/details:
 *   get:
 *     summary: Fetch /api/polymarket/user/details.
 *     tags: [User]
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
export async function GET(request: NextRequest) {
  // Rate limit: 60 requests per minute
  const rateLimitResponse = checkRateLimit(request, {
    uniqueTokenPerInterval: 60,
  });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const searchParams = request.nextUrl.searchParams;

    // Parse and validate query parameters
    const parsed = querySchema.safeParse({
      user: searchParams.get("user"),
      timePeriod: searchParams.get("timePeriod"),
      category: searchParams.get("category"),
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid query parameters",
        },
        { status: 400 }
      );
    }

    const { user, timePeriod, category } = parsed.data;

    // Build query URL using exact Polymarket format
    const queryParams = new URLSearchParams({
      timePeriod: timePeriod,
      orderBy: "PNL",
      limit: "1",
      offset: "0",
      user: user.toLowerCase(),
      category: category,
    });

    // Fetch user details from Polymarket leaderboard API
    const response = await fetchWalletDataResponse("leaderboard", queryParams, {
      cache: { revalidateSeconds: 60 },
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error("upstream.error", {
        status: response.status,
        body: sanitizeUpstreamBody(errorText),
      });
      return NextResponse.json(
        {
          success: false,
          error: "Failed to fetch user details from Polymarket",
          details: response.status,
        },
        { status: response.status }
      );
    }

    const data: PolymarketUserDetails[] = await response.json();

    if (!data || data.length === 0) {
      return NextResponse.json(
        {
          success: true,
          user,
          details: null,
          message: "User not found in leaderboard",
        },
        { headers: getCacheHeaders("leaderboard") }
      );
    }

    const userDetails = data[0];

    return NextResponse.json(
      {
        success: true,
        user,
        timePeriod,
        category,
        details: {
          rank: userDetails.rank ? Number.parseInt(userDetails.rank, 10) : null,
          proxyWallet: userDetails.proxyWallet,
          userName: userDetails.userName,
          xUsername: userDetails.xUsername || null,
          verifiedBadge: userDetails.verifiedBadge,
          volume: userDetails.vol,
          volumeUnit: "shares",
          pnl: userDetails.pnl,
          profileImage: userDetails.profileImage || null,
        },
      },
      { headers: getCacheHeaders("leaderboard") }
    );
  } catch (error) {
    log.error("fetch.failed", { error });
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : ERROR_MESSAGES.UNKNOWN_ERROR,
      },
      { status: 500 }
    );
  }
}
