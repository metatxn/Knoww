import { createLogger } from "@knoww/logger";
import {
  applyCapabilityOverrides,
  type MarketDataAdapter,
  PlatformError,
  type PlatformId,
  parseCanonicalId,
  parseCapabilityOverrides,
  parseEnabledPlatforms,
  type TradingAdapter,
} from "./core";
import {
  createPolymarketMarketDataAdapter,
  createPolymarketTradingAdapter,
  DEFAULT_POLYMARKET_BASE_URLS,
  POLYMARKET_CAPABILITIES,
  type PolymarketBaseUrls,
  type PolymarketMarketDataAdapter,
  type PolymarketTradingAdapterInit,
} from "./platforms/polymarket";

/**
 * The registry is the only module that imports a platform folder. It reads
 * the enablement flags once, builds one adapter per enabled platform, owns
 * the platform base URLs and hands out adapters by platform id.
 *
 *   createPlatformRegistry(init)  build an instance with an injected fetch
 *                                 (the web app maps cache hints onto Next's
 *                                 fetch; MCP uses the global fetch)
 *   getMarketDataAdapter(...)     module-level helpers over a default
 *                                 instance built from process.env on first use
 *
 * See docs/decisions/2026-09-03-aggregator-platform-adapters.md, "Registry".
 */
declare const process:
  | {
      env?:
        | {
            KNOWW_ENABLED_PLATFORMS?: string | undefined;
            KNOWW_PLATFORM_CAPABILITY_OVERRIDES?: string | undefined;
          }
        | undefined;
    }
  | undefined;

const log = createLogger("services.registry");

export type {
  ServiceCacheHint,
  ServiceFetchOptions,
  ServiceRequestInit,
} from "./fetch-options";
/** Injected fetches read the per-call cache hint with this. */
export { readCacheHint } from "./fetch-options";
export { parseCanonicalId };

/** Production hosts. The registry owns these; request input never carries them. */
export const POLYMARKET_BASE_URLS: PolymarketBaseUrls =
  DEFAULT_POLYMARKET_BASE_URLS;

export type * as Polymarket from "./platforms/polymarket";
/**
 * Polymarket types and pure helpers for the legacy `src/markets/*` and
 * `src/profiles/*` wrappers, which may not import the platform folder
 * themselves. Nothing re-exported here performs I/O.
 */
export {
  buildEmptySearchResponse,
  DEFAULT_SEARCH_LIMIT,
  getExactTopOutcome,
  getTopOutcome,
  MAX_SEARCH_LIMIT,
  mergeEvents,
  summarizeWalletPnl,
} from "./platforms/polymarket";

export interface RegistryEnv {
  KNOWW_ENABLED_PLATFORMS?: string | undefined;
  KNOWW_PLATFORM_CAPABILITY_OVERRIDES?: string | undefined;
}

export interface PlatformRegistryInit {
  /** Flag values. Defaults to `process.env` where a process exists. */
  env?: RegistryEnv;
  /** Fetch implementation handed to every adapter (cache-hint aware in web). */
  fetchImpl?: typeof fetch;
  /** Clock handed to every adapter; tests pin it. */
  now?: () => Date;
  polymarket?: {
    baseUrls?: Partial<PolymarketBaseUrls>;
    /**
     * Signer and CLOB credentials for the trading adapter. Without them the
     * adapter still previews orders and reads accounts; `connectionStatus`
     * reports what is missing and `placeOrder` throws `unauthenticated`.
     */
    trading?: Pick<
      PolymarketTradingAdapterInit,
      "signer" | "credentials" | "builderCode" | "draftTtlMs"
    >;
  };
}

export interface PlatformRegistry {
  /** Enabled platforms that have an adapter, in the environment's order. */
  getEnabledPlatforms(): PlatformId[];
  /** The generic market-data adapter, or a `disabled` PlatformError. */
  getMarketDataAdapter(platform: PlatformId): MarketDataAdapter;
  /**
   * The trading adapter, `null` for a platform that is discovery-only here
   * (read-only integrations), or a `disabled` PlatformError when it is off.
   */
  getTradingAdapter(platform: PlatformId): TradingAdapter | null;
  /** Typed escape hatch: the concrete adapter with its platform-specific client. */
  getPlatformAdapter(platform: "polymarket"): PolymarketMarketDataAdapter;
}

function readProcessEnv(): RegistryEnv {
  if (typeof process === "undefined" || !process?.env) {
    return {};
  }
  return {
    KNOWW_ENABLED_PLATFORMS: process.env.KNOWW_ENABLED_PLATFORMS,
    KNOWW_PLATFORM_CAPABILITY_OVERRIDES:
      process.env.KNOWW_PLATFORM_CAPABILITY_OVERRIDES,
  };
}

function disabled(platform: PlatformId): PlatformError {
  return new PlatformError(`Platform ${platform} is not enabled`, {
    platform,
    operation: "resolveAdapter",
    kind: "disabled",
  });
}

export function createPlatformRegistry(
  init: PlatformRegistryInit = {}
): PlatformRegistry {
  const env = init.env ?? readProcessEnv();
  const requested = parseEnabledPlatforms(env.KNOWW_ENABLED_PLATFORMS);
  const overrides = parseCapabilityOverrides(
    env.KNOWW_PLATFORM_CAPABILITY_OVERRIDES
  );

  const marketData = new Map<PlatformId, MarketDataAdapter>();
  const trading = new Map<PlatformId, TradingAdapter>();
  let polymarket: PolymarketMarketDataAdapter | undefined;

  for (const platform of requested) {
    switch (platform) {
      case "polymarket":
        polymarket = createPolymarketMarketDataAdapter({
          baseUrls: init.polymarket?.baseUrls,
          fetchImpl: init.fetchImpl,
          now: init.now,
          capabilities: applyCapabilityOverrides(
            platform,
            POLYMARKET_CAPABILITIES,
            overrides
          ),
        });
        marketData.set(platform, polymarket);
        trading.set(
          platform,
          createPolymarketTradingAdapter({
            baseUrls: init.polymarket?.baseUrls,
            fetchImpl: init.fetchImpl,
            now: init.now,
            ...init.polymarket?.trading,
          })
        );
        break;
      default:
        // Listed in PLATFORM_IDS but without an adapter yet (Kalshi until M2).
        log.warn("registry.platform_not_registered", { platform });
    }
  }

  const enabled = requested.filter((platform) => marketData.has(platform));

  return {
    getEnabledPlatforms() {
      return [...enabled];
    },
    getMarketDataAdapter(platform) {
      const adapter = marketData.get(platform);
      if (!adapter) {
        throw disabled(platform);
      }
      return adapter;
    },
    getTradingAdapter(platform) {
      if (!marketData.has(platform)) {
        throw disabled(platform);
      }
      return trading.get(platform) ?? null;
    },
    getPlatformAdapter(platform) {
      if (!polymarket) {
        throw disabled(platform);
      }
      return polymarket;
    },
  };
}

let defaultRegistry: PlatformRegistry | undefined;

function registry(): PlatformRegistry {
  if (!defaultRegistry) {
    defaultRegistry = createPlatformRegistry();
  }
  return defaultRegistry;
}

export function getEnabledPlatforms(): PlatformId[] {
  return registry().getEnabledPlatforms();
}

export function getMarketDataAdapter(platform: PlatformId): MarketDataAdapter {
  return registry().getMarketDataAdapter(platform);
}

export function getTradingAdapter(platform: PlatformId): TradingAdapter | null {
  return registry().getTradingAdapter(platform);
}

export function getPlatformAdapter(
  platform: "polymarket"
): PolymarketMarketDataAdapter {
  return registry().getPlatformAdapter(platform);
}
