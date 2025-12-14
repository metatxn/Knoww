"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConnection } from "wagmi";

/**
 * Token balance information
 */
export interface TokenBalance {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  balance: number;
  balanceRaw: string;
  usdValue: number;
  logoUrl?: string;
}

/**
 * Common tokens on Polygon with their contract addresses
 */
const POLYGON_TOKENS: Array<{
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  logoUrl?: string;
}> = [
  {
    symbol: "USDC",
    name: "USD Coin",
    address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // Native USDC on Polygon
    decimals: 6,
    logoUrl: "https://cryptologos.cc/logos/usd-coin-usdc-logo.png",
  },
  {
    symbol: "USDC.e",
    name: "Bridged USDC",
    address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // Bridged USDC.e
    decimals: 6,
    logoUrl: "https://cryptologos.cc/logos/usd-coin-usdc-logo.png",
  },
  {
    symbol: "DAI",
    name: "Dai Stablecoin",
    address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
    decimals: 18,
    logoUrl: "https://cryptologos.cc/logos/multi-collateral-dai-dai-logo.png",
  },
  {
    symbol: "USDT",
    name: "Tether USD",
    address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
    decimals: 6,
    logoUrl: "https://cryptologos.cc/logos/tether-usdt-logo.png",
  },
  {
    symbol: "WETH",
    name: "Wrapped Ether",
    address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
    decimals: 18,
    logoUrl: "https://cryptologos.cc/logos/ethereum-eth-logo.png",
  },
  {
    symbol: "WMATIC",
    name: "Wrapped Matic",
    address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
    decimals: 18,
    logoUrl: "https://cryptologos.cc/logos/polygon-matic-logo.png",
  },
  {
    symbol: "WBTC",
    name: "Wrapped Bitcoin",
    address: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6",
    decimals: 8,
    logoUrl: "https://cryptologos.cc/logos/wrapped-bitcoin-wbtc-logo.png",
  },
];

// ERC20 ABI for balanceOf
const ERC20_ABI = [
  {
    inputs: [{ name: "owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Polygon RPC endpoints with fallbacks.
// Keep this list short: viem fallback ranking/probing + retries can multiply requests quickly.
const POLYGON_RPC_URLS = [
  "https://rpc.ankr.com/polygon", // Ankr - another fallback
  "https://polygon-rpc.com", // Default - rate limited
];

export interface UseWalletTokensOptions {
  /**
   * When false, do not auto-fetch token balances.
   * This prevents background RPC spam because `DepositModal` is rendered in multiple places.
   */
  enabled?: boolean;
}

/**
 * Hook to fetch user's token balances from their Polygon wallet
 *
 * This fetches balances for common tokens that can be used for deposits.
 * Uses multicall to batch all balance requests into a single RPC call,
 * avoiding rate limiting issues.
 */
export function useWalletTokens(options?: UseWalletTokensOptions) {
  const { address, isConnected } = useConnection();
  const enabled = options?.enabled ?? true;

  const [tokens, setTokens] = useState<TokenBalance[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nativeBalance, setNativeBalance] = useState<number>(0);
  const lastFetchRef = useRef<number>(0);

  /**
   * Create a viem client with fallback RPC support
   */
  const createClient = useCallback(async () => {
    const { createPublicClient, http, fallback } = await import("viem");
    const { polygon } = await import("viem/chains");

    // Create transport with fallbacks and retry logic
    const transport = fallback(
      POLYGON_RPC_URLS.map((url) =>
        http(url, {
          timeout: 10_000, // 10 second timeout
          // Keep retries low. If an endpoint is down, retries multiply very quickly.
          retryCount: 1,
          retryDelay: 250,
        })
      ),
      {
        // Ranking triggers extra probe requests (and can loop when endpoints fail).
        // We'll use fixed ordering + fallback instead.
        rank: false,
      }
    );

    return createPublicClient({
      chain: polygon,
      transport,
      batch: {
        multicall: true, // Enable automatic multicall batching
      },
    });
  }, []);

  // Cache the client per hook instance so we don't re-run fallback probing on every fetch.
  const clientPromiseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const getClient = useCallback(async () => {
    if (!clientPromiseRef.current) clientPromiseRef.current = createClient();
    return await clientPromiseRef.current;
  }, [createClient]);

  /**
   * Fetch all token balances for the connected wallet using multicall
   */
  const fetchTokenBalances = useCallback(async () => {
    if (!enabled) return;

    if (!address || !isConnected) {
      setTokens([]);
      return;
    }

    // Debounce: prevent fetching more than once per second
    const now = Date.now();
    if (now - lastFetchRef.current < 1000) {
      return;
    }
    lastFetchRef.current = now;

    setIsLoading(true);
    setError(null);

    try {
      const { formatUnits } = await import("viem");
      const client = await getClient();

      // Use multicall to batch all balance requests into a single RPC call
      // This dramatically reduces the number of requests and avoids rate limiting
      const multicallContracts = POLYGON_TOKENS.map((token) => ({
        address: token.address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "balanceOf" as const,
        args: [address as `0x${string}`],
      }));

      // Execute multicall - all balance requests in ONE RPC call
      const [nativeBal, multicallResults] = await Promise.all([
        client.getBalance({ address: address as `0x${string}` }),
        client.multicall({
          contracts: multicallContracts,
          allowFailure: true, // Don't fail if one token fails
        }),
      ]);

      const nativeBalFormatted = Number(formatUnits(nativeBal, 18));
      setNativeBalance(nativeBalFormatted);

      // Process multicall results
      const tokenBalances: TokenBalance[] = [];

      multicallResults.forEach((result, index) => {
        const token = POLYGON_TOKENS[index];

        if (result.status === "success" && result.result !== undefined) {
          const balance = result.result as bigint;
          const balanceFormatted = Number(formatUnits(balance, token.decimals));

          if (balanceFormatted > 0.000001) {
            // Simple USD value estimation (1:1 for stablecoins, approximate for others)
            let usdValue = balanceFormatted;
            if (token.symbol === "WETH") {
              usdValue = balanceFormatted * 3500; // Approximate ETH price
            } else if (token.symbol === "WMATIC") {
              usdValue = balanceFormatted * 0.5; // Approximate MATIC price
            } else if (token.symbol === "WBTC") {
              usdValue = balanceFormatted * 100000; // Approximate BTC price
            }

            tokenBalances.push({
              symbol: token.symbol,
              name: token.name,
              address: token.address,
              decimals: token.decimals,
              balance: balanceFormatted,
              balanceRaw: balance.toString(),
              usdValue,
              logoUrl: token.logoUrl,
            });
          }
        }
      });

      // Add native POL if balance > 0
      if (nativeBalFormatted > 0.000001) {
        tokenBalances.push({
          symbol: "POL",
          name: "Polygon",
          address: "0x0000000000000000000000000000000000000000",
          decimals: 18,
          balance: nativeBalFormatted,
          balanceRaw: nativeBal.toString(),
          usdValue: nativeBalFormatted * 0.5, // Approximate
          logoUrl: "https://cryptologos.cc/logos/polygon-matic-logo.png",
        });
      }

      // Sort by USD value descending
      tokenBalances.sort((a, b) => b.usdValue - a.usdValue);

      setTokens(tokenBalances);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to fetch token balances";
      setError(errorMessage);
      console.error("[WalletTokens] Failed to fetch balances:", err);
    } finally {
      setIsLoading(false);
    }
  }, [address, isConnected, enabled, getClient]);

  // Fetch balances when address changes
  useEffect(() => {
    if (enabled && isConnected && address) {
      fetchTokenBalances();
    } else {
      // Only clear balances when the wallet disconnects / address goes away.
      // If `enabled` is false, we intentionally keep last balances to avoid UI flicker.
      if (!isConnected || !address) {
        setTokens([]);
        setNativeBalance(0);
      }
    }
  }, [enabled, isConnected, address, fetchTokenBalances]);

  /**
   * Get total USD value of all tokens
   */
  const totalUsdValue = useMemo(
    () => tokens.reduce((sum, token) => sum + token.usdValue, 0),
    [tokens]
  );

  return {
    tokens,
    nativeBalance,
    totalUsdValue,
    isLoading,
    error,
    refresh: fetchTokenBalances,
  };
}
