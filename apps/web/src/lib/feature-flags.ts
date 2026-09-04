import {
  evaluateRegionTrading,
  type MarketCapabilities,
  type PlatformId,
  type RegionLocation,
  type RegionTradingStatus,
} from "@knoww/services/core";
import type { PlatformRegistry } from "@knoww/services/registry";

/**
 * The web app's feature flags. Evaluated once per request on the server
 * (`feature-flags.server.ts`), delivered to the browser through
 * `FeatureFlagsProvider`, and read by the product surfaces through the hooks
 * in `context/feature-flags-context.tsx`. Components branch on these
 * capabilities, never on a platform id.
 *
 * See docs/decisions/2026-09-03-aggregator-platform-adapters.md, "Trading".
 */

export interface PlatformFlags {
  enabled: boolean;
  capabilities: MarketCapabilities;
  /** The visitor's trading status under the platform's region policy. */
  regionTrading: RegionTradingStatus;
  /** May submit orders that open or grow a position. */
  canOpenPositions: boolean;
  /** May submit orders that reduce a position. */
  canClosePositions: boolean;
}

export interface FeatureFlagsLocation {
  country: string | null;
  subdivision: string | null;
}

export interface FeatureFlags {
  schemaVersion: 1;
  location: FeatureFlagsLocation;
  platforms: Partial<Record<PlatformId, PlatformFlags>>;
}

export type FeatureFlagsEnvironment = "development" | "production" | "test";

export type FeatureFlagsRegistry = Pick<
  PlatformRegistry,
  "getEnabledPlatforms" | "getMarketDataAdapter" | "getTradingAdapter"
>;

export interface FeatureFlagsInput {
  registry: FeatureFlagsRegistry;
  location: RegionLocation;
  environment: FeatureFlagsEnvironment;
}

/** The flags a surface sees when it renders outside the provider. */
export const NO_FEATURE_FLAGS: FeatureFlags = {
  schemaVersion: 1,
  location: { country: null, subdivision: null },
  platforms: {},
};

function normaliseLocation(location: RegionLocation): FeatureFlagsLocation {
  const country = location.country?.trim().toUpperCase() || null;
  const subdivision = location.subdivision?.trim().toUpperCase() || null;
  return { country, subdivision };
}

/**
 * A visitor we cannot place is held to closing positions in production and
 * left open elsewhere, so local development never needs a spoofed country.
 */
function mayOpenPositions(
  status: RegionTradingStatus,
  environment: FeatureFlagsEnvironment
): boolean {
  if (status === "open") return true;
  return status === "unknown" && environment !== "production";
}

export function evaluateFeatureFlags(input: FeatureFlagsInput): FeatureFlags {
  const location = normaliseLocation(input.location);
  const platforms: FeatureFlags["platforms"] = {};

  for (const platform of input.registry.getEnabledPlatforms()) {
    const capabilities = input.registry
      .getMarketDataAdapter(platform)
      .capabilities();
    const trading = input.registry.getTradingAdapter(platform);
    const regionTrading: RegionTradingStatus = trading
      ? evaluateRegionTrading(trading.regionPolicy(), location)
      : "open";
    const tradable = trading !== null && capabilities.createOrder;

    platforms[platform] = {
      enabled: true,
      capabilities,
      regionTrading,
      canOpenPositions:
        tradable && mayOpenPositions(regionTrading, input.environment),
      canClosePositions: tradable && regionTrading !== "blocked",
    };
  }

  return { schemaVersion: 1, location, platforms };
}

export interface RequestLocationHeaders {
  get(name: string): string | null;
}

/** The subset of Cloudflare's `request.cf` the location read needs. */
export interface RequestLocationCf {
  country?: string | undefined;
  regionCode?: string | undefined;
}

/**
 * The visitor's location from the request. Cloudflare sets `cf-ipcountry`
 * on every request it proxies and exposes the subdivision only on
 * `request.cf`; local development has neither.
 */
export function readRequestLocation(
  headers: RequestLocationHeaders,
  cf: RequestLocationCf | null | undefined
): FeatureFlagsLocation {
  return normaliseLocation({
    country: headers.get("cf-ipcountry") ?? cf?.country ?? null,
    subdivision: cf?.regionCode ?? null,
  });
}
