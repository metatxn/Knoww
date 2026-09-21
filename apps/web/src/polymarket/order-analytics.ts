"use client";

import type { OrderResult, WalletIdentity } from "@knoww/services/core";
import type { AnalyticsProperties } from "@knoww/shared-types/product-analytics";
import { useCallback, useEffect } from "react";
import { useClobCredentials } from "@/hooks/use-clob-credentials";
import {
  pollConfirmedOrders,
  rememberAcceptedOrder,
} from "@/lib/order-analytics";
import { getPolymarketReadOnlyClient } from "./read-only-client";

/** Confirmation reads use stored credentials and never prompt the wallet. */
export function usePolymarketOrderAnalytics(
  identity: WalletIdentity | null,
  canTrade: boolean
) {
  const { credentials } = useClobCredentials();
  const address = identity?.address;
  const walletAddress = identity?.tradingAddress ?? address;
  const poll = useCallback(async () => {
    if (!address || !walletAddress || !credentials || !canTrade) return;
    try {
      const client = await getPolymarketReadOnlyClient({
        signerAddress: address,
        walletAddress,
        credentials,
      });
      await pollConfirmedOrders(address, client);
    } catch {
      // Analytics failures must not change a trading result.
    }
  }, [address, walletAddress, credentials, canTrade]);

  useEffect(() => {
    if (!canTrade || !address) return;
    void poll();
    const timer = setInterval(() => void poll(), 30_000);
    return () => clearInterval(timer);
  }, [canTrade, address, poll]);

  return useCallback(
    async (result: OrderResult, properties: AnalyticsProperties) => {
      if (!address) return;
      try {
        await rememberAcceptedOrder(result, address, properties);
        await poll();
      } catch {
        // Includes storage, consent and attribution failures before tracking.
      }
    },
    [address, poll]
  );
}
