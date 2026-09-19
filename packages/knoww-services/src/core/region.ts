/**
 * Per-region trading capability.
 *
 * A trading adapter declares where its platform blocks trading outright and
 * where it only lets a user close existing positions. The apps evaluate a
 * visitor's location against that declaration on the server, before wallet
 * setup and before every order, and never trust the Worker's own location.
 *
 * Locations are ISO 3166-1 alpha-2 country codes, optionally narrowed to an
 * ISO 3166-2 subdivision written as `CC-SUB` ("CA-ON", "UA-43").
 *
 * See docs/decisions/2026-09-03-aggregator-platform-adapters.md, "Trading".
 */
export const REGION_TRADING_STATUSES = [
  "open",
  "close_only",
  "blocked",
  "unknown",
] as const;

export type RegionTradingStatus = (typeof REGION_TRADING_STATUSES)[number];

export interface RegionPolicy {
  /** Countries or subdivisions where the platform refuses every order. */
  blocked: readonly string[];
  /** Countries or subdivisions where only position-reducing orders pass. */
  closeOnly: readonly string[];
}

export interface RegionLocation {
  /** ISO 3166-1 alpha-2. Cloudflare sends "XX" for unknown and "T1" for Tor. */
  country?: string | null;
  /** ISO 3166-2 subdivision code without the country prefix ("ON", "43"). */
  subdivision?: string | null;
}

/** Codes Cloudflare and the geoblock feeds use when they cannot place a visitor. */
const UNPLACEABLE_COUNTRIES = new Set(["XX", "T1"]);

function normalise(code: string | null | undefined): string {
  return (code ?? "").trim().toUpperCase();
}

function listedStatus(
  policy: RegionPolicy,
  code: string
): RegionTradingStatus | null {
  if (policy.blocked.some((entry) => normalise(entry) === code)) {
    return "blocked";
  }
  if (policy.closeOnly.some((entry) => normalise(entry) === code)) {
    return "close_only";
  }
  return null;
}

/** The strictest status among a country's subdivision entries, if it has any. */
function strictestSubdivisionStatus(
  policy: RegionPolicy,
  country: string
): RegionTradingStatus | null {
  const prefix = `${country}-`;
  const hasEntry = (entries: readonly string[]) =>
    entries.some((entry) => normalise(entry).startsWith(prefix));
  if (hasEntry(policy.blocked)) return "blocked";
  if (hasEntry(policy.closeOnly)) return "close_only";
  return null;
}

/**
 * Resolves a location against a policy.
 *
 * Order of precedence: an exact `CC-SUB` entry, then the country itself,
 * then (when the location carries no subdivision) the strictest of the
 * country's subdivision entries, so a visitor whose subdivision we could not
 * determine is treated as if they were in the most restricted one. An
 * unplaceable or missing country yields `"unknown"`; the caller decides how
 * cautious to be with it.
 */
export function evaluateRegionTrading(
  policy: RegionPolicy,
  location: RegionLocation
): RegionTradingStatus {
  const country = normalise(location.country);
  if (country === "" || UNPLACEABLE_COUNTRIES.has(country)) {
    return "unknown";
  }
  const subdivision = normalise(location.subdivision);
  if (subdivision !== "") {
    const exact = listedStatus(policy, `${country}-${subdivision}`);
    if (exact) return exact;
  }
  const byCountry = listedStatus(policy, country);
  if (byCountry) return byCountry;
  if (subdivision === "") {
    return strictestSubdivisionStatus(policy, country) ?? "open";
  }
  return "open";
}
