"use client";

import type { WalletIdentity } from "@knoww/services/core";
import { useMemo } from "react";
import { useConnection } from "wagmi";
import { useProxyWallet } from "@/hooks/use-proxy-wallet";
import { useTradingWalletMode } from "@/hooks/use-trading-wallet-mode";
import { toPolymarketWalletIdentity } from "@/polymarket/identity";

export interface TradingIdentityState {
  /** The canonical identity, `null` until the wallet and its mode resolve. */
  identity: WalletIdentity | null;
  /** True while the proxy wallet lookup that completes the identity runs. */
  isLoading: boolean;
}

/**
 * The connected user's canonical trading identity. Composes the wallet
 * connection, the trading wallet mode and the proxy wallet lookup that the
 * pre-migration hooks each re-derived on their own.
 */
export function useTradingIdentity(): TradingIdentityState {
  const { address } = useConnection();
  const { mode } = useTradingWalletMode();
  const { proxyAddress, isLoading } = useProxyWallet();

  const identity = useMemo(
    () =>
      toPolymarketWalletIdentity({
        address,
        walletMode: mode,
        proxyAddress,
      }),
    [address, mode, proxyAddress]
  );

  return { identity, isLoading };
}
