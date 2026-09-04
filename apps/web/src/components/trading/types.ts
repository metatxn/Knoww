import type {
  CanonicalMarket,
  CanonicalOutcome,
  PlatformDetails,
} from "@knoww/services/core";
import type { ComponentType } from "react";
import type {
  OrderBook,
  OutcomeData,
  PreparedTradeTicket,
  TradingSide,
} from "@/types/market";

/**
 * What a mount prices the ticket against: the live book, the platform's tick
 * and minimum size, and the platform specifics that only the platform's own
 * slot components and the ticket's order path read.
 */
export interface MarketQuote {
  bestBid?: number;
  bestAsk?: number;
  orderBook?: OrderBook;
  tickSize?: number;
  minOrderSize?: number;
  platformDetails?: PlatformDetails;
}

/**
 * Every TradingForm mount passes a canonical market, the selected canonical
 * outcome and the quote for it. The toggle list is `market.outcomes`.
 * See docs/decisions/2026-09-03-aggregator-platform-adapters.md, "Trading".
 */
export interface TradingFormProps {
  market: CanonicalMarket;
  outcome: CanonicalOutcome;
  onOutcomeChange: (outcome: CanonicalOutcome) => void;
  quote: MarketQuote;
  userBalance?: number;
  maxSlippagePercent?: number;
  onOrderSuccess?: (order: unknown) => void;
  onOrderError?: (error: Error) => void;
  yesProbability?: number;
  isLiveData?: boolean;
  initialSide?: TradingSide;
  initialShares?: number;
  preparedTradeTicket?: PreparedTradeTicket;
  disableSticky?: boolean;
}

/** What a platform's optional trading slots receive. */
export interface TradingSlotProps {
  market: CanonicalMarket;
  outcome: CanonicalOutcome;
  details: PlatformDetails | undefined;
}

/**
 * A platform's optional trading UI. Each slot renders from the canonical
 * market and the quote's platform details; the ticket decides when a slot is
 * shown (the extras only once the user can trade on the platform).
 */
export interface PlatformTradingUi {
  /** Inline badge beside the market title, such as Polymarket's "Neg Risk". */
  MarketBadge?: ComponentType<TradingSlotProps>;
  /** Extra actions beside the order-type tabs, such as split and merge. */
  TradingExtras?: ComponentType<TradingSlotProps>;
}

/**
 * The ticket's own props, derived from TradingFormProps by TradingForm. Token
 * ids, the condition id and neg-risk keep the CLOB's shape here until the
 * CLOB hooks sit behind the trading adapter; nothing outside the ticket and
 * its state hook should build these.
 */
export interface TradingTicketProps {
  marketTitle: string;
  tokenId: string;
  outcomes: OutcomeData[];
  selectedOutcomeIndex: number;
  onOutcomeChange: (index: number) => void;
  negRisk?: boolean;
  userBalance?: number;
  tickSize?: number;
  minOrderSize?: number;
  bestBid?: number;
  bestAsk?: number;
  orderBook?: OrderBook;
  maxSlippagePercent?: number;
  onOrderSuccess?: (order: unknown) => void;
  onOrderError?: (error: Error) => void;
  marketImage?: string;
  yesProbability?: number;
  isLiveData?: boolean;
  initialSide?: TradingSide;
  initialShares?: number;
  preparedTradeTicket?: PreparedTradeTicket;
  conditionId?: string;
  disableSticky?: boolean;
  platformUi?: PlatformTradingUi;
  slot?: TradingSlotProps;
}
