"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useConnection } from "wagmi";
import {
  SAFE_FACTORY_ADDRESS as SAFE_FACTORY,
  SAFE_INIT_CODE_HASH,
} from "@/constants/contracts";
import {
  clearBalanceCache,
  clearDeploymentCache,
  checkIsDeployed as rpcCheckIsDeployed,
  fetchUsdcBalance as rpcFetchUsdcBalance,
} from "@/lib/rpc";

/**
 * Polymarket Proxy Wallet Hook
 */

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
 * @param eoaAddress - The EOA address to derive the proxy wallet from
 * @param skipCache - If true, bypass the RPC cache for fresh data
 */
async function fetchWalletData(eoaAddress: string, skipCache = false) {
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
  // Pass skipCache to bypass RPC cache when needed (e.g., after placing an order)
  const usdcBalance = await rpcFetchUsdcBalance(proxyAddress, { skipCache });

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
   * Refresh proxy wallet data - clears RPC cache and refetches
   * This should be called after any transaction that changes the balance
   */
  const refresh = useCallback(async () => {
    // Clear the RPC-level cache first
    if (query.data?.proxyAddress) {
      clearBalanceCache(query.data.proxyAddress);
    }

    // Then invalidate and refetch the React Query cache
    await queryClient.invalidateQueries({
      queryKey: [PROXY_WALLET_QUERY_KEY, address],
    });

    // Force a refetch to get fresh data
    return queryClient.refetchQueries({
      queryKey: [PROXY_WALLET_QUERY_KEY, address],
    });
  }, [queryClient, address, query.data?.proxyAddress]);

  /**
   * Force refresh with full cache clearing (deployment + balance)
   */
  const forceRefresh = useCallback(async () => {
    if (query.data?.proxyAddress) {
      clearDeploymentCache(query.data.proxyAddress);
      clearBalanceCache(query.data.proxyAddress);
    }

    // Invalidate and refetch
    await queryClient.invalidateQueries({
      queryKey: [PROXY_WALLET_QUERY_KEY, address],
    });

    return queryClient.refetchQueries({
      queryKey: [PROXY_WALLET_QUERY_KEY, address],
    });
  }, [queryClient, address, query.data?.proxyAddress]);

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
