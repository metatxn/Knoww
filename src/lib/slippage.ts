/**
 * Slippage calculation utilities for Polymarket orders
 *
 * Calculates actual slippage by walking the order book based on order size,
 * rather than using a fixed percentage.
 */

/**
 * Order book level representing a price point with size
 */
export interface OrderBookLevel {
  price: string;
  size: string;
}

/**
 * Order book data structure
 */
export interface OrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

/**
 * Result of slippage calculation
 */
export interface SlippageResult {
  /** Whether the order can be fully filled */
  canFill: boolean;
  /** Average fill price across all levels */
  avgFillPrice: number;
  /** Best price available (best ask for BUY, best bid for SELL) */
  bestPrice: number;
  /** Worst price that would be executed */
  worstPrice: number;
  /** Absolute slippage (avgFillPrice - bestPrice for BUY, bestPrice - avgFillPrice for SELL) */
  slippage: number;
  /** Slippage as a percentage of best price */
  slippagePercent: number;
  /** Total notional value: cost for BUY orders, proceeds for SELL orders */
  totalNotional: number;
  /** Breakdown of fills at each price level */
  fills: Array<{
    price: number;
    size: number;
    /** Notional value: cost for BUY, proceeds for SELL */
    notional: number;
  }>;
  /** Amount that couldn't be filled (if order book is too thin) */
  unfilledSize: number;
  /** Total size that can be filled */
  filledSize: number;
}

/**
 * Buffer added to worst price for market orders to ensure fill (0.5%)
 */
const MARKET_BUFFER = 0.005;

/**
 * Parse order book level to numbers
 * Returns null if the level is invalid (NaN or non-positive size)
 */
function parseLevel(
  level: OrderBookLevel
): { price: number; size: number } | null {
  const price = parseFloat(level.price);
  const size = parseFloat(level.size);

  // Filter out invalid levels
  if (!Number.isFinite(price) || !Number.isFinite(size) || size <= 0) {
    return null;
  }

  return { price, size };
}

/**
 * Round price UP to nearest tick size (for BUY orders)
 * Ensures we bid at least as high as the internal target
 */
export function roundUpToTick(price: number, tickSize: number): number {
  return Math.ceil(price / tickSize) * tickSize;
}

/**
 * Round price DOWN to nearest tick size (for SELL orders)
 * Ensures we never accidentally accept worse (lower) than the target
 */
export function roundDownToTick(price: number, tickSize: number): number {
  return Math.floor(price / tickSize) * tickSize;
}

/**
 * Round price to nearest tick size (for display purposes only)
 */
export function roundToTick(price: number, tickSize: number): number {
  return Math.round(price / tickSize) * tickSize;
}

/**
 * Create an empty slippage result for error cases
 */
function createEmptyResult(size: number): SlippageResult {
  return {
    canFill: false,
    avgFillPrice: 0,
    bestPrice: 0,
    worstPrice: 0,
    slippage: 0,
    slippagePercent: 0,
    totalNotional: 0,
    fills: [],
    unfilledSize: size,
    filledSize: 0,
  };
}

/**
 * Calculate slippage for a BUY order by walking the asks (sell orders)
 *
 * For a BUY order, we consume asks from lowest price to highest price.
 *
 * @param orderBook - The current order book
 * @param size - Number of shares to buy (must be > 0)
 * @returns SlippageResult with fill details
 * @throws Error if size is <= 0
 */
export function calculateBuySlippage(
  orderBook: OrderBook,
  size: number
): SlippageResult {
  // Validate order size
  if (size <= 0) {
    throw new Error("Order size must be greater than 0");
  }

  const asks = orderBook.asks || [];

  // Parse and filter invalid levels, then sort by price ascending (best first)
  const sortedAsks = asks
    .map(parseLevel)
    .filter((l): l is { price: number; size: number } => l !== null)
    .sort((a, b) => a.price - b.price);

  if (sortedAsks.length === 0) {
    return createEmptyResult(size);
  }

  const bestPrice = sortedAsks[0].price;
  let remainingSize = size;
  let totalCost = 0;
  const fills: SlippageResult["fills"] = [];
  let worstPrice = bestPrice;

  // Walk through asks from best to worst price
  for (const level of sortedAsks) {
    if (remainingSize <= 0) break;

    const fillSize = Math.min(remainingSize, level.size);
    const fillCost = fillSize * level.price;

    fills.push({
      price: level.price,
      size: fillSize,
      notional: fillCost,
    });

    totalCost += fillCost;
    remainingSize -= fillSize;
    worstPrice = level.price;
  }

  const filledSize = size - remainingSize;
  const avgFillPrice = filledSize > 0 ? totalCost / filledSize : 0;
  const slippage = avgFillPrice - bestPrice;
  const slippagePercent = bestPrice > 0 ? (slippage / bestPrice) * 100 : 0;

  return {
    canFill: remainingSize === 0,
    avgFillPrice,
    bestPrice,
    worstPrice,
    slippage,
    slippagePercent,
    totalNotional: totalCost,
    fills,
    unfilledSize: remainingSize,
    filledSize,
  };
}

/**
 * Calculate slippage for a SELL order by walking the bids (buy orders)
 *
 * For a SELL order, we consume bids from highest price to lowest price.
 *
 * @param orderBook - The current order book
 * @param size - Number of shares to sell (must be > 0)
 * @returns SlippageResult with fill details
 * @throws Error if size is <= 0
 */
export function calculateSellSlippage(
  orderBook: OrderBook,
  size: number
): SlippageResult {
  // Validate order size
  if (size <= 0) {
    throw new Error("Order size must be greater than 0");
  }

  const bids = orderBook.bids || [];

  // Parse and filter invalid levels, then sort by price descending (best first)
  const sortedBids = bids
    .map(parseLevel)
    .filter((l): l is { price: number; size: number } => l !== null)
    .sort((a, b) => b.price - a.price);

  if (sortedBids.length === 0) {
    return createEmptyResult(size);
  }

  const bestPrice = sortedBids[0].price;
  let remainingSize = size;
  let totalProceeds = 0;
  const fills: SlippageResult["fills"] = [];
  let worstPrice = bestPrice;

  // Walk through bids from best to worst price
  for (const level of sortedBids) {
    if (remainingSize <= 0) break;

    const fillSize = Math.min(remainingSize, level.size);
    const fillProceeds = fillSize * level.price;

    fills.push({
      price: level.price,
      size: fillSize,
      notional: fillProceeds,
    });

    totalProceeds += fillProceeds;
    remainingSize -= fillSize;
    worstPrice = level.price;
  }

  const filledSize = size - remainingSize;
  const avgFillPrice = filledSize > 0 ? totalProceeds / filledSize : 0;
  // For SELL, slippage is how much less we get than the best bid
  const slippage = bestPrice - avgFillPrice;
  const slippagePercent = bestPrice > 0 ? (slippage / bestPrice) * 100 : 0;

  return {
    canFill: remainingSize === 0,
    avgFillPrice,
    bestPrice,
    worstPrice,
    slippage,
    slippagePercent,
    totalNotional: totalProceeds,
    fills,
    unfilledSize: remainingSize,
    filledSize,
  };
}

/**
 * Calculate slippage for an order
 *
 * @param orderBook - The current order book
 * @param side - "BUY" or "SELL"
 * @param size - Number of shares (must be > 0)
 * @returns SlippageResult with fill details
 * @throws Error if size is <= 0
 */
export function calculateSlippage(
  orderBook: OrderBook,
  side: "BUY" | "SELL",
  size: number
): SlippageResult {
  if (side === "BUY") {
    return calculateBuySlippage(orderBook, size);
  } else {
    return calculateSellSlippage(orderBook, size);
  }
}

/**
 * Result of market order price calculation
 */
export interface MarketOrderPriceResult {
  /** The limit price to use for the "market" order */
  limitPrice: number;
  /** Expected slippage details */
  expectedSlippage: SlippageResult;
  /** Whether the calculated slippage exceeds the max tolerance */
  priceExceedsMaxSlippage: boolean;
}

/**
 * Calculate the limit price to use for a "market" order with max slippage tolerance
 *
 * This creates an aggressive limit order that should fill immediately
 * but won't exceed the specified slippage tolerance.
 *
 * @param orderBook - The current order book
 * @param side - "BUY" or "SELL"
 * @param size - Number of shares (must be > 0)
 * @param maxSlippagePercent - Maximum acceptable slippage as percentage (e.g., 2 for 2%)
 * @param tickSize - Market tick size for price rounding
 * @param requireFullFill - If true, returns null when order can't be fully filled (default: true)
 * @returns The limit price to use, or null if no valid price or insufficient liquidity
 */
export function calculateMarketOrderPrice(
  orderBook: OrderBook,
  side: "BUY" | "SELL",
  size: number,
  maxSlippagePercent: number = 2,
  tickSize: number = 0.01,
  requireFullFill: boolean = true
): MarketOrderPriceResult | null {
  // Validate inputs
  if (size <= 0) {
    return null;
  }

  const slippageResult = calculateSlippage(orderBook, side, size);

  // No liquidity at all
  if (slippageResult.fills.length === 0) {
    return null;
  }

  // If we require full fill and can't fill, return null
  if (requireFullFill && !slippageResult.canFill) {
    return null;
  }

  // Calculate the max acceptable price based on slippage tolerance
  const maxSlippageFraction = maxSlippagePercent / 100;

  let limitPrice: number;
  let priceExceedsMaxSlippage = false;

  if (side === "BUY") {
    // For BUY, max price = bestAsk * (1 + maxSlippage)
    const maxAcceptablePrice =
      slippageResult.bestPrice * (1 + maxSlippageFraction);

    // Use the worst price from our calculation, capped at max acceptable
    if (slippageResult.worstPrice > maxAcceptablePrice) {
      // Cap at max acceptable, round UP to tick (ensures we bid high enough)
      limitPrice = roundUpToTick(maxAcceptablePrice, tickSize);
      priceExceedsMaxSlippage = true;
    } else {
      // Add buffer to ensure fill, round UP to tick
      const priceWithBuffer = slippageResult.worstPrice * (1 + MARKET_BUFFER);
      limitPrice = roundUpToTick(priceWithBuffer, tickSize);
    }

    // Final cap at max acceptable (in case rounding pushed us over)
    limitPrice = Math.min(maxAcceptablePrice, limitPrice);

    // Cap at 0.99 (max valid price)
    limitPrice = Math.min(0.99, limitPrice);
  } else {
    // For SELL, min price = bestBid * (1 - maxSlippage)
    const minAcceptablePrice =
      slippageResult.bestPrice * (1 - maxSlippageFraction);

    // Use the worst price from our calculation, floored at min acceptable
    if (slippageResult.worstPrice < minAcceptablePrice) {
      // Floor at min acceptable, round DOWN to tick (ensures we don't sell too cheap)
      limitPrice = roundDownToTick(minAcceptablePrice, tickSize);
      priceExceedsMaxSlippage = true;
    } else {
      // Subtract buffer to ensure fill, round DOWN to tick
      const priceWithBuffer = slippageResult.worstPrice * (1 - MARKET_BUFFER);
      limitPrice = roundDownToTick(priceWithBuffer, tickSize);
    }

    // Final floor at min acceptable (in case rounding pushed us under)
    limitPrice = Math.max(minAcceptablePrice, limitPrice);

    // Floor at 0.01 (min valid price)
    limitPrice = Math.max(0.01, limitPrice);
  }

  return {
    limitPrice,
    expectedSlippage: slippageResult,
    priceExceedsMaxSlippage,
  };
}

/**
 * Format slippage for display
 *
 * @param slippage - SlippageResult from calculation
 * @param side - "BUY" or "SELL" for proper labeling
 * @returns Formatted strings for UI display
 */
export function formatSlippageDisplay(
  slippage: SlippageResult,
  side?: "BUY" | "SELL"
): {
  avgPrice: string;
  bestPrice: string;
  worstPrice: string;
  slippageAmount: string;
  slippagePercent: string;
  /** Label for totalNotional based on side */
  totalLabel: string;
  totalNotional: string;
  fillsDescription: string;
  filledSize: string;
  unfilledSize: string;
} {
  const formatPrice = (p: number) => `${(p * 100).toFixed(1)}¢`;
  const formatNotional = (n: number) => `$${n.toFixed(2)}`;

  return {
    avgPrice: formatPrice(slippage.avgFillPrice),
    bestPrice: formatPrice(slippage.bestPrice),
    worstPrice: formatPrice(slippage.worstPrice),
    slippageAmount: formatPrice(slippage.slippage),
    slippagePercent: `${slippage.slippagePercent.toFixed(2)}%`,
    totalLabel: side === "SELL" ? "Total Proceeds" : "Total Cost",
    totalNotional: formatNotional(slippage.totalNotional),
    fillsDescription: slippage.fills
      .map((f) => `${f.size.toFixed(0)} @ ${formatPrice(f.price)}`)
      .join(", "),
    filledSize: slippage.filledSize.toFixed(0),
    unfilledSize: slippage.unfilledSize.toFixed(0),
  };
}
