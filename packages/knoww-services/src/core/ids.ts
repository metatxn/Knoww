/**
 * Platform identifiers and canonical ids.
 *
 * Canonical ids are `platform:sourceId`. The platform segment is one of
 * PLATFORM_IDS; the source id is the platform's own identifier kept verbatim
 * (Polymarket condition id, Kalshi ticker in its native uppercase). The split
 * happens at the first colon so a source id may itself contain colons.
 *
 * Adding a platform means adding it here, adding its folder under
 * `src/platforms/`, and registering it in `src/registry.ts`.
 */
export const PLATFORM_IDS = ["polymarket", "kalshi"] as const;

export type PlatformId = (typeof PLATFORM_IDS)[number];

export function isPlatformId(value: string): value is PlatformId {
  return (PLATFORM_IDS as readonly string[]).includes(value);
}

export class InvalidCanonicalIdError extends Error {
  constructor(
    readonly id: string,
    reason: string
  ) {
    super(`Invalid canonical id "${id}": ${reason}`);
    this.name = "InvalidCanonicalIdError";
  }
}

export interface CanonicalIdParts {
  platform: PlatformId;
  sourceId: string;
}

export function parseCanonicalId(id: string): CanonicalIdParts {
  const separator = id.indexOf(":");
  if (separator < 0) {
    throw new InvalidCanonicalIdError(id, "missing platform separator");
  }
  const platform = id.slice(0, separator);
  const sourceId = id.slice(separator + 1);
  if (!isPlatformId(platform)) {
    throw new InvalidCanonicalIdError(id, `unknown platform "${platform}"`);
  }
  if (sourceId.length === 0) {
    throw new InvalidCanonicalIdError(id, "empty source id");
  }
  return { platform, sourceId };
}

export function buildCanonicalId(
  platform: PlatformId,
  sourceId: string
): string {
  if (sourceId.length === 0) {
    throw new InvalidCanonicalIdError(`${platform}:`, "empty source id");
  }
  return `${platform}:${sourceId}`;
}
