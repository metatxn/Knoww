"use client";

import { useAppKit } from "@reown/appkit/react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, Loader2, Minus, Plus, Wallet, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
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
  /** Callback after successful order submission */
  onOrderSuccess?: (order: unknown) => void;
  /** Callback after order error */
  onOrderError?: (error: Error) => void;
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
  onOrderSuccess,
  onOrderError,
}: TradingFormProps) {
  const { isConnected } = useAccount();
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

  // Calculate costs and potential returns
  const calculations = useMemo(() => {
    const price =
      orderType === "MARKET" ? selectedOutcome?.price || 0.5 : limitPrice;
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
  }, [side, orderType, limitPrice, shares, selectedOutcome]);

  // Fetch USDC balance directly from Polygon chain
  const { data: onChainBalance, refetch: refetchBalance } = useQuery({
    queryKey: ["usdcBalance", isConnected],
    queryFn: () => getUsdcBalance(),
    enabled: isConnected,
    staleTime: 15_000, // 15 seconds
    refetchInterval: 30_000, // Refetch every 30 seconds
  });

  // Fetch USDC allowance directly from Polygon chain
  const { data: onChainAllowance, refetch: refetchAllowance } = useQuery({
    queryKey: ["usdcAllowance", isConnected],
    queryFn: () => getUsdcAllowance(),
    enabled: isConnected,
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

  // Handle price change with bounds
  const handlePriceChange = useCallback((delta: number) => {
    setLimitPrice((prev) => {
      const newPrice = Math.round((prev + delta) * 100) / 100;
      return Math.max(0.01, Math.min(0.99, newPrice));
    });
  }, []);

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
      // - GTC (Good Till Cancelled): expiration = 0
      // - FOK (Fill Or Kill): expiration = 0
      // - GTD (Good Till Date): expiration = timestamp
      const isGTD = useExpiration;
      const clobOrderType =
        orderType === "MARKET"
          ? ClobOrderType.FOK
          : isGTD
          ? ClobOrderType.GTD
          : ClobOrderType.GTC;

      // Only set expiration for GTD orders, otherwise use 0
      const expiration = isGTD
        ? Math.floor(Date.now() / 1000) + expirationHours * 60 * 60
        : 0;

      const result = await createOrder({
        tokenId: selectedOutcome.tokenId,
        price: orderType === "MARKET" ? selectedOutcome.price : limitPrice,
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

  // Polymarket minimum order size is $1
  const MIN_ORDER_SIZE = 1;
  const isBelowMinimum = calculations.total < MIN_ORDER_SIZE;

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
                onClick={() => handlePriceChange(-0.01)}
                disabled={limitPrice <= 0.01}
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
                      setLimitPrice(Math.max(0.01, Math.min(0.99, val)));
                    }
                  }}
                  min={0.01}
                  max={0.99}
                  step={0.01}
                  className="text-center text-base sm:text-lg font-semibold h-9 sm:h-10"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 sm:h-9 sm:w-9 shrink-0"
                onClick={() => handlePriceChange(0.01)}
                disabled={limitPrice >= 0.99}
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
            <label className="text-xs sm:text-sm font-medium">
              Market Price
            </label>
            <div className="text-center py-2.5 sm:py-3 bg-muted/50 rounded-lg">
              <span className="text-xl sm:text-2xl font-bold">
                {formatCents(selectedOutcome.price)}
              </span>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                Best available price
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

        {/* Expiration Toggle (only for limit orders) */}
        {orderType === "LIMIT" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Set Expiration</span>
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
            <span>
              Insufficient USDC balance. You need $
              {(calculations.total - (effectiveBalance || 0)).toFixed(2)} more.
            </span>
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
                    ? "You need to approve USDC spending before trading."
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
                  <>Approve USDC Spending</>
                )}
              </Button>
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
              Minimum order size is $1. Current order: $
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
