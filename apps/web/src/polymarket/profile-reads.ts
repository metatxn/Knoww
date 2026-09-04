import { UpstreamPublicDataError } from "@knoww/services";
import type {
  DataApiLeaderboardRecord,
  GammaTagRecord,
  TraderLeaderboardParams,
} from "@knoww/services/platforms/polymarket";
import type { ServiceCacheHint } from "@knoww/services/registry";
import { getPlatformRegistry } from "@/lib/platform-registry";

/**
 * Polymarket-only reads apps/web still needs outside the canonical contract.
 * The trader leaderboard and Gamma's tag-by-slug lookup have no canonical
 * counterpart yet, and the pages serve both records as Polymarket sends
 * them, so this talks to the platform client directly, which is what this
 * folder is for.
 */

/** Leaderboard rows exactly as the Data API sent them. */
export async function fetchLeaderboardRows(
  input: TraderLeaderboardParams,
  cache: ServiceCacheHint
): Promise<DataApiLeaderboardRecord[]> {
  const { client } = getPlatformRegistry().getPlatformAdapter("polymarket");
  const page = await client.fetchTraderLeaderboardPage(input, { cache });
  return page.rawEntries;
}

/**
 * One Gamma tag exactly as Gamma sent it. A missing tag rejects with the
 * upstream error, whose `status` carries Gamma's response code.
 */
export async function fetchTagRecord(
  slug: string,
  cache: ServiceCacheHint
): Promise<GammaTagRecord> {
  const { client } = getPlatformRegistry().getPlatformAdapter("polymarket");
  const { rawTag } = await client.fetchTagBySlug(slug, { cache });
  return rawTag;
}

/**
 * The HTTP status behind a failed read, when Polymarket answered at all.
 * Undefined means the request never got a usable response (network failure,
 * timeout, malformed body).
 */
export function upstreamStatus(error: unknown): number | undefined {
  return error instanceof UpstreamPublicDataError ? error.status : undefined;
}
