"use client";

import { useAppKit } from "@reown/appkit/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  Loader2,
  TrendingDown,
  TrendingUp,
  Wallet,
  Wifi,
} from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { DepositModal } from "@/components/deposit-modal";
import { useOnboarding } from "@/context/onboarding-context";
import { formatSlippageDisplay } from "@/lib/slippage";
import { AllowanceWarning } from "./trading/allowance-warning";
import { BalanceWarning } from "./trading/balance-warning";
// Sub-components
import { BuySellToggle } from "./trading/buy-sell-toggle";
import { useTradingFormState } from "./trading/hooks/use-trading-form-state";
import { LimitExpiration } from "./trading/limit-expiration";
import { OrderSummary } from "./trading/order-summary";
import { OrderTypeToggle } from "./trading/order-type-toggle";
import { OutcomeSelector } from "./trading/outcome-selector";
import { PriceInput } from "./trading/price-input";
import { SharesInput } from "./trading/shares-input";
// Types & Hooks
import type { TradingFormProps } from "./trading/types";

/**
 * TradingForm Component (Refactored)
 *
 * A comprehensive trading form for placing limit and market orders
 * on Polymarket prediction markets.
 */
export function TradingForm(props: TradingFormProps) {
  const {
    marketTitle,
    outcomes,
    selectedOutcomeIndex,
    onOutcomeChange,
    marketImage,
    yesProbability,
    isLiveData = false,
    maxSlippagePercent = 2,
  } = props;

  const { open } = useAppKit();
  const { setShowOnboarding } = useOnboarding();
  const [showDepositModal, setShowDepositModal] = useState(false);

  // Centralized form state and logic
  const {
    side,
    setSide,
    orderType,
    setOrderType,
    limitPrice,
    setLimitPrice,
    shares,
    setShares,
    allowPartialFill,
    setAllowPartialFill,
    expirationType,
    setExpirationType,
    expirationTime,
    setExpirationTime,
    tickSize,
    isLoading,
    error,
    calculations,
    slippageResult,
    effectiveBalance,
    hasInsufficientBalance,
    hasInsufficientAllowance,
    hasNoAllowance,
    isBelowMarketableBuyMinNotional,
    minShares,
    maxSellShares,
    hasCredentials,
    isConnected,
    handleSetAllowance,
    handleSharesChange,
    handleSubmit,
    hasValidTokenId,
    canFullyFill,
  } = useTradingFormState(props);

  const selectedOutcome = outcomes[selectedOutcomeIndex];

  // Slippage UI calculation
  const slippageDisplay = slippageResult
    ? formatSlippageDisplay(slippageResult, side)
    : null;
  const slippageExceedsMax = slippageResult
    ? slippageResult.slippagePercent > maxSlippagePercent
    : false;
  const formatCents = (price: number) => `${(price * 100).toFixed(1)}¢`;

  return (
    <div className="sticky top-4 w-full">
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
        {/* Market Header */}
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
              {isLiveData && (
                <div className="flex items-center gap-1">
                  <Wifi className="h-3 w-3 text-emerald-500" />
                  <span className="text-[10px] text-emerald-500">Live</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {props.negRisk && (
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

        {/* Form Controls */}
        <div className="p-4 space-y-3">
          <OrderTypeToggle orderType={orderType} onChange={setOrderType} />

          <BuySellToggle side={side} onChange={setSide} />

          <OutcomeSelector
            outcomes={outcomes}
            selectedOutcomeIndex={selectedOutcomeIndex}
            onOutcomeChange={onOutcomeChange}
          />

          {/* Price Input - Only for limit orders */}
          {orderType === "LIMIT" && (
            <>
              <PriceInput
                price={limitPrice}
                onPriceChange={setLimitPrice}
                tickSize={tickSize}
                bestBid={props.bestBid}
                bestAsk={props.bestAsk}
                side={side}
              />
              <LimitExpiration
                expirationType={expirationType}
                onExpirationTypeChange={setExpirationType}
                expirationTime={expirationTime}
                onExpirationTimeChange={setExpirationTime}
              />
            </>
          )}

          {/* Execution Info - Only for market orders */}
          {orderType === "MARKET" && (
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
              <span>Avg. Price</span>
              <span className="font-mono font-medium text-foreground">
                {slippageDisplay?.avgPrice || formatCents(calculations.price)}
              </span>
              <span>Slippage</span>
              <span
                className={`font-mono font-medium ${
                  slippageExceedsMax ? "text-amber-500" : "text-foreground"
                }`}
              >
                {slippageDisplay?.slippagePercent || "0.00%"}
              </span>
            </div>
          )}

          <SharesInput
            shares={shares}
            onSharesChange={setShares}
            onIncrement={handleSharesChange}
            minShares={minShares}
            effectiveBalance={effectiveBalance}
            price={calculations.price}
            side={side}
            maxSellShares={maxSellShares}
          />

          {/* Partial Fill Toggle - Only for market orders */}
          {orderType === "MARKET" && (
            <div className="p-3 rounded-lg bg-secondary/30 border border-border/50">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0 pr-3">
                  <span className="text-sm font-medium text-foreground">
                    Allow partial fill
                  </span>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {allowPartialFill
                      ? "Fills available shares, cancels rest (FAK)"
                      : "Must fill entirely or cancel (FOK)"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAllowPartialFill(!allowPartialFill)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                    allowPartialFill ? "bg-emerald-500" : "bg-muted"
                  }`}
                  role="switch"
                  aria-checked={allowPartialFill}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition duration-200 ${
                      allowPartialFill ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

          <OrderSummary
            totalCost={calculations.total}
            potentialWin={calculations.potentialWin}
            profitPercent={calculations.returnPercent}
            selectedOutcomeName={selectedOutcome?.name}
            isBelowMinNotional={isBelowMarketableBuyMinNotional}
            side={side}
          />

          {/* Conditional UI Sections */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
              >
                <div className="flex items-center gap-3 p-3 bg-destructive/10 border border-destructive/20 rounded-xl">
                  <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                  <span className="text-sm text-destructive">
                    {error.message}
                  </span>
                </div>
              </motion.div>
            )}

            {side === "SELL" && maxSellShares <= 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
              >
                <div className="flex items-center gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                  <span className="text-sm text-amber-600 dark:text-amber-400">
                    You don't have any {selectedOutcome?.name || "shares"} to
                    sell
                  </span>
                </div>
              </motion.div>
            )}

            {hasInsufficientBalance && side === "BUY" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
              >
                <BalanceWarning
                  totalCost={calculations.total}
                  effectiveBalance={effectiveBalance}
                  onDeposit={() => setShowDepositModal(true)}
                />
              </motion.div>
            )}

            {(hasNoAllowance || hasInsufficientAllowance) &&
              !hasInsufficientBalance && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <AllowanceWarning
                    totalCost={calculations.total}
                    hasNoAllowance={hasNoAllowance}
                    isUpdating={isLoading}
                    onApprove={handleSetAllowance}
                  />
                </motion.div>
              )}
          </AnimatePresence>

          {/* Submit Action */}
          <div className="pt-1">
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
                  (side === "BUY" && hasInsufficientBalance) ||
                  (side === "SELL" && maxSellShares <= 0) ||
                  (side === "BUY" && shares < minShares)
                    ? "bg-muted text-muted-foreground"
                    : side === "BUY"
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20"
                    : "bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/20"
                }`}
                onClick={handleSubmit}
                disabled={
                  isLoading ||
                  (side === "BUY" && hasInsufficientBalance) ||
                  (side === "SELL" && maxSellShares <= 0) ||
                  (side === "SELL" && shares > maxSellShares) ||
                  (side === "SELL" && shares <= 0) ||
                  hasInsufficientAllowance ||
                  hasNoAllowance ||
                  (side === "BUY" && shares < minShares) ||
                  (side === "BUY" && isBelowMarketableBuyMinNotional) ||
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
                ) : side === "SELL" && maxSellShares <= 0 ? (
                  "No position to sell"
                ) : side === "SELL" && shares > maxSellShares ? (
                  `Max ${maxSellShares.toFixed(1)} shares`
                ) : side === "BUY" && hasInsufficientBalance ? (
                  "Insufficient Balance"
                ) : side === "BUY" && shares < minShares ? (
                  `Minimum shares: ${minShares}`
                ) : side === "BUY" && isBelowMarketableBuyMinNotional ? (
                  "Minimum order: $1"
                ) : (
                  <>
                    {side === "BUY" ? (
                      <TrendingUp className="h-4 w-4" />
                    ) : (
                      <TrendingDown className="h-4 w-4" />
                    )}
                    {side === "BUY" ? "Buy" : "Sell"} {shares} @{" "}
                    {orderType === "LIMIT"
                      ? `${(limitPrice * 100).toFixed(1)}¢`
                      : "Market"}
                  </>
                )}
              </button>
            )}
          </div>

          <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
            By placing an order, you agree to the terms of service.
          </p>
        </div>
      </div>

      <DepositModal
        open={showDepositModal}
        onOpenChange={setShowDepositModal}
      />
    </div>
  );
}
