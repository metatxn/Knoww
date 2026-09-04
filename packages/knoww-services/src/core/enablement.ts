import { createLogger } from "@knoww/logger";
import {
  isMarketCapability,
  type MarketCapabilities,
  type MarketCapability,
} from "./capabilities";
import { isPlatformId, type PlatformId } from "./ids";

/**
 * Enablement flags, read once at startup by whoever builds the registry.
 *
 *   KNOWW_ENABLED_PLATFORMS             comma list of platform ids; order is
 *                                       display order; default "polymarket"
 *   KNOWW_PLATFORM_CAPABILITY_OVERRIDES comma list of `platform.capability=off`
 *
 * Unknown entries are dropped with a warning rather than failing startup. A
 * typo in the platform list would otherwise take the whole site down, and a
 * bad override is safer ignored than guessed at.
 */
const log = createLogger("services.core.enablement");

export const DEFAULT_ENABLED_PLATFORMS: readonly PlatformId[] = ["polymarket"];

export interface CapabilityOverride {
  platform: PlatformId;
  capability: MarketCapability;
  enabled: false;
}

function splitList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function parseEnabledPlatforms(raw: string | undefined): PlatformId[] {
  const entries = splitList(raw);
  if (entries.length === 0) return [...DEFAULT_ENABLED_PLATFORMS];

  const enabled: PlatformId[] = [];
  for (const entry of entries) {
    const id = entry.toLowerCase();
    if (!isPlatformId(id)) {
      log.warn("enabled_platforms.unknown_platform", { entry });
      continue;
    }
    if (!enabled.includes(id)) enabled.push(id);
  }

  if (enabled.length === 0) {
    log.warn("enabled_platforms.fallback_to_default", { raw });
    return [...DEFAULT_ENABLED_PLATFORMS];
  }
  return enabled;
}

const OVERRIDE_PATTERN = /^([A-Za-z]+)\.([A-Za-z]+)=([A-Za-z]+)$/;

export function parseCapabilityOverrides(
  raw: string | undefined
): CapabilityOverride[] {
  const overrides: CapabilityOverride[] = [];
  for (const entry of splitList(raw)) {
    const match = OVERRIDE_PATTERN.exec(entry);
    if (!match) {
      log.warn("capability_overrides.malformed_entry", { entry });
      continue;
    }
    const platform = match[1].toLowerCase();
    const capability = match[2];
    const value = match[3].toLowerCase();
    if (!isPlatformId(platform)) {
      log.warn("capability_overrides.unknown_platform", { entry });
      continue;
    }
    if (!isMarketCapability(capability)) {
      log.warn("capability_overrides.unknown_capability", { entry });
      continue;
    }
    if (value !== "off") {
      log.warn("capability_overrides.unsupported_value", { entry });
      continue;
    }
    overrides.push({ platform, capability, enabled: false });
  }
  return overrides;
}

export function applyCapabilityOverrides(
  platform: PlatformId,
  capabilities: MarketCapabilities,
  overrides: readonly CapabilityOverride[]
): MarketCapabilities {
  const result: MarketCapabilities = { ...capabilities };
  for (const override of overrides) {
    if (override.platform !== platform) continue;
    result[override.capability] = override.enabled;
  }
  return result;
}
