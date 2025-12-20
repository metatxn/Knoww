"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useConnection } from "wagmi";
import {
  clearBalanceCache,
  clearDeploymentCache,
  checkIsDeployed as rpcCheckIsDeployed,
  fetchUsdcBalance as rpcFetchUsdcBalance,
} from "@/lib/rpc";

/**
 * Polymarket Proxy Wallet Hook
 *
 * Polymarket uses different wallet types for trading:
 * 1. Gnosis Safe proxy wallets - deployed via Polymarket's factory
 * 2. Direct EOA trading - some users trade directly with their EOA
 *
 * This hook:
 * 1. Fetches the user's actual Polymarket wallet from the Data API
 * 2. Falls back to CREATE2 derivation if no positions exist
 * 3. Checks if it's deployed (has code)
 * 4. Fetches the USDC.e balance
 *
 * Uses shared RPC client with caching to avoid rate limiting.
 * Now uses React Query for global state management and cache invalidation.
 */

// Polymarket Safe Factory address on Polygon mainnet
const SAFE_FACTORY = "0xaacFeEa03eb1561C4e67d661e40682Bd20E3541b";

// Init code hash used by Polymarket's factory
const SAFE_INIT_CODE_HASH =
  "0x2bce2127ff07fb632d16c8347c4ebf501f4841168bed00d9e6ef715ddb6fcecf";

// Polymarket Data API
// const DATA_API_BASE = "https://data-api.polymarket.com";

// Query key for proxy wallet data
export const PROXY_WALLET_QUERY_KEY = "proxy-wallet";

export interface ProxyWalletData {
  proxyAddress: string | null;
  isDeployed: boolean;
  usdcBalance: number;
  isLoading: boolean;
  error: string | null;
}

/**
 * Fetch wallet data helper
 */
async function fetchWalletData(eoaAddress: string) {
  // Step 1: Derive the Safe address using CREATE2 formula
  // This is deterministic - same EOA always produces same Safe address
  const { getCreate2Address, keccak256, encodeAbiParameters } = await import(
    "viem"
  );

  const salt = keccak256(
    encodeAbiParameters(
      [{ name: "address", type: "address" }],
      [eoaAddress as `0x${string}`]
    )
  );

  const proxyAddress = getCreate2Address({
    from: SAFE_FACTORY as `0x${string}`,
    salt: salt,
    bytecodeHash: SAFE_INIT_CODE_HASH as `0x${string}`,
  });

  if (!proxyAddress) {
    throw new Error("Failed to derive Polymarket wallet address");
  }

  // Step 2: Check if the derived Safe is actually deployed on-chain
  const isDeployed = await rpcCheckIsDeployed(proxyAddress);

  if (!isDeployed) {
    return {
      proxyAddress,
      isDeployed: false,
      usdcBalance: 0,
    };
  }

  // Step 3: Safe is deployed - fetch USDC balance
  const usdcBalance = await rpcFetchUsdcBalance(proxyAddress);

  return {
    proxyAddress,
    isDeployed: true,
    usdcBalance,
  };
}

export function useProxyWallet() {
  const { address, isConnected } = useConnection();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [PROXY_WALLET_QUERY_KEY, address],
    queryFn: async () => {
      if (!address) throw new Error("No address");
      return fetchWalletData(address);
    },
    enabled: !!address && isConnected,
    // Stale time matches RPC cache roughly, but we can invalidate manually
    staleTime: 30000,
  });

  /**
   * Refresh proxy wallet data
   */
  const refresh = useCallback(async () => {
    return queryClient.invalidateQueries({
      queryKey: [PROXY_WALLET_QUERY_KEY, address],
    });
  }, [queryClient, address]);

  /**
   * Force refresh with cache clearing
   */
  const forceRefresh = useCallback(async () => {
    if (query.data?.proxyAddress) {
      clearDeploymentCache(query.data.proxyAddress);
      clearBalanceCache(query.data.proxyAddress);
    }
    return refresh();
  }, [query.data?.proxyAddress, refresh]);

  return {
    proxyAddress: query.data?.proxyAddress ?? null,
    isDeployed: query.data?.isDeployed ?? false,
    usdcBalance: query.data?.usdcBalance ?? 0,
    isLoading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    refresh,
    forceRefresh,
  };
}
