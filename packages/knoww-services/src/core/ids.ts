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

/**
 * A plain `Error` tagged with `name: "InvalidCanonicalIdError"`; narrow with
 * `isInvalidCanonicalIdError`, never `instanceof`.
 */
export interface InvalidCanonicalIdError extends Error {
  readonly name: "InvalidCanonicalIdError";
  /** The id that failed to parse. */
  readonly id: string;
}

export function invalidCanonicalIdError(
  id: string,
  reason: string
): InvalidCanonicalIdError {
  const error = new Error(
    `Invalid canonical id "${id}": ${reason}`
  ) as Error & {
    name: "InvalidCanonicalIdError";
    id: string;
  };
  error.name = "InvalidCanonicalIdError";
  error.id = id;
  return error;
}

export function isInvalidCanonicalIdError(
  value: unknown
): value is InvalidCanonicalIdError {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { name?: unknown; id?: unknown };
  return (
    candidate.name === "InvalidCanonicalIdError" &&
    typeof candidate.id === "string"
  );
}

export interface CanonicalIdParts {
  platform: PlatformId;
  sourceId: string;
}

export function parseCanonicalId(id: string): CanonicalIdParts {
  const separator = id.indexOf(":");
  if (separator < 0) {
    throw invalidCanonicalIdError(id, "missing platform separator");
  }
  const platform = id.slice(0, separator);
  const sourceId = id.slice(separator + 1);
  if (!isPlatformId(platform)) {
    throw invalidCanonicalIdError(id, `unknown platform "${platform}"`);
  }
  if (sourceId.length === 0) {
    throw invalidCanonicalIdError(id, "empty source id");
  }
  return { platform, sourceId };
}

export function buildCanonicalId(
  platform: PlatformId,
  sourceId: string
): string {
  if (sourceId.length === 0) {
    throw invalidCanonicalIdError(`${platform}:`, "empty source id");
  }
  return `${platform}:${sourceId}`;
}
