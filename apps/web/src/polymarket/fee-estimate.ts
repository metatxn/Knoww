"use client";

import { createLogger } from "@knoww/logger";
import {
  type ClobBuilderFeeRates,
  fetchClobBuilderFeeRates,
} from "@knoww/shared-types/clob";
import { estimateBuyTakerFeeRaw } from "@knoww/shared-types/trading";
import { useQuery } from "@tanstack/react-query";
import Decimal from "decimal.js";
import { useMemo } from "react";
import { useConnection } from "wagmi";
import type {
  BuyFeeEstimate,
  BuyFeeEstimateInput,
} from "@/components/trading/types";
import { PUSD_DECIMALS } from "@/constants/contracts";
import { CLOB_BASE_URL } from "@/constants/polymarket";
import { useClobCredentials } from "@/hooks/use-clob-credentials";
import { useProxyWallet } from "@/hooks/use-proxy-wallet";
import { qk } from "@/lib/query-keys";
import { getPolymarketReadOnlyClient } from "./read-only-client";
import { isPolymarketTradingDetails } from "./trading-target";

// Same logger name as the hook this came from, so log filters keep working.
const log = createLogger("clob-client");

// Builder rates are set by Polymarket per builder code and effectively static,
// so one fetch per page load is enough. Mirrors the extension's cache in
// `background/trading-handler.ts` so both surfaces price a trade identically.
const builderFeeRatesCache = new Map<string, Promise<ClobBuilderFeeRates>>();

function getBuilderFeeRates(builderCode: string): Promise<ClobBuilderFeeRates> {
  const cached = builderFeeRatesCache.get(builderCode);
  if (cached) return cached;

  const pending = fetchClobBuilderFeeRates(builderCode, {
    host: CLOB_BASE_URL,
  }).catch((err) => {
    // A transient failure must not poison the cache; the next call retries.
    builderFeeRatesCache.delete(builderCode);
    throw err;
  });
  builderFeeRatesCache.set(builderCode, pending);
  return pending;
}

/**
 * The taker fee a Polymarket BUY would pay, quoted from the market's fee
 * curve and the builder rates before the user commits. This is the same
 * computation the adapter runs when it drafts, so the ticket and the order
 * agree on the number.
 */
export function usePolymarketBuyFeeEstimate({
  side,
  slot,
  shares,
  price,
  totalUsd,
  isMarketableBuy,
  enabled,
}: BuyFeeEstimateInput): BuyFeeEstimate {
  const { address } = useConnection();
  const { credentials, hasCredentials } = useClobCredentials();
  const { proxyAddress, isEoaMode } = useProxyWallet();
  const details = slot?.details;
  const conditionId = isPolymarketTradingDetails(details)
    ? details.conditionId
    : undefined;
  const walletAddress = isEoaMode ? address : proxyAddress;

  // Round the fee inputs before they reach the query key. The fee is a smooth
  // function of size and price, so a cent of movement never changes the
  // displayed number, while an unrounded key would refetch on every keystroke.
  const inputs = useMemo(() => {
    if (side !== "BUY" || !conditionId) return null;
    if (shares <= 0 || totalUsd <= 0) return null;
    // A market order the book cannot fill prices at 0, and the protocol fee
    // curve is 0 at that endpoint: quoting it would print a confident "$0.00"
    // for a fee there is no basis to estimate.
    if (price <= 0) return null;
    return {
      size: shares.toFixed(2),
      price: price.toFixed(4),
      notional: totalUsd.toFixed(2),
    };
  }, [side, conditionId, shares, price, totalUsd]);

  const { data: feeRaw, isFetching } = useQuery({
    queryKey: qk.orders.buyFeeEstimate(
      conditionId,
      inputs?.size ?? "",
      inputs?.price ?? "",
      inputs?.notional ?? ""
    ),
    queryFn: async (): Promise<bigint | null> => {
      if (!conditionId || !inputs) return null;
      if (!credentials || !address || !walletAddress) return null;
      const client = await getPolymarketReadOnlyClient({
        signerAddress: address,
        walletAddress,
        credentials,
      });
      return estimateBuyTakerFeeRaw(
        client,
        conditionId,
        Number(inputs.size),
        Number(inputs.price),
        Number(inputs.notional),
        {
          // The SDK's parsed market info drops the `tbf` builder bps, so the
          // builder half has to come from `/fees/builder-fees/{code}`, the
          // same source the extension pre-flight and the CLOB itself use.
          builderCode: process.env.NEXT_PUBLIC_POLY_BUILDER_CODE,
          getBuilderFeeRates,
          isMarketableBuy,
          onError: (err) =>
            log.warn("fee_info.fetch_failed", {
              conditionId,
              error: err instanceof Error ? err.message : String(err),
            }),
        }
      );
    },
    enabled:
      enabled &&
      !!inputs &&
      hasCredentials &&
      !!credentials &&
      !!address &&
      !!walletAddress,
    // Market fee parameters are effectively static; the ticket inputs are
    // already in the key, so anything cached for this exact ticket is fresh.
    staleTime: 5 * 60 * 1000,
    retry: false,
    // Hold the last known fee while the next one loads. Without this the row
    // would blink out of the ticket on every amount change, which reads as
    // "the fee went away" rather than "the fee is being recomputed".
    placeholderData: (previous: bigint | null | undefined) => previous,
  });

  // `null`, never `0`: a fee the lookup could not read is charged all the
  // same. Orders sign without `maxSpend`, so the fee comes on top of the
  // ticket total rather than out of it.
  const feeUsd = useMemo(() => {
    if (feeRaw === null || feeRaw === undefined) return null;
    return new Decimal(feeRaw.toString())
      .div(new Decimal(10).pow(PUSD_DECIMALS))
      .toNumber();
  }, [feeRaw]);

  return { feeUsd, isFetching };
}
