"use client";

import { useAppKit } from "@reown/appkit/react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, Loader2, Minus, Plus, Wallet, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnection } from "wagmi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { calculatePotentialPnL, OrderSide } from "@/hooks/use-order-signing";
import {
  useClobClient,
  Side,
  OrderType as ClobOrderType,
} from "@/hooks/use-clob-client";
import { useQuery } from "@tanstack/react-query";
import { TradingOnboarding } from "@/components/trading-onboarding";
import { useProxyWallet } from "@/hooks/use-proxy-wallet";

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
  /** Max slippage for market orders (default: 0.02 = 2%) */
  maxSlippage?: number;
  /** Callback after successful order submission */
  onOrderSuccess?: (order: unknown) => void;
  /** Callback after order error */
  onOrderError?: (error: Error) => void;
}

/**
 * Default max slippage for market orders (2%)
 * This prevents users from accidentally eating through the entire order book
 */
const DEFAULT_MAX_SLIPPAGE = 0.02;

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
  outcomes,
  selectedOutcomeIndex,
  onOutcomeChange,
  negRisk = false,
  userBalance,
  tickSize = 0.01,
  minOrderSize = 1,
  bestBid,
  bestAsk,
  maxSlippage = DEFAULT_MAX_SLIPPAGE,
  onOrderSuccess,
  onOrderError,
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

  // Form state
  const [side, setSide] = useState<TradingSide>("BUY");
  const [orderType, setOrderType] = useState<OrderTypeSelection>("LIMIT");
  const [limitPrice, setLimitPrice] = useState<number>(0.5);
  const [shares, setShares] = useState<number>(10);
  const [useExpiration, setUseExpiration] = useState<boolean>(false);
  const [expirationHours, setExpirationHours] = useState<number>(24);
  const [isUpdatingAllowance, setIsUpdatingAllowance] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

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

  // Calculate market order price with slippage protection
  // For "market buy": use best ask + maxSlippage (but cap at 0.99)
  // For "market sell": use best bid - maxSlippage (but floor at 0.01)
  // This creates an aggressive limit order that crosses the spread but doesn't eat the entire book
  const marketOrderPrice = useMemo(() => {
    if (side === "BUY") {
      // Use best ask + slippage, or fallback to outcome price + slippage
      const basePrice = bestAsk ?? selectedOutcome?.price ?? 0.5;
      const priceWithSlippage = basePrice + maxSlippage;
      return Math.min(0.99, roundToTick(priceWithSlippage, tickSize));
    } else {
      // Use best bid - slippage, or fallback to outcome price - slippage
      const basePrice = bestBid ?? selectedOutcome?.price ?? 0.5;
      const priceWithSlippage = basePrice - maxSlippage;
      return Math.max(0.01, roundToTick(priceWithSlippage, tickSize));
    }
  }, [side, bestAsk, bestBid, selectedOutcome?.price, maxSlippage, tickSize]);

  // Calculate costs and potential returns
  const calculations = useMemo(() => {
    // For market orders, use the calculated market price with slippage
    // For limit orders, use the user-specified limit price
    const price = orderType === "MARKET" ? marketOrderPrice : limitPrice;
    const orderSide = side === "BUY" ? OrderSide.BUY : OrderSide.SELL;
    const pnl = calculatePotentialPnL(price, shares, orderSide);

    return {
      price,
      total: pnl.cost,
      potentialWin: pnl.potentialWin,
      potentialLoss: pnl.potentialLoss,
      returnPercent:
        pnl.cost > 0 ? ((pnl.potentialWin / pnl.cost) * 100).toFixed(1) : "0",
    };
  }, [side, orderType, limitPrice, marketOrderPrice, shares]);

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

  return (
    <Card className="sticky top-4 w-full">
      <CardHeader className="pb-3 px-3 sm:px-6">
        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
          Trade
          {negRisk && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <span className="px-2 py-0.5 text-xs bg-rose-500/20 text-rose-500 rounded-full">
                    Neg Risk
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>This market uses negative risk pricing</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3 sm:space-y-4 px-3 sm:px-6">
        {/* Buy/Sell Toggle */}
        <div className="flex gap-2">
          <Button
            type="button"
            variant={side === "BUY" ? "default" : "outline"}
            className={`flex-1 text-sm sm:text-base ${
              side === "BUY" ? "bg-green-600 hover:bg-green-700" : ""
            }`}
            size="default"
            onClick={() => setSide("BUY")}
          >
            Buy
          </Button>
          <Button
            type="button"
            variant={side === "SELL" ? "default" : "outline"}
            className={`flex-1 text-sm sm:text-base ${
              side === "SELL" ? "bg-red-600 hover:bg-red-700" : ""
            }`}
            size="default"
            onClick={() => setSide("SELL")}
          >
            Sell
          </Button>
        </div>

        {/* Order Type Toggle */}
        <div className="flex gap-2">
          <Button
            type="button"
            variant={orderType === "LIMIT" ? "default" : "outline"}
            className="flex-1 text-xs sm:text-sm"
            size="sm"
            onClick={() => setOrderType("LIMIT")}
          >
            Limit
          </Button>
          <Button
            type="button"
            variant={orderType === "MARKET" ? "default" : "outline"}
            className="flex-1 text-xs sm:text-sm"
            size="sm"
            onClick={() => setOrderType("MARKET")}
          >
            Market
          </Button>
        </div>

        {/* Outcome Selector */}
        <div className="space-y-2">
          <label className="text-xs sm:text-sm font-medium text-muted-foreground">
            Outcome
          </label>
          <div className="space-y-2">
            {outcomes.map((outcome, idx) => (
              <Button
                key={outcome.tokenId}
                type="button"
                variant={selectedOutcomeIndex === idx ? "default" : "outline"}
                className="w-full justify-between h-auto py-2.5 sm:py-3 text-sm"
                onClick={() => onOutcomeChange(idx)}
              >
                <span className="font-medium text-left flex-1">
                  {outcome.name}
                </span>
                <span className="font-bold">{formatCents(outcome.price)}</span>
              </Button>
            ))}
          </div>
        </div>

        {/* Limit Price (only for limit orders) */}
        {orderType === "LIMIT" && (
          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
              <label className="text-xs sm:text-sm font-medium">
                Limit Price
              </label>
              {effectiveBalance !== undefined && (
                <div className="text-xs sm:text-sm text-muted-foreground">
                  Balance: ${effectiveBalance.toFixed(2)}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 sm:h-9 sm:w-9 shrink-0"
                onClick={() => handlePriceChange(-1)}
                disabled={limitPrice <= tickSize}
              >
                <Minus className="h-3 w-3 sm:h-4 sm:w-4" />
              </Button>
              <div className="flex-1">
                <Input
                  type="number"
                  value={limitPrice}
                  onChange={(e) => {
                    const val = Number.parseFloat(e.target.value);
                    if (!Number.isNaN(val)) {
                      // Round to nearest tick and clamp to valid range
                      const rounded = roundToTick(val, tickSize);
                      setLimitPrice(
                        Math.max(tickSize, Math.min(1 - tickSize, rounded))
                      );
                    }
                  }}
                  min={tickSize}
                  max={1 - tickSize}
                  step={tickSize}
                  className="text-center text-base sm:text-lg font-semibold h-9 sm:h-10"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 sm:h-9 sm:w-9 shrink-0"
                onClick={() => handlePriceChange(1)}
                disabled={limitPrice >= 1 - tickSize}
              >
                <Plus className="h-3 w-3 sm:h-4 sm:w-4" />
              </Button>
            </div>
            <div className="text-center text-xs sm:text-sm text-muted-foreground">
              {formatCents(limitPrice)} per share
            </div>
          </div>
        )}

        {/* Market Price Display (for market orders) */}
        {orderType === "MARKET" && selectedOutcome && (
          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
              <label className="text-xs sm:text-sm font-medium">
                Market Price
              </label>
              <span className="text-xs text-muted-foreground">
                {(maxSlippage * 100).toFixed(0)}% max slippage
              </span>
            </div>
            <div className="text-center py-2.5 sm:py-3 bg-muted/50 rounded-lg">
              <span className="text-xl sm:text-2xl font-bold">
                {formatCents(marketOrderPrice)}
              </span>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                {side === "BUY" ? (
                  <>
                    Best ask: {bestAsk ? formatCents(bestAsk) : "N/A"} +
                    slippage
                  </>
                ) : (
                  <>
                    Best bid: {bestBid ? formatCents(bestBid) : "N/A"} -
                    slippage
                  </>
                )}
              </p>
            </div>
          </div>
        )}

        {/* Shares Input */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-xs sm:text-sm font-medium">Shares</label>
            <button
              type="button"
              className="text-xs sm:text-sm text-primary hover:underline"
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
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={shares}
              onChange={(e) => {
                const val = Number.parseInt(e.target.value, 10);
                if (!Number.isNaN(val)) {
                  setShares(Math.max(1, val));
                }
              }}
              min={1}
              className="text-center text-base sm:text-lg font-semibold h-9 sm:h-10"
            />
          </div>
          <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs sm:text-sm h-8 sm:h-9 px-1 sm:px-3"
              onClick={() => handleSharesChange(-100)}
              disabled={shares <= 100}
            >
              -100
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs sm:text-sm h-8 sm:h-9 px-1 sm:px-3"
              onClick={() => handleSharesChange(-10)}
              disabled={shares <= 10}
            >
              -10
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs sm:text-sm h-8 sm:h-9 px-1 sm:px-3"
              onClick={() => handleSharesChange(10)}
            >
              +10
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs sm:text-sm h-8 sm:h-9 px-1 sm:px-3"
              onClick={() => handleSharesChange(100)}
            >
              +100
            </Button>
          </div>
        </div>

        {/* Order Duration (only for limit orders) */}
        {orderType === "LIMIT" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-sm font-medium">
                  {useExpiration
                    ? "Good Till Date (GTD)"
                    : "Good Till Cancelled (GTC)"}
                </span>
                <span className="text-[10px] sm:text-xs text-muted-foreground">
                  {useExpiration
                    ? "Order expires after set time"
                    : "Order stays until filled or cancelled"}
                </span>
              </div>
              <button
                type="button"
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  useExpiration ? "bg-primary" : "bg-muted"
                }`}
                onClick={() => setUseExpiration(!useExpiration)}
              >
                <div
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-background transition-transform ${
                    useExpiration ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
            {useExpiration && (
              <Select
                value={expirationHours.toString()}
                onValueChange={(val) =>
                  setExpirationHours(Number.parseInt(val, 10))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select expiration" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 hour</SelectItem>
                  <SelectItem value="6">6 hours</SelectItem>
                  <SelectItem value="24">24 hours</SelectItem>
                  <SelectItem value="72">3 days</SelectItem>
                  <SelectItem value="168">1 week</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {/* Market Order Info */}
        {orderType === "MARKET" && (
          <div className="text-[10px] sm:text-xs text-muted-foreground bg-muted/30 p-2 rounded">
            <strong>Fill or Kill (FOK):</strong> Order must fill immediately at
            the shown price or better, otherwise it will be cancelled.
          </div>
        )}

        {/* Totals */}
        <div className="space-y-1.5 sm:space-y-2 pt-2 border-t">
          <div className="flex justify-between items-center">
            <span className="text-xs sm:text-sm font-medium">Total Cost</span>
            <span className="text-lg sm:text-xl font-bold">
              ${calculations.total.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs sm:text-sm font-medium">
              Potential Return
            </span>
            <span className="text-lg sm:text-xl font-bold text-green-500">
              ${(calculations.total + calculations.potentialWin).toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between items-center text-xs sm:text-sm text-muted-foreground">
            <span>Profit if {side === "BUY" ? "Yes" : "No"}</span>
            <span className="text-green-500">
              +${calculations.potentialWin.toFixed(2)} (
              {calculations.returnPercent}%)
            </span>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg text-sm"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error.message}</span>
          </motion.div>
        )}

        {/* Insufficient Balance Warning */}
        {hasInsufficientBalance && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 p-3 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 rounded-lg text-sm"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <div className="flex flex-col gap-1">
              <span>
                Insufficient USDC.e balance. You need $
                {(calculations.total - (effectiveBalance || 0)).toFixed(2)}{" "}
                more.
              </span>
              <span className="text-xs opacity-75">
                Deposit USDC.e (bridged USDC) to your trading wallet to
                continue.
              </span>
            </div>
          </motion.div>
        )}

        {/* Insufficient Allowance Warning */}
        {(hasNoAllowance || hasInsufficientAllowance) &&
          !hasInsufficientBalance && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-2"
            >
              <div className="flex items-center gap-2 p-3 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>
                  {hasNoAllowance
                    ? "You need to approve USDC.e spending before trading."
                    : `Insufficient allowance. Current: $${
                        allowance?.toFixed(2) || 0
                      }, needed: $${calculations.total.toFixed(2)}`}
                </span>
              </div>
              <Button
                type="button"
                className="w-full bg-blue-600 hover:bg-blue-700"
                onClick={handleSetAllowance}
                disabled={isUpdatingAllowance}
              >
                {isUpdatingAllowance ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Approving...
                  </>
                ) : (
                  <>Approve USDC.e Spending</>
                )}
              </Button>
            </motion.div>
          )}

        {/* Spread Warning - Price crossing the book */}
        {spreadWarning?.isCrossing && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 p-3 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-lg text-sm"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              {side === "BUY"
                ? `You're paying ${Math.abs(
                    spreadWarning.percentAbove || 0
                  ).toFixed(1)}% above the best ask price.`
                : `You're selling ${Math.abs(
                    spreadWarning.percentAbove || 0
                  ).toFixed(1)}% below the best bid price.`}
            </span>
          </motion.div>
        )}

        {/* Minimum Order Size Warning */}
        {isBelowMinimum && !hasInsufficientBalance && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 p-3 bg-orange-500/10 text-orange-600 dark:text-orange-400 rounded-lg text-sm"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              Minimum order size is ${minOrderSize}. Current order: $
              {calculations.total.toFixed(2)}
            </span>
          </motion.div>
        )}

        {/* Submit Button */}
        {!isConnected ? (
          <Button
            type="button"
            className="w-full"
            size="lg"
            onClick={() => open()}
          >
            <Wallet className="mr-2 h-4 w-4" />
            Connect Wallet to Trade
          </Button>
        ) : !hasCredentials ? (
          <Button
            type="button"
            className="w-full bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
            size="lg"
            onClick={() => setShowOnboarding(true)}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Setting up...
              </>
            ) : (
              <>
                <Wallet className="mr-2 h-4 w-4" />
                Setup Trading Account
              </>
            )}
          </Button>
        ) : (
          <Button
            type="button"
            className={`w-full ${
              side === "BUY"
                ? "bg-green-600 hover:bg-green-700"
                : "bg-red-600 hover:bg-red-700"
            }`}
            size="lg"
            onClick={handleSubmit}
            disabled={
              isLoading ||
              hasInsufficientBalance ||
              hasInsufficientAllowance ||
              hasNoAllowance ||
              isBelowMinimum ||
              !selectedOutcome ||
              !hasValidTokenId
            }
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Placing Order...
              </>
            ) : !hasValidTokenId ? (
              <>Trading not available</>
            ) : isBelowMinimum ? (
              <>Minimum order: $1</>
            ) : (
              <>
                {side === "BUY" ? "Buy" : "Sell"}{" "}
                {selectedOutcome?.name || "Outcome"}
              </>
            )}
          </Button>
        )}

        {/* Warning for unavailable trading */}
        {isConnected && !hasValidTokenId && selectedOutcome && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm text-amber-600 dark:text-amber-400"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              Trading is not available for this market. Token IDs are missing.
            </span>
          </motion.div>
        )}

        {/* Disclaimer */}
        <p className="text-[10px] sm:text-xs text-muted-foreground text-center">
          By placing an order, you agree to the terms of service.
          {orderType === "MARKET" &&
            " Market orders execute immediately at best available price."}
        </p>
      </CardContent>

      {/* Onboarding Dialog */}
      <Dialog open={showOnboarding} onOpenChange={setShowOnboarding}>
        <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>Setup Trading Account</DialogTitle>
          </DialogHeader>
          <TradingOnboarding
            onComplete={() => setShowOnboarding(false)}
            onSkip={() => setShowOnboarding(false)}
          />
        </DialogContent>
      </Dialog>
    </Card>
  );
}
