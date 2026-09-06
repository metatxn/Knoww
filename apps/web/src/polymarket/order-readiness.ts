"use client";

import { isClobOrderApproved } from "@knoww/shared-types/approvals";
import {
  estimateFallbackFeeRaw,
  parsePusdUnits,
} from "@knoww/shared-types/trading";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Decimal from "decimal.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  OrderReadiness,
  OrderReadinessInput,
  OrderReadinessStep,
} from "@/components/trading/types";
import { PUSD_DECIMALS } from "@/constants/contracts";
import { useProxyWallet } from "@/hooks/use-proxy-wallet";
import { checkAllApprovals } from "@/lib/approvals";
import { qk } from "@/lib/query-keys";
import { readPusdAllowance } from "./clob/balances";
import { usePolymarketOrderPreflight } from "./order-preflight";
import { isPolymarketTradingDetails } from "./trading-target";

const APPROVAL_CHECK_BUCKET_RAW = BigInt(10) ** BigInt(PUSD_DECIMALS);
// The market order notional can move on every order book tick. Approval
// checks follow the required amount, but debounced and bucketed to whole
// pUSD so cent-level quote movement does not create distinct Polygon
// multicalls.
const APPROVAL_CHECK_DEBOUNCE_MS = 1500;
// Polygon RPCs lag the confirmed approval; re-read a couple of times.
const APPROVAL_REFETCH_DELAYS_MS = [1500, 4000];

/**
 * Polymarket's order-readiness slot: the trading wallet's pUSD allowance and
 * the exchange/adapter approvals a BUY or SELL needs. `prepare` sends the
 * approvals for the ticket's own amount and scope, then re-reads the chain.
 */
export function usePolymarketOrderReadiness({
  side,
  totalUsd,
  shares,
  slot,
  enabled,
}: OrderReadinessInput): OrderReadiness {
  const queryClient = useQueryClient();
  const { updateAllowance } = usePolymarketOrderPreflight();
  const {
    proxyAddress,
    isDeployed: hasProxyWallet,
    refresh: refreshProxyWallet,
  } = useProxyWallet();
  const details = slot?.details;
  const negRisk = isPolymarketTradingDetails(details) && details.negRisk;

  const [isPreparing, setIsPreparing] = useState(false);
  const pendingTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    return () => {
      for (const timer of pendingTimersRef.current) {
        clearTimeout(timer);
      }
      pendingTimersRef.current = [];
    };
  }, []);

  const isWalletReady = enabled && hasProxyWallet && !!proxyAddress;

  const { data: onChainAllowance, refetch: refetchAllowance } = useQuery({
    queryKey: qk.wallet.usdcAllowance(proxyAddress, hasProxyWallet, negRisk),
    queryFn: () => {
      if (!proxyAddress) throw new Error("Trading wallet not found");
      return readPusdAllowance(proxyAddress, negRisk);
    },
    enabled: isWalletReady,
    // Allowance only changes when we explicitly update it. Polling every
    // trading form mount creates steady Polygon RPC pressure for no benefit.
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const allowance = onChainAllowance?.allowance;
  const hasInsufficientAllowance =
    allowance !== undefined && totalUsd > allowance;
  const hasNoAllowance = allowance !== undefined && allowance === 0;

  const requiredApprovalAmountRaw = useMemo(() => {
    if (side === "SELL") {
      return shares > 0 ? BigInt(1) : BigInt(0);
    }
    if (!Number.isFinite(totalUsd) || totalUsd <= 0) {
      return BigInt(0);
    }
    const requiredRaw = parsePusdUnits(new Decimal(totalUsd));
    return requiredRaw + estimateFallbackFeeRaw(requiredRaw);
  }, [totalUsd, shares, side]);

  const bucketedRequiredApprovalAmountRaw = useMemo(() => {
    if (requiredApprovalAmountRaw <= BigInt(0)) return BigInt(0);
    return (
      ((requiredApprovalAmountRaw + APPROVAL_CHECK_BUCKET_RAW - BigInt(1)) /
        APPROVAL_CHECK_BUCKET_RAW) *
      APPROVAL_CHECK_BUCKET_RAW
    );
  }, [requiredApprovalAmountRaw]);

  const approvalAmount = useMemo(() => {
    return new Decimal(bucketedRequiredApprovalAmountRaw.toString())
      .div(new Decimal(10).pow(PUSD_DECIMALS))
      .toString();
  }, [bucketedRequiredApprovalAmountRaw]);

  const [checkAmountRaw, setCheckAmountRaw] = useState(
    bucketedRequiredApprovalAmountRaw
  );
  useEffect(() => {
    const timer = setTimeout(() => {
      setCheckAmountRaw(bucketedRequiredApprovalAmountRaw);
    }, APPROVAL_CHECK_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [bucketedRequiredApprovalAmountRaw]);

  const shouldCheckApprovals = isWalletReady && checkAmountRaw > BigInt(0);

  const {
    data: approvalStatus,
    refetch: refetchApprovals,
    isLoading: isCheckingApprovals,
  } = useQuery({
    queryKey: qk.wallet.tradingApprovals(
      proxyAddress,
      hasProxyWallet,
      checkAmountRaw.toString()
    ),
    queryFn: () => checkAllApprovals(proxyAddress || "", checkAmountRaw),
    enabled: shouldCheckApprovals,
    // This query is the ticket's approval gate. Keep it fresh enough that the
    // button matches the order pre-flight, without polling every keystroke.
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
  });

  const requiredStep = useMemo<OrderReadinessStep>(() => {
    if (shouldCheckApprovals && approvalStatus !== undefined) {
      return isClobOrderApproved(approvalStatus, { side, negRisk })
        ? "none"
        : "setup";
    }
    // Until the approvals read lands, the allowance alone gates a BUY.
    if (side === "BUY" && approvalStatus === undefined) {
      if (hasNoAllowance) return "setup";
      if (hasInsufficientAllowance) return "limit";
    }
    return "none";
  }, [
    shouldCheckApprovals,
    approvalStatus,
    side,
    negRisk,
    hasNoAllowance,
    hasInsufficientAllowance,
  ]);

  const prepare = useCallback(async () => {
    setIsPreparing(true);
    try {
      await updateAllowance(approvalAmount, { side, negRisk });
      await Promise.all([
        refreshProxyWallet(),
        refetchAllowance(),
        refetchApprovals(),
        queryClient.invalidateQueries({
          queryKey: qk.wallet.allTradingApprovals(),
        }),
        queryClient.invalidateQueries({
          queryKey: qk.wallet.allUsdcAllowances(),
        }),
      ]);
      for (const delay of APPROVAL_REFETCH_DELAYS_MS) {
        const timerId = setTimeout(() => {
          void Promise.all([
            refreshProxyWallet(),
            refetchAllowance(),
            refetchApprovals(),
          ]);
          pendingTimersRef.current = pendingTimersRef.current.filter(
            (id) => id !== timerId
          );
        }, delay);
        pendingTimersRef.current.push(timerId);
      }
      return true;
    } finally {
      setIsPreparing(false);
    }
  }, [
    updateAllowance,
    approvalAmount,
    side,
    negRisk,
    refreshProxyWallet,
    refetchAllowance,
    refetchApprovals,
    queryClient,
  ]);

  const refresh = useCallback(async () => {
    await Promise.allSettled([
      refetchAllowance(),
      refetchApprovals(),
      queryClient.invalidateQueries({
        queryKey: qk.wallet.allTradingApprovals(),
      }),
      queryClient.invalidateQueries({
        queryKey: qk.wallet.allUsdcAllowances(),
      }),
    ]);
  }, [refetchAllowance, refetchApprovals, queryClient]);

  return {
    isChecking: shouldCheckApprovals && isCheckingApprovals,
    requiredStep,
    isPreparing,
    prepare,
    refresh,
  };
}
