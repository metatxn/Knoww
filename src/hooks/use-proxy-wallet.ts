"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";

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
 */

// Polymarket Safe Factory address on Polygon mainnet
const SAFE_FACTORY = "0xaacFeEa03eb1561C4e67d661e40682Bd20E3541b";

// Init code hash used by Polymarket's factory
const SAFE_INIT_CODE_HASH =
  "0x2bce2127ff07fb632d16c8347c4ebf501f4841168bed00d9e6ef715ddb6fcecf";

// USDC.e address on Polygon
const USDC_E_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const USDC_DECIMALS = 6;

// Polymarket Data API
const DATA_API_BASE = "https://data-api.polymarket.com";

export interface ProxyWalletData {
  proxyAddress: string | null;
  isDeployed: boolean;
  usdcBalance: number;
  isLoading: boolean;
  error: string | null;
}

export function useProxyWallet() {
  const { address, isConnected } = useAccount();
  const [data, setData] = useState<ProxyWalletData>({
    proxyAddress: null,
    isDeployed: false,
    usdcBalance: 0,
    isLoading: false,
    error: null,
  });

  /**
   * Fetch the user's actual Polymarket wallet from the Data API
   * This is the most reliable way to get the correct wallet address
   * as it returns the proxyWallet field from existing positions/trades
   */
  const fetchPolymarketWallet = useCallback(
    async (userAddress: string): Promise<string | null> => {
      try {
        // Try to get from positions first
        const positionsRes = await fetch(
          `${DATA_API_BASE}/positions?user=${userAddress.toLowerCase()}&limit=1`
        );

        if (positionsRes.ok) {
          const positions = (await positionsRes.json()) as Array<{
            proxyWallet?: string;
          }>;
          if (positions.length > 0 && positions[0]?.proxyWallet) {
            console.log(
              "[ProxyWallet] Found wallet from positions:",
              positions[0].proxyWallet
            );
            return positions[0].proxyWallet;
          }
        }

        // Try to get from activity/trades
        const activityRes = await fetch(
          `${DATA_API_BASE}/activity?user=${userAddress.toLowerCase()}&limit=1`
        );

        if (activityRes.ok) {
          const activity = (await activityRes.json()) as Array<{
            proxyWallet?: string;
          }>;
          if (activity.length > 0 && activity[0]?.proxyWallet) {
            console.log(
              "[ProxyWallet] Found wallet from activity:",
              activity[0].proxyWallet
            );
            return activity[0].proxyWallet;
          }
        }

        console.log("[ProxyWallet] No existing positions/trades found");
        return null;
      } catch (err) {
        console.error("[ProxyWallet] Failed to fetch from Data API:", err);
        return null;
      }
    },
    []
  );

  /**
   * Derive the Safe address using CREATE2 formula (fallback)
   * Only used when user has no existing positions/trades
   */
  const deriveSafeAddress = useCallback(
    async (ownerAddress: string): Promise<string | null> => {
      try {
        const { getCreate2Address, keccak256, encodeAbiParameters } =
          await import("viem");

        const salt = keccak256(
          encodeAbiParameters(
            [{ name: "address", type: "address" }],
            [ownerAddress as `0x${string}`]
          )
        );

        const proxyAddress = getCreate2Address({
          from: SAFE_FACTORY as `0x${string}`,
          salt: salt,
          bytecodeHash: SAFE_INIT_CODE_HASH as `0x${string}`,
        });

        console.log(
          "[ProxyWallet] Derived Safe address (fallback):",
          proxyAddress
        );
        return proxyAddress;
      } catch (err) {
        console.error("[ProxyWallet] Failed to derive Safe address:", err);
        return null;
      }
    },
    []
  );

  /**
   * Check if an address has deployed code (is a contract)
   */
  const checkIsDeployed = useCallback(
    async (proxyAddress: string): Promise<boolean> => {
      try {
        const { createPublicClient, http } = await import("viem");
        const { polygon } = await import("viem/chains");

        const client = createPublicClient({
          chain: polygon,
          transport: http(),
        });

        const code = await client.getCode({
          address: proxyAddress as `0x${string}`,
        });

        // If code exists and is not empty, the contract is deployed
        const isDeployed = code !== undefined && code !== "0x";
        console.log(
          "[ProxyWallet] Check deployed:",
          proxyAddress,
          "->",
          isDeployed
        );
        return isDeployed;
      } catch (err) {
        console.error("[ProxyWallet] Failed to check deployment:", err);
        return false;
      }
    },
    []
  );

  /**
   * Fetch USDC.e balance for an address
   */
  const fetchUsdcBalance = useCallback(
    async (walletAddress: string): Promise<number> => {
      try {
        const { createPublicClient, http, formatUnits } = await import("viem");
        const { polygon } = await import("viem/chains");

        const client = createPublicClient({
          chain: polygon,
          transport: http(),
        });

        const balance = await client.readContract({
          address: USDC_E_ADDRESS as `0x${string}`,
          abi: [
            {
              inputs: [{ name: "owner", type: "address" }],
              name: "balanceOf",
              outputs: [{ name: "", type: "uint256" }],
              stateMutability: "view",
              type: "function",
            },
          ],
          functionName: "balanceOf",
          args: [walletAddress as `0x${string}`],
        });

        return Number(formatUnits(balance, USDC_DECIMALS));
      } catch (err) {
        console.error("[ProxyWallet] Failed to fetch USDC balance:", err);
        return 0;
      }
    },
    []
  );

  /**
   * Refresh proxy wallet data
   */
  const refresh = useCallback(async () => {
    if (!address || !isConnected) {
      setData({
        proxyAddress: null,
        isDeployed: false,
        usdcBalance: 0,
        isLoading: false,
        error: null,
      });
      return;
    }

    setData((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // First, try to fetch the actual Polymarket wallet from Data API
      // This is the most reliable source as it shows the actual trading wallet
      let proxyAddress = await fetchPolymarketWallet(address);

      // If no existing positions/trades, fall back to CREATE2 derivation
      if (!proxyAddress) {
        proxyAddress = await deriveSafeAddress(address);
      }

      if (!proxyAddress) {
        setData({
          proxyAddress: null,
          isDeployed: false,
          usdcBalance: 0,
          isLoading: false,
          error: "Failed to determine Polymarket wallet address",
        });
        return;
      }

      // Check if deployed (has code) - for EOA this will be false
      const isDeployed = await checkIsDeployed(proxyAddress);

      // Fetch balance regardless of whether it's a contract or EOA
      const usdcBalance = await fetchUsdcBalance(proxyAddress);

      console.log("[ProxyWallet] Result:", {
        proxyAddress,
        isDeployed,
        usdcBalance,
        source:
          proxyAddress.toLowerCase() === address.toLowerCase()
            ? "EOA"
            : "proxy",
      });

      setData({
        proxyAddress,
        isDeployed: true, // Mark as "deployed" if we found it from Data API (user has traded)
        usdcBalance,
        isLoading: false,
        error: null,
      });
    } catch (err) {
      console.error("[ProxyWallet] Refresh error:", err);
      setData((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : "Unknown error",
      }));
    }
  }, [
    address,
    isConnected,
    fetchPolymarketWallet,
    deriveSafeAddress,
    checkIsDeployed,
    fetchUsdcBalance,
  ]);

  // Auto-refresh when address changes
  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    ...data,
    refresh,
  };
}
