import type { MarketCapabilities } from "./capabilities";
import type { PlatformId } from "./ids";

/**
 * Canonical market model, version 1. Shapes follow docs/single-api-layer.md
 * (Canonical model) and the ADR docs/decisions/2026-09-03-aggregator-platform-adapters.md.
 *
 * Widening rule: a field joins this model only when at least two platforms
 * can populate it. Anything else lives in `platformDetails`.
 */
export const CANONICAL_SCHEMA_VERSION = "1";
export type CanonicalSchemaVersion = typeof CANONICAL_SCHEMA_VERSION;

/** Decimal number serialized as a string, never a float. Prices sit in 0..1. */
export type DecimalString = string;

export interface DecimalAmount {
  value: DecimalString;
  /** ISO 4217 code or platform settlement unit, e.g. "USD". */
  unit: string;
}

/** ISO 8601 timestamp with offset. */
export type IsoTimestamp = string;

export type MarketStatus =
  | "unopened"
  | "active"
  | "paused"
  | "closed"
  | "resolving"
  | "resolved"
  | "unknown";

/**
 * Platform-specific extras. Each platform folder exports its own concrete
 * shape plus a type guard; consumers outside the escape-hatch folders treat
 * this as opaque.
 */
export interface PlatformDetails {
  platform: PlatformId;
  [key: string]: unknown;
}

export interface CanonicalOutcome {
  /** `platform:sourceOutcomeId`. */
  id: string;
  /** Polymarket CLOB token id; Kalshi `${ticker}:yes` or `${ticker}:no`. */
  sourceOutcomeId: string;
  /**
   * Gamma outcome name; Kalshi `yes_sub_title` / `no_sub_title`, else Yes / No.
   */
  label: string;
  /**
   * CLOB midpoint or Gamma outcome price; Kalshi `last_price` scaled from cents
   * to 0..1.
   */
  price?: DecimalString;
  /**
   * CLOB best bid; Kalshi `yes_bid` (the No side is derived as 1 minus the Yes
   * ask).
   */
  bestBid?: DecimalString;
  /**
   * CLOB best ask; Kalshi `yes_ask` (the No side is derived as 1 minus the Yes
   * bid).
   */
  bestAsk?: DecimalString;
  /** Polymarket UMA result; Kalshi `result` once the market settles. */
  isWinner?: boolean;
}

export interface CanonicalMarket {
  schemaVersion: CanonicalSchemaVersion;
  /** `platform:sourceMarketId`. */
  id: string;
  platform: PlatformId;
  sourceMarketId: string;
  /** Gamma event id; Kalshi `event_ticker`. */
  sourceEventId?: string;
  /** Platform URL slug, kept separate from the id. */
  slug?: string;
  title: string;
  /** Short label used when the market sits inside a multi-market event. */
  shortTitle?: string;
  /** Gamma description; Kalshi `subtitle`. */
  description?: string;
  status: MarketStatus;
  outcomes: CanonicalOutcome[];
  /** Gamma startDate; Kalshi `open_time`. */
  openTime?: IsoTimestamp;
  /** Gamma endDate; Kalshi `close_time`. */
  closeTime?: IsoTimestamp;
  /** Gamma closedTime; Kalshi `expiration_time` on settled markets. */
  resolvedTime?: IsoTimestamp;
  /**
   * Gamma volumeNum in USD; Kalshi `volume` in contracts (the unit says which).
   */
  volume?: DecimalAmount;
  /** Gamma volume24hr in USD; Kalshi `volume_24h` in contracts. */
  volume24h?: DecimalAmount;
  /** Gamma liquidityNum in USD; Kalshi `liquidity` in cents scaled to USD. */
  liquidity?: DecimalAmount;
  /** Polymarket null; Kalshi `open_interest` in contracts. */
  openInterest?: DecimalAmount;
  /** Gamma description; Kalshi `rules_primary` plus `rules_secondary`. */
  resolutionRules?: string;
  /** Gamma resolutionSource; Kalshi null. */
  resolutionSource?: string;
  /** polymarket.com event URL; kalshi.com market URL built from the ticker. */
  sourceUrl?: string;
  /** Gamma image; Kalshi null. */
  image?: string;
  capabilities: MarketCapabilities;
  platformDetails?: PlatformDetails;
  fetchedAt: IsoTimestamp;
}

export type TagKind = "taxonomy" | "native";

export interface CanonicalTag {
  platform: PlatformId;
  /** Knoww taxonomy slug when mapped, otherwise the platform's own slug. */
  slug: string;
  /** Gamma tag label; Kalshi category name. */
  label: string;
  kind: TagKind;
  /** Gamma tag id; Kalshi category name or series ticker. */
  sourceTagId?: string;
}

export interface CanonicalEvent {
  schemaVersion: CanonicalSchemaVersion;
  /** `platform:sourceEventId`. */
  id: string;
  platform: PlatformId;
  sourceEventId: string;
  slug: string;
  title: string;
  /** Gamma description; Kalshi `sub_title`. */
  description?: string;
  status: MarketStatus;
  markets: CanonicalMarket[];
  /** Gamma tags; Kalshi `category` as one native tag. */
  tags: CanonicalTag[];
  /** Gamma image; Kalshi null. */
  image?: string;
  /** Gamma icon; Kalshi null. */
  icon?: string;
  /**
   * Gamma volume in USD; Kalshi the sum of its markets' `volume` in contracts.
   */
  volume?: DecimalAmount;
  /** Gamma volume24hr in USD; Kalshi the sum of its markets' `volume_24h`. */
  volume24h?: DecimalAmount;
  /** Gamma liquidity in USD; Kalshi the sum of its markets' `liquidity`. */
  liquidity?: DecimalAmount;
  /** Gamma startDate; Kalshi the earliest market `open_time`. */
  startTime?: IsoTimestamp;
  /** Gamma endDate; Kalshi the latest market `close_time`. */
  endTime?: IsoTimestamp;
  /**
   * polymarket.com event URL; kalshi.com event URL built from `event_ticker`.
   */
  sourceUrl?: string;
  capabilities: MarketCapabilities;
  platformDetails?: PlatformDetails;
  fetchedAt: IsoTimestamp;
}

export interface CanonicalOrderbookLevel {
  price: DecimalString;
  size: DecimalString;
}

export interface CanonicalOrderbook {
  marketId: string;
  outcomeId: string;
  platform: PlatformId;
  bids: CanonicalOrderbookLevel[];
  asks: CanonicalOrderbookLevel[];
  fetchedAt: IsoTimestamp;
}

export interface CanonicalPricePoint {
  time: IsoTimestamp;
  price: DecimalString;
}

export interface CanonicalPriceHistory {
  marketId: string;
  outcomeId: string;
  platform: PlatformId;
  points: CanonicalPricePoint[];
  fetchedAt: IsoTimestamp;
}

export type TradeSide = "buy" | "sell";

export interface CanonicalTrade {
  id?: string;
  marketId: string;
  outcomeId: string;
  platform: PlatformId;
  side: TradeSide;
  price: DecimalString;
  size: DecimalString;
  time: IsoTimestamp;
  /** Wallet address or platform handle when the platform exposes one. */
  trader?: string;
}

export interface Page<T> {
  items: T[];
  /** Opaque, platform-owned. Absent on the last page. */
  nextCursor?: string;
  /** Total matching items, only when the platform reports it. */
  totalResults?: number;
}
