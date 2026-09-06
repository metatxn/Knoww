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

/** The ticket's side and size, as a platform sees them before an order. */
export interface OrderReadinessInput {
  side: TradingSide;
  /** What the ticket would spend, in the quote currency (USD). */
  totalUsd: number;
  shares: number;
  slot: TradingSlotProps | undefined;
  /** False until the wallet is connected; the platform then skips its checks. */
  enabled: boolean;
}

/**
 * "none": the order may go ahead. "setup": a one-time platform step comes
 * first (token approvals on an on-chain platform). "limit": a platform limit
 * the user already granted is below this ticket and must be raised.
 */
export type OrderReadinessStep = "none" | "setup" | "limit";

/** What a platform reports about the step, if any, that must precede an order. */
export interface OrderReadiness {
  /** True while the platform is still deciding; the ticket holds the order. */
  isChecking: boolean;
  requiredStep: OrderReadinessStep;
  /** True while `prepare` runs. */
  isPreparing: boolean;
  /** Runs the required step. Resolves true once the order may go ahead; throws on failure. */
  prepare: () => Promise<boolean>;
  /** Re-reads the platform's state after an order attempt. */
  refresh: () => Promise<void>;
}

/** A BUY ticket as a platform sees it before quoting the taker fee. */
export interface BuyFeeEstimateInput {
  side: TradingSide;
  slot: TradingSlotProps | undefined;
  shares: number;
  /** The limit price, or the marketable price the book gives, in USD. */
  price: number;
  /** What the ticket would spend before fees, in USD. */
  totalUsd: number;
  /** True when the BUY would cross the book at once. */
  isMarketableBuy: boolean;
  /** False until the wallet is connected; the platform then quotes nothing. */
  enabled: boolean;
}

/** What a platform reports about the taker fee a BUY would pay. */
export interface BuyFeeEstimate {
  /**
   * The fee in USD, `null` while unknown. Not `0`: a fee the platform could
   * not read is charged all the same, and "$0.00" would be a worse lie than
   * an empty row.
   */
  feeUsd: number | null;
  isFetching: boolean;
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
  /**
   * Decides whether a platform step must precede this ticket's order. A hook,
   * so it may hold queries; the ticket calls it once per render.
   */
  useOrderReadiness?: (input: OrderReadinessInput) => OrderReadiness;
  /**
   * The taker fee a BUY on this platform pays, quoted before the order. The
   * form calls it once per render like `useOrderReadiness`; absent means the
   * ticket shows no fee row.
   */
  useBuyFeeEstimate?: (input: BuyFeeEstimateInput) => BuyFeeEstimate;
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
