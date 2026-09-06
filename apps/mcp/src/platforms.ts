import {
  isPlatformError,
  PLATFORM_IDS,
  type PlatformId,
} from "@knoww/services/core";
import {
  POLYMARKET_PLATFORM,
  type PolymarketClient,
} from "@knoww/services/platforms/polymarket";
import {
  createPlatformRegistry,
  type PlatformRegistry,
} from "@knoww/services/registry";
import { z } from "zod";
import { KnowwToolError } from "./errors/tool-error";

/**
 * Platforms this worker serves. A constant, not an env var (owner decision,
 * 2026-09-05): one deploy ships one platform set, and the registry treats an
 * explicit list as authoritative over process.env.
 */
export const ENABLED_PLATFORMS: readonly PlatformId[] = [POLYMARKET_PLATFORM];

/** Platform a cross-platform tool reads when the caller omits `platform`. */
export const DEFAULT_PLATFORM: PlatformId = POLYMARKET_PLATFORM;

export const platformInputSchema = z
  .enum(PLATFORM_IDS)
  .optional()
  .describe(
    `Prediction-market platform. Defaults to "${DEFAULT_PLATFORM}". Call list_platforms for the enabled set.`
  );

let registry: PlatformRegistry | undefined;

/**
 * One registry per isolate, created on first use. No `fetchImpl` is passed:
 * knoww-services resolves `fetch` at call time, so tests that stub
 * `globalThis.fetch` still intercept every upstream request.
 */
export function platformRegistry(): PlatformRegistry {
  registry ??= createPlatformRegistry({
    enabledPlatforms: ENABLED_PLATFORMS,
  });
  return registry;
}

export function isPlatformEnabled(platform: PlatformId): boolean {
  return ENABLED_PLATFORMS.includes(platform);
}

export function platformDisabledError(platform: string): KnowwToolError {
  return new KnowwToolError(
    "PLATFORM_DISABLED",
    `Platform ${platform} is not enabled on this server.`
  );
}

/** Resolves the requested platform (or the default) and rejects disabled ones. */
export function requirePlatform(requested: PlatformId | undefined): PlatformId {
  const platform = requested ?? DEFAULT_PLATFORM;
  if (!isPlatformEnabled(platform)) {
    throw platformDisabledError(platform);
  }
  return platform;
}

/**
 * The Polymarket client behind the registry. Every tool reads Polymarket
 * directly today; the cross-platform tools accept `platform` for the contract
 * shape and refuse any other value until a second adapter serves them.
 */
export function requirePolymarketClient(
  requested?: PlatformId
): PolymarketClient {
  const platform = requirePlatform(requested);
  if (platform !== POLYMARKET_PLATFORM) {
    throw new KnowwToolError(
      "VALIDATION_ERROR",
      `This tool does not serve ${platform} yet. Omit platform or pass "${POLYMARKET_PLATFORM}".`
    );
  }
  try {
    return platformRegistry().getPlatformAdapter(POLYMARKET_PLATFORM).client;
  } catch (error) {
    if (isPlatformError(error) && error.kind === "disabled") {
      throw platformDisabledError(platform);
    }
    throw error;
  }
}
