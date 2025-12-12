"use client";

import { useAppKit } from "@reown/appkit/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  Loader2,
  Wallet,
  Wifi,
  Zap,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnection } from "wagmi";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { calculatePotentialPnL, OrderSide } from "@/hooks/use-order-signing";
import {
  useClobClient,
  Side,
  OrderType as ClobOrderType,
} from "@/hooks/use-clob-client";
import { useQuery } from "@tanstack/react-query";
import { useOnboarding } from "@/context/onboarding-context";
import { useProxyWallet } from "@/hooks/use-proxy-wallet";
import {
  calculateSlippage,
  formatSlippageDisplay,
  roundUpToTick,
  roundDownToTick,
  type OrderBook,
  type SlippageResult,
} from "@/lib/slippage";

/**
 * Outcome data for the trading form
 */
export interface OutcomeData {
  name: string;
  tokenId: string;
  price: number; // Current price (0-1)
  probability: number; // Current probability (0-100)
}

/**
 * Props for the TradingForm component
 */
export interface TradingFormProps {
  /** Market question/title */
  marketTitle: string;
  /** Token ID for the selected outcome */
  tokenId: string;
  /** Available outcomes for this market */
  outcomes: OutcomeData[];
  /** Currently selected outcome index */
  selectedOutcomeIndex: number;
  /** Callback when outcome selection changes */
  onOutcomeChange: (index: number) => void;
  /** Whether this is a negative risk market */
  negRisk?: boolean;
  /** User's USDC balance (optional) */
  userBalance?: number;
  /** Market tick size (default: 0.01) */
  tickSize?: number;
  /** Market minimum order size in USDC (default: 1) */
  minOrderSize?: number;
  /** Best bid price from order book (for spread warning) */
  bestBid?: number;
  /** Best ask price from order book (for spread warning) */
  bestAsk?: number;
  /** Full order book for slippage calculation */
  orderBook?: OrderBook;
  /** Max slippage percentage for market orders (default: 2 = 2%) */
  maxSlippagePercent?: number;
  /** Callback after successful order submission */
  onOrderSuccess?: (order: unknown) => void;
  /** Callback after order error */
  onOrderError?: (error: Error) => void;
  /** Market image URL for header */
  marketImage?: string;
  /** Yes probability for header display */
  yesProbability?: number;
  /** Whether order book data is from live WebSocket */
  isLiveData?: boolean;
}

/**
 * Default max slippage for market orders (2%)
 */
const DEFAULT_MAX_SLIPPAGE_PERCENT = 2;

/**
 * Round price to nearest tick size
 */
function roundToTick(price: number, tickSize: number): number {
  return Math.round(price / tickSize) * tickSize;
}

/**
 * Check if price crosses the book significantly (> 5% from best price)
 */
function isPriceCrossingBook(
  price: number,
  side: "BUY" | "SELL",
  bestBid?: number,
  bestAsk?: number
): { isCrossing: boolean; percentAbove?: number } {
  if (side === "BUY" && bestAsk !== undefined) {
    // For BUY orders, check if price is significantly above best ask
    if (price > bestAsk) {
      const percentAbove = ((price - bestAsk) / bestAsk) * 100;
      return { isCrossing: percentAbove > 5, percentAbove };
    }
  } else if (side === "SELL" && bestBid !== undefined) {
    // For SELL orders, check if price is significantly below best bid
    if (price < bestBid) {
      const percentBelow = ((bestBid - price) / bestBid) * 100;
      return { isCrossing: percentBelow > 5, percentAbove: -percentBelow };
    }
  }
  return { isCrossing: false };
}

/**
 * Trading side type
 */
type TradingSide = "BUY" | "SELL";

/**
 * Order type selection
 */
type OrderTypeSelection = "LIMIT" | "MARKET";

/**
 * TradingForm Component
 *
 * A comprehensive trading form for placing limit and market orders
 * on Polymarket prediction markets.
 *
 * Features:
 * - Buy/Sell toggle
 * - Limit/Market order type selection
 * - Price input with +/- controls
 * - Shares input with quick adjustment buttons
 * - Expiration toggle
 * - Real-time cost/payout calculation
 * - Wallet connection integration
 */
export function TradingForm({
  marketTitle,
  outcomes,
  selectedOutcomeIndex,
  onOutcomeChange,
  negRisk = false,
  userBalance,
  tickSize = 0.01,
  minOrderSize = 1,
  bestBid,
  bestAsk,
  orderBook,
  maxSlippagePercent = DEFAULT_MAX_SLIPPAGE_PERCENT,
  onOrderSuccess,
  onOrderError,
  marketImage,
  yesProbability,
  isLiveData = false,
}: TradingFormProps) {
  const { isConnected } = useConnection();
  const { open } = useAppKit();
  const {
    createOrder,
    isLoading,
    error,
    hasCredentials,
    deriveCredentials,
    canTrade,
    updateAllowance,
    getUsdcBalance,
    getUsdcAllowance,
  } = useClobClient();

  // Get proxy wallet address for balance/allowance checks
  const { proxyAddress, isDeployed: hasProxyWallet } = useProxyWallet();

  // Use the global onboarding context
  const { setShowOnboarding } = useOnboarding();

  // Form state
  const [side, setSide] = useState<TradingSide>("BUY");
  const [orderType, setOrderType] = useState<OrderTypeSelection>("MARKET");
  const [limitPrice, setLimitPrice] = useState<number>(0.5);
  const [shares, setShares] = useState<number>(10);
  const [useExpiration, setUseExpiration] = useState<boolean>(false);
  const [expirationHours, setExpirationHours] = useState<number>(24);
  const [isUpdatingAllowance, setIsUpdatingAllowance] = useState(false);

  // Get selected outcome
  const selectedOutcome = outcomes[selectedOutcomeIndex];

  // Check if the selected outcome has a valid CLOB token ID
  // CLOB token IDs are long numeric strings (typically 70+ characters)
  const hasValidTokenId = Boolean(
    selectedOutcome?.tokenId && selectedOutcome.tokenId.length > 10
  );

  // Update limit price when outcome changes
  useEffect(() => {
    if (selectedOutcome) {
      setLimitPrice(Number(selectedOutcome.price.toFixed(2)));
    }
  }, [selectedOutcome]);

  // Calculate slippage by walking the order book based on order size
  // Only calculate for market orders with valid share count
  const slippageResult: SlippageResult | null = useMemo(() => {
    if (!orderBook || orderType !== "MARKET" || shares <= 0) return null;
    try {
      return calculateSlippage(orderBook, side, shares);
    } catch {
      return null;
    }
  }, [orderBook, orderType, side, shares]);

  // Check if order can be fully filled (for market orders)
  const canFullyFill = slippageResult?.canFill ?? true;

  // Calculate market order price based on actual order book depth
  // Uses direction-aware rounding: roundUp for BUY, roundDown for SELL
  const marketOrderPrice = useMemo(() => {
    if (slippageResult && slippageResult.canFill) {
      // Use the worst price from the slippage calculation + buffer
      // Direction-aware rounding ensures we stay within user intent
      if (side === "BUY") {
        const priceWithBuffer = slippageResult.worstPrice * 1.005; // 0.5% buffer
        // Round UP for BUY to ensure we bid high enough
        return Math.min(0.99, roundUpToTick(priceWithBuffer, tickSize));
      } else {
        const priceWithBuffer = slippageResult.worstPrice * 0.995; // 0.5% buffer
        // Round DOWN for SELL to ensure we don't sell too cheap
        return Math.max(0.01, roundDownToTick(priceWithBuffer, tickSize));
      }
    }

    // Fallback: use best bid/ask with percentage-based slippage
    const maxSlippageFraction = maxSlippagePercent / 100;
    if (side === "BUY") {
      const basePrice = bestAsk ?? selectedOutcome?.price ?? 0.5;
      const priceWithSlippage = basePrice * (1 + maxSlippageFraction);
      return Math.min(0.99, roundUpToTick(priceWithSlippage, tickSize));
    } else {
      const basePrice = bestBid ?? selectedOutcome?.price ?? 0.5;
      const priceWithSlippage = basePrice * (1 - maxSlippageFraction);
      return Math.max(0.01, roundDownToTick(priceWithSlippage, tickSize));
    }
  }, [
    slippageResult,
    side,
    tickSize,
    maxSlippagePercent,
    bestAsk,
    bestBid,
    selectedOutcome?.price,
  ]);

  // Format slippage for display
  const slippageDisplay = useMemo(() => {
    if (!slippageResult) return null;
    return formatSlippageDisplay(slippageResult, side);
  }, [slippageResult, side]);

  // Check if slippage exceeds max tolerance
  const slippageExceedsMax = useMemo(() => {
    if (!slippageResult) return false;
    return slippageResult.slippagePercent > maxSlippagePercent;
  }, [slippageResult, maxSlippagePercent]);

  // Calculate costs and potential returns
  const calculations = useMemo(() => {
    // For market orders, use the calculated market price with slippage
    // For limit orders, use the user-specified limit price
    const price = orderType === "MARKET" ? marketOrderPrice : limitPrice;
    const orderSide = side === "BUY" ? OrderSide.BUY : OrderSide.SELL;
    const pnl = calculatePotentialPnL(price, shares, orderSide);

    // For market orders with slippage calculation, use the actual total notional
    const total =
      orderType === "MARKET" && slippageResult
        ? slippageResult.totalNotional
        : pnl.cost;

    return {
      price,
      total,
      potentialWin: pnl.potentialWin,
      potentialLoss: pnl.potentialLoss,
      returnPercent:
        total > 0 ? ((pnl.potentialWin / total) * 100).toFixed(1) : "0",
    };
  }, [side, orderType, limitPrice, marketOrderPrice, shares, slippageResult]);

  // Fetch USDC balance from the PROXY WALLET (not EOA)
  // Trading funds are held in the proxy wallet, so we need to check that balance
  const { data: onChainBalance, refetch: refetchBalance } = useQuery({
    queryKey: ["usdcBalance", proxyAddress, hasProxyWallet],
    queryFn: () => getUsdcBalance(proxyAddress || undefined),
    enabled: isConnected && hasProxyWallet && !!proxyAddress,
    staleTime: 15_000, // 15 seconds
    refetchInterval: 30_000, // Refetch every 30 seconds
  });

  // Fetch USDC allowance from the PROXY WALLET (not EOA)
  // Allowance is set on the proxy wallet for the CTF Exchange
  const { data: onChainAllowance, refetch: refetchAllowance } = useQuery({
    queryKey: ["usdcAllowance", proxyAddress, hasProxyWallet],
    queryFn: () => getUsdcAllowance(proxyAddress || undefined),
    enabled: isConnected && hasProxyWallet && !!proxyAddress,
    staleTime: 15_000, // 15 seconds
    refetchInterval: 30_000, // Refetch every 30 seconds
  });

  // Use on-chain USDC balance and allowance (more accurate)
  const usdcBalance = onChainBalance?.balance;
  const allowance = onChainAllowance?.allowance;

  // Check allowance status
  const hasInsufficientAllowance =
    allowance !== undefined && calculations.total > allowance;
  const hasNoAllowance = allowance !== undefined && allowance === 0;

  // Handle setting allowance
  const handleSetAllowance = useCallback(async () => {
    setIsUpdatingAllowance(true);
    try {
      await updateAllowance();
      // Refetch both balance and allowance after approval
      await Promise.all([refetchBalance(), refetchAllowance()]);
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error("Failed to set allowance");
      onOrderError?.(error);
    } finally {
      setIsUpdatingAllowance(false);
    }
  }, [updateAllowance, refetchBalance, refetchAllowance, onOrderError]);

  // Handle price change with bounds and tick size
  const handlePriceChange = useCallback(
    (delta: number) => {
      setLimitPrice((prev) => {
        // Use tick size for delta (default 0.01)
        const actualDelta = delta > 0 ? tickSize : -tickSize;
        const newPrice = roundToTick(prev + actualDelta, tickSize);
        return Math.max(tickSize, Math.min(1 - tickSize, newPrice));
      });
    },
    [tickSize]
  );

  // Handle shares change with bounds
  const handleSharesChange = useCallback((delta: number) => {
    setShares((prev) => Math.max(1, prev + delta));
  }, []);

  // Handle deriving credentials (one-time setup)
  const handleDeriveCredentials = useCallback(async () => {
    try {
      await deriveCredentials();
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error("Failed to derive credentials");
      onOrderError?.(error);
    }
  }, [deriveCredentials, onOrderError]);

  // Handle order submission
  const handleSubmit = useCallback(async () => {
    if (!canTrade || !selectedOutcome || !hasValidTokenId) return;

    try {
      // Determine order type and expiration
      // Polymarket only supports limit orders, but we simulate "market" orders
      // by using aggressive limit prices with FOK (Fill Or Kill)
      //
      // Order Types:
      // - GTC (Good Till Cancelled): limit order that stays until filled/cancelled
      // - GTD (Good Till Date): limit order with expiration timestamp
      // - FOK (Fill Or Kill): must fill immediately or cancel (used for "market" orders)
      //
      // For "market" orders:
      // - BUY: use best ask + maxSlippage as limit price
      // - SELL: use best bid - maxSlippage as limit price
      // This creates an aggressive limit order that should fill immediately
      // but won't eat through the entire order book
      const isGTD = useExpiration && orderType === "LIMIT";
      const clobOrderType =
        orderType === "MARKET"
          ? ClobOrderType.FOK // Market orders use FOK for immediate execution
          : isGTD
          ? ClobOrderType.GTD
          : ClobOrderType.GTC;

      // Only set expiration for GTD orders, otherwise use 0
      const expiration = isGTD
        ? Math.floor(Date.now() / 1000) + expirationHours * 60 * 60
        : 0;

      // Use the calculated price (includes slippage for market orders)
      const orderPrice = orderType === "MARKET" ? marketOrderPrice : limitPrice;

      const result = await createOrder({
        tokenId: selectedOutcome.tokenId,
        price: orderPrice,
        size: shares,
        side: side === "BUY" ? Side.BUY : Side.SELL,
        orderType: clobOrderType,
        expiration,
      });

      if (result.success) {
        onOrderSuccess?.(result.order);
        // Reset form
        setShares(10);
      } else {
        throw new Error("Order failed");
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Order failed");
      onOrderError?.(error);
    }
  }, [
    canTrade,
    selectedOutcome,
    hasValidTokenId,
    side,
    orderType,
    limitPrice,
    marketOrderPrice,
    shares,
    useExpiration,
    expirationHours,
    createOrder,
    onOrderSuccess,
    onOrderError,
  ]);

  // Format price as cents
  const formatCents = (price: number) => `${(price * 100).toFixed(1)}¢`;

  // Check if user has sufficient balance (use fetched balance or prop)
  const effectiveBalance = usdcBalance ?? userBalance;
  const hasInsufficientBalance =
    effectiveBalance !== undefined && calculations.total > effectiveBalance;

  // Check minimum order size (use prop or default to $1)
  const isBelowMinimum = calculations.total < minOrderSize;

  // Check if price crosses the book significantly
  const spreadWarning = useMemo(() => {
    if (orderType === "MARKET") return null; // Market orders always cross
    return isPriceCrossingBook(limitPrice, side, bestBid, bestAsk);
  }, [orderType, limitPrice, side, bestBid, bestAsk]);

  // Calculate balance progress for visual indicator
  const balanceProgress = useMemo(() => {
    if (!effectiveBalance || calculations.total <= 0) return 100;
    return Math.min(100, (effectiveBalance / calculations.total) * 100);
  }, [effectiveBalance, calculations.total]);

  // Calculate profit percentage for display
  const profitPercent = useMemo(() => {
    if (calculations.total <= 0) return 0;
    return ((calculations.potentialWin / calculations.total) * 100).toFixed(1);
  }, [calculations.potentialWin, calculations.total]);

  return (
    <div className="sticky top-4 w-full">
      {/* Single Card Container */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
        {/* Market Header - Merged into card */}
        <div className="flex items-center gap-3 p-4 border-b border-border">
          {marketImage && (
            <div className="relative w-10 h-10 shrink-0">
              <Image
                src={marketImage}
                alt={marketTitle || "Market"}
                fill
                sizes="40px"
                className="rounded-full object-cover"
              />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm truncate">{marketTitle}</h3>
              {/* Live data indicator */}
              {isLiveData && (
                <div className="flex items-center gap-1">
                  <Wifi className="h-3 w-3 text-emerald-500" />
                  <span className="text-[10px] text-emerald-500">Live</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {negRisk && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-500/10 text-red-500">
                  Neg Risk
                </span>
              )}
              <span className="text-xs text-emerald-500 font-medium">
                {yesProbability ??
                  Math.round((selectedOutcome?.price ?? 0) * 100)}
                % Yes
              </span>
            </div>
          </div>
        </div>

        {/* Order Type Toggle */}
        <div className="p-4 pb-3">
          <div className="flex rounded-xl bg-muted p-1">
            <button
              type="button"
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2 ${
                orderType === "MARKET"
                  ? "bg-background text-foreground shadow-md border border-border/50"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setOrderType("MARKET")}
            >
              <Zap className="h-3.5 w-3.5" />
              Market
            </button>
            <button
              type="button"
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all ${
                orderType === "LIMIT"
                  ? "bg-background text-foreground shadow-md border border-border/50"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setOrderType("LIMIT")}
            >
              Limit
            </button>
          </div>
        </div>

        {/* Buy/Sell Toggle */}
        <div className="px-4 pb-3">
          <div className="flex rounded-xl border border-border p-1">
            <button
              type="button"
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2 ${
                side === "BUY"
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setSide("BUY")}
            >
              <TrendingUp className="h-3.5 w-3.5" />
              Buy
            </button>
            <button
              type="button"
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2 ${
                side === "SELL"
                  ? "bg-red-500/10 text-red-600 dark:text-red-400"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setSide("SELL")}
            >
              <TrendingDown className="h-3.5 w-3.5" />
              Sell
            </button>
          </div>
        </div>

        {/* Outcome Selector */}
        <div className="px-4 pb-3">
          <div className="flex gap-2">
            {outcomes.map((outcome, idx) => (
              <button
                key={outcome.tokenId}
                type="button"
                className={`flex-1 relative px-4 py-3 rounded-xl border-2 transition-all ${
                  selectedOutcomeIndex === idx
                    ? outcome.name === "Yes"
                      ? "border-emerald-500 bg-emerald-500/5"
                      : "border-red-500 bg-red-500/5"
                    : "border-border hover:border-muted-foreground/50 bg-secondary/30"
                }`}
                onClick={() => onOutcomeChange(idx)}
              >
                {/* Active indicator dot */}
                {selectedOutcomeIndex === idx && (
                  <span
                    className={`absolute top-2 right-2 h-2 w-2 rounded-full ${
                      outcome.name === "Yes" ? "bg-emerald-500" : "bg-red-500"
                    }`}
                  />
                )}
                <span
                  className={`block text-sm font-medium ${
                    outcome.name === "Yes"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : outcome.name === "No"
                      ? "text-red-600 dark:text-red-400"
                      : "text-foreground"
                  }`}
                >
                  {outcome.name}
                </span>
                <span className="block text-lg font-semibold font-mono text-foreground mt-0.5">
                  {(outcome.price * 100).toFixed(1)}¢
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Execution Info */}
        <div className="px-4 pb-3">
          <div className="rounded-xl bg-secondary/30 p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Est. Execution</span>
              <span
                className={`font-medium ${
                  slippageExceedsMax
                    ? "text-amber-500"
                    : "text-muted-foreground"
                }`}
              >
                {slippageDisplay?.slippagePercent || "0.00%"} slippage
              </span>
              <span className="text-muted-foreground">Avg Fill</span>
              <span className="font-mono font-medium text-foreground">
                {slippageDisplay?.avgPrice || formatCents(calculations.price)}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                Best {side === "BUY" ? "Ask" : "Bid"}
              </span>
              <span className="font-mono text-foreground">
                {slippageDisplay?.bestPrice ||
                  formatCents(side === "BUY" ? bestAsk || 0 : bestBid || 0)}
              </span>
              <span className="text-muted-foreground">Worst Price</span>
              <span className="font-mono text-foreground">
                {slippageDisplay?.worstPrice || formatCents(calculations.price)}
              </span>
            </div>
          </div>
        </div>

        {/* Shares Section */}
        <div className="px-4 pb-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">Shares</span>
            <button
              type="button"
              className="text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 font-medium"
              onClick={() => {
                if (effectiveBalance && calculations.price > 0) {
                  const maxShares = Math.floor(
                    effectiveBalance / calculations.price
                  );
                  setShares(Math.max(1, maxShares));
                }
              }}
            >
              Max
            </button>
          </div>

          {/* Shares Input with flanking buttons */}
          <div className="flex flex-wrap md:flex-nowrap items-stretch gap-2">
            {/* Left decrement buttons */}
            <div className="flex gap-1 w-full md:w-auto">
              <button
                type="button"
                className="px-3 py-2 text-xs font-medium text-muted-foreground rounded-lg border border-border hover:bg-secondary/50 hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-1 md:flex-none"
                onClick={() => handleSharesChange(-10)}
                disabled={shares <= 10}
              >
                -10
              </button>
              <button
                type="button"
                className="px-3 py-2 text-xs font-medium text-muted-foreground rounded-lg border border-border hover:bg-secondary/50 hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={() => handleSharesChange(-1)}
                disabled={shares <= 1}
              >
                -1
              </button>
            </div>

            {/* Center input */}
            <input
              type="number"
              value={shares}
              onChange={(e) => {
                const val = Number.parseInt(e.target.value, 10);
                if (!Number.isNaN(val)) {
                  setShares(Math.max(1, val));
                }
              }}
              min={1}
              className="flex-1 min-w-[140px] bg-secondary/30 border border-border rounded-xl px-3 py-3 text-center text-base sm:text-lg font-semibold font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
            />

            {/* Right increment buttons */}
            <div className="flex gap-1 w-full md:w-auto">
              <button
                type="button"
                className="px-3 py-2 text-xs font-medium text-muted-foreground rounded-lg border border-border hover:bg-secondary/50 hover:text-foreground transition-colors flex-1 md:flex-none"
                onClick={() => handleSharesChange(1)}
              >
                +1
              </button>
              <button
                type="button"
                className="px-3 py-2 text-xs font-medium text-muted-foreground rounded-lg border border-border hover:bg-secondary/50 hover:text-foreground transition-colors flex-1 md:flex-none"
                onClick={() => handleSharesChange(10)}
              >
                +10
              </button>
            </div>
          </div>

          {/* FOK Notice */}
          {orderType === "MARKET" && (
            <p className="text-[11px] text-muted-foreground leading-relaxed mt-2">
              <span className="font-medium">FOK:</span> Order fills immediately
              or cancels
            </p>
          )}
        </div>

        {/* Totals Section */}
        <div className="px-4 pb-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total Cost</span>
              <span className="text-lg font-semibold text-foreground">
                ${calculations.total.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Potential Return
              </span>
              <span className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
                ${(calculations.total + calculations.potentialWin).toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Profit if {selectedOutcome?.name || "Yes"}
              </span>
              <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                +${calculations.potentialWin.toFixed(2)} ({profitPercent}%)
              </span>
            </div>
          </div>
        </div>

        {/* Error Display */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="px-4 pb-3"
            >
              <div className="flex items-center gap-3 p-3 bg-destructive/10 border border-destructive/20 rounded-xl">
                <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                <span className="text-sm text-destructive">
                  {error.message}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Insufficient Balance Warning with Progress Bar */}
        <AnimatePresence>
          {hasInsufficientBalance && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="px-4 pb-3"
            >
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-2">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
                    Insufficient balance. Need $
                    {(calculations.total - (effectiveBalance || 0)).toFixed(2)}{" "}
                    more.
                  </span>
                </div>
                {/* Progress bar */}
                <div className="h-1.5 bg-amber-500/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full transition-all duration-300"
                    style={{ width: `${balanceProgress}%` }}
                  />
                </div>
                <p className="text-xs text-amber-600/80 dark:text-amber-400/80">
                  ${effectiveBalance?.toFixed(2) || "0.00"} / $
                  {calculations.total.toFixed(2)} USDC.e
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Insufficient Allowance Warning */}
        <AnimatePresence>
          {(hasNoAllowance || hasInsufficientAllowance) &&
            !hasInsufficientBalance && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="px-4 pb-3 space-y-3"
              >
                <div className="flex items-center gap-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                  <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span className="text-sm text-blue-600 dark:text-blue-400">
                    {hasNoAllowance
                      ? "Approve USDC.e spending to trade"
                      : `Increase allowance to $${calculations.total.toFixed(
                          2
                        )}`}
                  </span>
                </div>
                <Button
                  type="button"
                  className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl"
                  onClick={handleSetAllowance}
                  disabled={isUpdatingAllowance}
                >
                  {isUpdatingAllowance ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Approving...
                    </>
                  ) : (
                    "Approve USDC.e"
                  )}
                </Button>
              </motion.div>
            )}
        </AnimatePresence>

        {/* Submit Button */}
        <div className="p-4 pt-1">
          {!isConnected ? (
            <button
              type="button"
              className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20"
              onClick={() => open()}
            >
              <Wallet className="h-4 w-4" />
              Connect Wallet to Trade
            </button>
          ) : !hasCredentials ? (
            <button
              type="button"
              className="w-full h-12 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-medium rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-purple-600/20"
              onClick={() => setShowOnboarding(true)}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Setting up...
                </>
              ) : (
                <>
                  <Wallet className="h-4 w-4" />
                  Setup Trading Account
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              className={`w-full h-12 font-medium rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                hasInsufficientBalance || isBelowMinimum
                  ? "bg-muted text-muted-foreground"
                  : side === "BUY"
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20"
                  : "bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/20"
              }`}
              onClick={handleSubmit}
              disabled={
                isLoading ||
                hasInsufficientBalance ||
                hasInsufficientAllowance ||
                hasNoAllowance ||
                isBelowMinimum ||
                !selectedOutcome ||
                !hasValidTokenId ||
                (orderType === "MARKET" && !canFullyFill)
              }
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Placing Order...
                </>
              ) : !hasValidTokenId ? (
                "Trading not available"
              ) : orderType === "MARKET" && !canFullyFill ? (
                "Insufficient liquidity"
              ) : hasInsufficientBalance ? (
                "Insufficient Balance"
              ) : isBelowMinimum ? (
                `Minimum order: $${minOrderSize}`
              ) : (
                <>
                  {side === "BUY" ? (
                    <TrendingUp className="h-4 w-4" />
                  ) : (
                    <TrendingDown className="h-4 w-4" />
                  )}
                  {side === "BUY" ? "Buy" : "Sell"} {shares} Shares
                </>
              )}
            </button>
          )}
        </div>

        {/* Disclaimer */}
        <div className="px-4 pb-4">
          <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
            By placing an order, you agree to the terms of service.
          </p>
        </div>
      </div>
    </div>
  );
}
