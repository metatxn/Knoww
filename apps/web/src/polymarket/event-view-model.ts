import type { CanonicalEvent, Page } from "@knoww/services/core";
import {
  type GammaEventLike,
  isPolymarketEventDetails,
} from "@knoww/services/platforms/polymarket";
import { toSlimGammaEvent } from "@/lib/gamma-keyset";
import type {
  GammaEventFull,
  InitialEvent,
  InitialHomeData,
} from "@/lib/server-cache";
import type { GammaEvent } from "@/types/gamma-api";

/**
 * Polymarket view-models for the legacy apps/web shapes.
 *
 * The registry hands back canonical events, but the pages still render the
 * Gamma payloads they always rendered. Every canonical Polymarket event
 * carries the record Gamma sent under `platformDetails.gamma`, so the legacy
 * mappers run on that record and their output stays what it was.
 */

/** A Gamma keyset page as the services client returns it. */
export interface GammaEventPageLike {
  rawEvents: readonly GammaEventLike[];
  nextCursor?: string | null;
  totalResults?: number;
}

function gammaRecord(event: CanonicalEvent): GammaEventLike {
  const details = event.platformDetails;
  if (!isPolymarketEventDetails(details)) {
    throw new Error(
      `Expected Polymarket event details, got ${details?.platform ?? "none"}`
    );
  }
  return details.gamma;
}

function toSlimEvent(record: GammaEventLike): InitialEvent {
  // The record shape the services mappers accept is looser than the legacy
  // web type, but a record Gamma actually sent satisfies both.
  return toSlimGammaEvent(record as GammaEvent, true);
}

export function toInitialEvent(event: CanonicalEvent): InitialEvent {
  return toSlimEvent(gammaRecord(event));
}

/** The legacy home and category payload, straight from a Gamma page. */
export function toInitialHomeDataFromGamma(
  page: GammaEventPageLike
): InitialHomeData {
  const events = page.rawEvents.map(toSlimEvent);
  return {
    events,
    totalResults: page.totalResults ?? events.length,
    hasMore: Boolean(page.nextCursor),
  };
}

export function toInitialHomeData(page: Page<CanonicalEvent>): InitialHomeData {
  return toInitialHomeDataFromGamma({
    rawEvents: page.items.map(gammaRecord),
    nextCursor: page.nextCursor,
    totalResults: page.totalResults,
  });
}

/** The detail page renders the Gamma record itself, as `/api/events/[id]` does. */
export function toGammaEventFull(event: CanonicalEvent): GammaEventFull {
  return gammaRecord(event) as GammaEventFull;
}

type EventMarket = NonNullable<GammaEventFull["markets"]>[number];

/**
 * Folds negRisk child events (Gamma's `parent_event_id` lookup) into the
 * parent's market list so the SSR payload matches `/api/events/[id]`. Without
 * this the first paint is missing rows like "Most Sixes" until the client
 * refetch lands. A market already on the parent wins over a child's copy, and
 * every appended market points at its immediate child event, which is what
 * the UI groups by.
 */
export function mergeChildMarkets(
  event: GammaEventFull,
  children: readonly GammaEventLike[]
): GammaEventFull {
  if (children.length === 0) {
    return event;
  }

  const seen = new Set(
    (event.markets ?? [])
      .map((market) => market.id)
      .filter((id): id is string => typeof id === "string")
  );
  const merged: EventMarket[] = [...(event.markets ?? [])];
  for (const child of children) {
    for (const market of child.markets ?? []) {
      const marketId = typeof market.id === "string" ? market.id : undefined;
      if (marketId && seen.has(marketId)) continue;
      if (marketId) seen.add(marketId);
      merged.push({
        // Child markets are Gamma records too; the page renders them as-is.
        ...(market as EventMarket),
        parentEventId: child.id,
        parentEventTitle: child.title as EventMarket["parentEventTitle"],
      });
    }
  }

  return { ...event, markets: merged };
}
