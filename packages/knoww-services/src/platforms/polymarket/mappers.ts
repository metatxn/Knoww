import { createLogger } from "@knoww/logger";
import {
  type GammaArrayField,
  parseGammaStringArray,
} from "@knoww/shared-types/polymarket";
import type { MarketCapabilities } from "../../core/capabilities";
import { buildCanonicalId, type PlatformId } from "../../core/ids";
import {
  CANONICAL_SCHEMA_VERSION,
  type CanonicalEvent,
  type CanonicalMarket,
  type CanonicalOutcome,
  type CanonicalTag,
  type DecimalAmount,
  type DecimalString,
  type IsoTimestamp,
  type MarketStatus,
  type PlatformDetails,
} from "../../core/types";
import { mapPolymarketStatus } from "./status";

const log = createLogger("services.polymarket.mappers");

export const POLYMARKET_PLATFORM = "polymarket" satisfies PlatformId;
const SETTLEMENT_UNIT = "USD";
const POLYMARKET_SITE = "https://polymarket.com";

type Maybe<T> = T | null | undefined;

/**
 * Loose views of Gamma payloads. Every field is optional and nullable so the
 * mappers accept the recorded fixtures, the zod-validated client types and
 * the partial objects that public search returns, without a cast at any
 * call site. Only the fields the mappers read are listed.
 */
export interface GammaEventRefLike {
  id?: Maybe<string | number>;
  slug?: Maybe<string>;
  title?: Maybe<string>;
  ticker?: Maybe<string>;
}

export interface GammaTagLike {
  id?: Maybe<string | number>;
  label?: Maybe<string>;
  slug?: Maybe<string>;
}

export interface GammaMarketLike {
  id?: Maybe<string | number>;
  question?: Maybe<string>;
  slug?: Maybe<string>;
  conditionId?: Maybe<string>;
  description?: Maybe<string>;
  outcomes?: GammaArrayField;
  outcomePrices?: GammaArrayField;
  clobTokenIds?: GammaArrayField;
  active?: Maybe<boolean>;
  closed?: Maybe<boolean>;
  archived?: Maybe<boolean>;
  acceptingOrders?: Maybe<boolean>;
  startDate?: Maybe<string>;
  endDate?: Maybe<string>;
  closedTime?: Maybe<string>;
  volume?: Maybe<string | number>;
  volumeNum?: Maybe<number>;
  volume24hr?: Maybe<string | number>;
  liquidity?: Maybe<string | number>;
  liquidityNum?: Maybe<number>;
  bestBid?: Maybe<string | number>;
  bestAsk?: Maybe<string | number>;
  lastTradePrice?: Maybe<string | number>;
  spread?: Maybe<string | number>;
  oneDayPriceChange?: Maybe<string | number>;
  umaResolutionStatus?: Maybe<string>;
  umaResolutionStatuses?: GammaArrayField;
  resolutionSource?: Maybe<string>;
  resolvedBy?: Maybe<string>;
  negRisk?: Maybe<boolean>;
  groupItemTitle?: Maybe<string>;
  image?: Maybe<string>;
  icon?: Maybe<string>;
  events?: Maybe<readonly GammaEventRefLike[]>;
}

export interface GammaEventLike {
  id: string | number;
  ticker?: Maybe<string>;
  title?: Maybe<string>;
  slug?: Maybe<string>;
  description?: Maybe<string>;
  active?: Maybe<boolean>;
  closed?: Maybe<boolean>;
  archived?: Maybe<boolean>;
  live?: Maybe<boolean>;
  ended?: Maybe<boolean>;
  negRisk?: Maybe<boolean>;
  startDate?: Maybe<string>;
  endDate?: Maybe<string>;
  volume?: Maybe<string | number>;
  volume24hr?: Maybe<string | number>;
  liquidity?: Maybe<string | number>;
  openInterest?: Maybe<string | number>;
  image?: Maybe<string>;
  icon?: Maybe<string>;
  tags?: Maybe<readonly GammaTagLike[]>;
  markets?: Maybe<readonly GammaMarketLike[]>;
}

export interface MapContext {
  fetchedAt: IsoTimestamp;
  capabilities: MarketCapabilities;
}

/**
 * Concrete `platformDetails` shapes this folder emits.
 *
 * `gamma` is the record the mapper received, whole and untouched: the
 * canonical mapping is lossy (empty strings drop, amounts become strings,
 * `outcomes` is parsed), and apps/web rebuilds its legacy Gamma payloads from
 * it byte for byte. Event reads in the adapter map the JSON as Gamma sent it;
 * search and market lookups map the zod-validated copy. A market mapped inside
 * an event carries its own record even though the event's `gamma.markets`
 * repeats it, so a market stays self-contained when handed on alone.
 */
export interface PolymarketMarketDetails extends PlatformDetails {
  platform: "polymarket";
  gamma: GammaMarketLike;
  gammaMarketId?: string;
  gammaEventId?: string;
  negRisk?: boolean;
  acceptingOrders?: boolean;
  archived?: boolean;
  bestBid?: number;
  bestAsk?: number;
  lastTradePrice?: number;
  spread?: number;
  oneDayPriceChange?: number;
  umaResolutionStatus?: string;
  resolvedBy?: string;
}

export interface PolymarketEventDetails extends PlatformDetails {
  platform: "polymarket";
  gamma: GammaEventLike;
  gammaEventId: string;
  ticker?: string;
  negRisk?: boolean;
  archived?: boolean;
  live?: boolean;
  ended?: boolean;
  openInterest?: number;
}

export function isPolymarketMarketDetails(
  details: PlatformDetails | undefined
): details is PolymarketMarketDetails {
  return details?.platform === "polymarket" && "gammaMarketId" in details;
}

export function isPolymarketEventDetails(
  details: PlatformDetails | undefined
): details is PolymarketEventDetails {
  return (
    details?.platform === "polymarket" &&
    typeof details.gammaEventId === "string" &&
    !("gammaMarketId" in details)
  );
}

function text(raw: Maybe<string>): string | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function firstText(...candidates: Maybe<string>[]): string | undefined {
  for (const candidate of candidates) {
    const value = text(candidate);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function idText(raw: Maybe<string | number>): string | undefined {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? String(raw) : undefined;
  }
  return text(raw);
}

/**
 * Gamma sends most amounts twice: a string (`volume`) and a float
 * (`volumeNum`). The string keeps every digit, so it wins when present.
 */
export function toDecimalString(
  raw: Maybe<string | number>
): DecimalString | undefined {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? String(raw) : undefined;
  }
  const trimmed = text(raw);
  if (trimmed === undefined || !Number.isFinite(Number(trimmed))) {
    return undefined;
  }
  return trimmed;
}

function toNumber(raw: Maybe<string | number>): number | undefined {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : undefined;
  }
  const trimmed = text(raw);
  if (trimmed === undefined) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toAmount(
  ...candidates: Maybe<string | number>[]
): DecimalAmount | undefined {
  for (const candidate of candidates) {
    const value = toDecimalString(candidate);
    if (value !== undefined) {
      return { value, unit: SETTLEMENT_UNIT };
    }
  }
  return undefined;
}

function toTimestamp(raw: Maybe<string>): IsoTimestamp | undefined {
  return text(raw);
}

function parseStrings(raw: GammaArrayField, field: string): string[] {
  try {
    return parseGammaStringArray(raw, {
      field,
      onError: (error) => {
        log.warn("gamma_array.invalid", {
          field,
          message:
            error.error instanceof Error
              ? error.error.message
              : String(error.error),
        });
      },
    });
  } catch (error) {
    log.warn("gamma_array.invalid", {
      field,
      message: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

function compact<T extends PlatformDetails>(details: T): T {
  for (const key of Object.keys(details)) {
    if (details[key] === undefined || details[key] === null) {
      delete details[key];
    }
  }
  return details;
}

function mapOutcomes(market: GammaMarketLike): CanonicalOutcome[] {
  const labels = parseStrings(market.outcomes, "outcomes");
  const prices = parseStrings(market.outcomePrices, "outcomePrices");
  const tokenIds = parseStrings(market.clobTokenIds, "clobTokenIds");
  const outcomes: CanonicalOutcome[] = [];
  tokenIds.forEach((tokenId, index) => {
    const sourceOutcomeId = text(tokenId);
    if (sourceOutcomeId === undefined) {
      return;
    }
    const outcome: CanonicalOutcome = {
      id: buildCanonicalId(POLYMARKET_PLATFORM, sourceOutcomeId),
      sourceOutcomeId,
      label: text(labels[index]) ?? `Outcome ${index + 1}`,
    };
    const price = toDecimalString(prices[index]);
    if (price !== undefined) {
      outcome.price = price;
    }
    outcomes.push(outcome);
  });
  return outcomes;
}

function marketSourceUrl(
  slug: string | undefined,
  eventSlug: string | undefined
): string | undefined {
  if (slug === undefined) {
    return undefined;
  }
  if (eventSlug !== undefined) {
    return `${POLYMARKET_SITE}/event/${eventSlug}/${slug}`;
  }
  return `${POLYMARKET_SITE}/market/${slug}`;
}

export interface MapGammaMarketParent {
  sourceEventId?: string;
  eventSlug?: string;
}

/**
 * Maps one Gamma market. Returns null when the payload has no condition id,
 * because the canonical id is built from it; callers log and skip.
 */
export function mapGammaMarket(
  market: GammaMarketLike,
  ctx: MapContext,
  parent: MapGammaMarketParent = {}
): CanonicalMarket | null {
  const sourceMarketId = text(market.conditionId);
  if (sourceMarketId === undefined) {
    return null;
  }
  const firstEvent = market.events?.[0];
  const sourceEventId = parent.sourceEventId ?? idText(firstEvent?.id);
  const eventSlug = parent.eventSlug ?? text(firstEvent?.slug);
  const slug = text(market.slug);
  const status = mapPolymarketStatus(market);

  const canonical: CanonicalMarket = {
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    id: buildCanonicalId(POLYMARKET_PLATFORM, sourceMarketId),
    platform: POLYMARKET_PLATFORM,
    sourceMarketId,
    sourceEventId,
    slug,
    title:
      firstText(market.question, market.groupItemTitle, slug) ?? sourceMarketId,
    shortTitle: text(market.groupItemTitle),
    description: text(market.description),
    status,
    outcomes: mapOutcomes(market),
    openTime: toTimestamp(market.startDate),
    closeTime: toTimestamp(market.endDate),
    resolvedTime: toTimestamp(market.closedTime),
    volume: toAmount(market.volume, market.volumeNum),
    volume24h: toAmount(market.volume24hr),
    liquidity: toAmount(market.liquidity, market.liquidityNum),
    resolutionSource: text(market.resolutionSource),
    sourceUrl: marketSourceUrl(slug, eventSlug),
    image: firstText(market.image, market.icon),
    capabilities: ctx.capabilities,
    platformDetails: compact<PolymarketMarketDetails>({
      platform: "polymarket",
      gamma: market,
      gammaMarketId: idText(market.id),
      gammaEventId: sourceEventId,
      negRisk: market.negRisk ?? undefined,
      acceptingOrders: market.acceptingOrders ?? undefined,
      archived: market.archived ?? undefined,
      bestBid: toNumber(market.bestBid),
      bestAsk: toNumber(market.bestAsk),
      lastTradePrice: toNumber(market.lastTradePrice),
      spread: toNumber(market.spread),
      oneDayPriceChange: toNumber(market.oneDayPriceChange),
      umaResolutionStatus: text(market.umaResolutionStatus),
      resolvedBy: text(market.resolvedBy),
    }),
    fetchedAt: ctx.fetchedAt,
  };
  return stripUndefined(canonical);
}

function mapTags(tags: Maybe<readonly GammaTagLike[]>): CanonicalTag[] {
  const mapped: CanonicalTag[] = [];
  for (const tag of tags ?? []) {
    const slug = text(tag.slug);
    if (slug === undefined) {
      continue;
    }
    const canonical: CanonicalTag = {
      platform: POLYMARKET_PLATFORM,
      slug,
      label: text(tag.label) ?? slug,
      kind: "native",
    };
    const sourceTagId = idText(tag.id);
    if (sourceTagId !== undefined) {
      canonical.sourceTagId = sourceTagId;
    }
    mapped.push(canonical);
  }
  return mapped;
}

function mapEventStatus(
  event: GammaEventLike,
  markets: readonly CanonicalMarket[]
): MarketStatus {
  const base = mapPolymarketStatus({
    active: event.active,
    closed: event.closed,
  });
  if (base !== "closed" || markets.length === 0) {
    return base;
  }
  if (markets.every((market) => market.status === "resolved")) {
    return "resolved";
  }
  if (markets.some((market) => market.status === "resolving")) {
    return "resolving";
  }
  return "closed";
}

export function mapGammaEvent(
  event: GammaEventLike,
  ctx: MapContext
): CanonicalEvent {
  const sourceEventId = idText(event.id) ?? String(event.id);
  const slug = text(event.slug) ?? "";
  const parent: MapGammaMarketParent = {
    sourceEventId,
    eventSlug: slug.length > 0 ? slug : undefined,
  };
  const markets: CanonicalMarket[] = [];
  for (const raw of event.markets ?? []) {
    const market = mapGammaMarket(raw, ctx, parent);
    if (market === null) {
      log.warn("gamma_market.skipped", {
        reason: "missing_condition_id",
        gammaEventId: sourceEventId,
        gammaMarketId: idText(raw.id) ?? null,
      });
      continue;
    }
    markets.push(market);
  }

  const canonical: CanonicalEvent = {
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    id: buildCanonicalId(POLYMARKET_PLATFORM, sourceEventId),
    platform: POLYMARKET_PLATFORM,
    sourceEventId,
    slug,
    title: firstText(event.title, event.slug) ?? sourceEventId,
    description: text(event.description),
    status: mapEventStatus(event, markets),
    markets,
    tags: mapTags(event.tags),
    image: firstText(event.image, event.icon),
    icon: text(event.icon),
    volume: toAmount(event.volume),
    volume24h: toAmount(event.volume24hr),
    liquidity: toAmount(event.liquidity),
    startTime: toTimestamp(event.startDate),
    endTime: toTimestamp(event.endDate),
    sourceUrl: slug.length > 0 ? `${POLYMARKET_SITE}/event/${slug}` : undefined,
    capabilities: ctx.capabilities,
    platformDetails: compact<PolymarketEventDetails>({
      platform: "polymarket",
      gamma: event,
      gammaEventId: sourceEventId,
      ticker: text(event.ticker),
      negRisk: event.negRisk ?? undefined,
      archived: event.archived ?? undefined,
      live: event.live ?? undefined,
      ended: event.ended ?? undefined,
      openInterest: toNumber(event.openInterest),
    }),
    fetchedAt: ctx.fetchedAt,
  };
  return stripUndefined(canonical);
}

/** Drops optional keys that resolved to undefined so JSON output stays tidy. */
function stripUndefined<T extends object>(value: T): T {
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (record[key] === undefined) {
      delete record[key];
    }
  }
  return value;
}
