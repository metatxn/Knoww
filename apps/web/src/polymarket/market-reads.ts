import type { GammaMarketLike } from "@knoww/services/platforms/polymarket";
import type { ServiceCacheHint } from "@knoww/services/registry";
import { getPlatformRegistry } from "@/lib/platform-registry";

/**
 * Polymarket market reads for apps/web.
 *
 * Markets have no canonical read yet (the ADR defers them), so the routes
 * that serve a market on its own get the Gamma record through the platform
 * client here. This module is the only place outside the registry that names
 * Polymarket for market reads.
 */

/**
 * The open market behind a slug, as Gamma sent it. Null when no open market
 * carries the slug: a settled market counts as missing, which is what the
 * market page expects. Upstream failures throw.
 */
export async function fetchOpenMarketRecordBySlug(
  slug: string,
  cache: ServiceCacheHint
): Promise<GammaMarketLike | null> {
  const { client } = getPlatformRegistry().getPlatformAdapter("polymarket");
  return client.fetchOpenMarketRecordByIdentifier(
    { kind: "slug", value: slug },
    { cache }
  );
}
