import { createLogger } from "@knoww/logger";
import {
  type GammaArrayField,
  parseGammaStringArray,
} from "@knoww/shared-types/polymarket";
import type { MarketStatus } from "../../core/types";

const log = createLogger("services.polymarket.status");

/**
 * The Gamma flags the status mapper reads. Every field is optional because
 * search hits, event payloads and single-market lookups each omit a
 * different subset.
 */
export interface GammaStatusFlags {
  active?: boolean | null;
  closed?: boolean | null;
  acceptingOrders?: boolean | null;
  umaResolutionStatus?: string | null;
  umaResolutionStatuses?: GammaArrayField;
}

/** UMA states between "closed" and "resolved" that still allow a dispute. */
const RESOLVING_UMA_STATUSES: ReadonlySet<string> = new Set([
  "proposed",
  "disputed",
  "challenged",
]);

function readUmaStatus(flags: GammaStatusFlags): string | undefined {
  const singular = flags.umaResolutionStatus?.trim();
  if (singular) {
    return singular.toLowerCase();
  }
  let plural: string[] = [];
  try {
    plural = parseGammaStringArray(flags.umaResolutionStatuses, {
      field: "umaResolutionStatuses",
      onError: () => undefined,
    });
  } catch {
    plural = [];
  }
  const last = plural[plural.length - 1]?.trim();
  return last ? last.toLowerCase() : undefined;
}

/**
 * Status table from the "Status" section of docs/single-api-layer.md, which
 * the ADR (docs/decisions/2026-09-03-aggregator-platform-adapters.md) reuses
 * as written. Anything the table does not cover maps to "unknown" and is
 * logged; the mapper never guesses.
 */
export function mapPolymarketStatus(flags: GammaStatusFlags): MarketStatus {
  const uma = readUmaStatus(flags);
  if (uma === "resolved") {
    return "resolved";
  }
  if (flags.closed === true) {
    if (uma === undefined) {
      return "closed";
    }
    if (RESOLVING_UMA_STATUSES.has(uma)) {
      return "resolving";
    }
    log.warn("market_status.unknown", {
      reason: "unlisted_uma_status",
      umaResolutionStatus: uma,
    });
    return "unknown";
  }
  if (flags.active === true) {
    return flags.acceptingOrders === false ? "paused" : "active";
  }
  if (
    flags.active === false &&
    flags.closed === false &&
    flags.acceptingOrders !== true
  ) {
    return "unopened";
  }
  log.warn("market_status.unknown", {
    reason: "unmapped_flags",
    active: flags.active ?? null,
    closed: flags.closed ?? null,
    acceptingOrders: flags.acceptingOrders ?? null,
  });
  return "unknown";
}
