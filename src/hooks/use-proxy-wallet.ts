"use client";

import { useCallback, useEffect, useState } from "react";
import { useConnection } from "wagmi";

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
  const { address, isConnected } = useConnection();
  const [data, setData] = useState<ProxyWalletData>({
    proxyAddress: null,
    isDeployed: false,
    usdcBalance: 0,
    isLoading: false,
    error: null,
  });

  /**
   * Check if a proxy wallet has any positions or activity on Polymarket
   * This validates that the derived address is correct and active
   */
  const _checkWalletHasData = useCallback(
    async (proxyAddress: string): Promise<boolean> => {
      try {
        // Check for positions using the PROXY address (not EOA)
        const positionsRes = await fetch(
          `${DATA_API_BASE}/positions?user=${proxyAddress.toLowerCase()}&sizeThreshold=.1&redeemable=true&limit=1`,
        );

        if (positionsRes.ok) {
          const positions = (await positionsRes.json()) as Array<unknown>;
          if (positions.length > 0) {
            return true;
          }
        }

        // Check for activity using the PROXY address (not EOA)
        const activityRes = await fetch(
          `${DATA_API_BASE}/activity?user=${proxyAddress.toLowerCase()}&limit=1`,
        );

        if (activityRes.ok) {
          const activity = (await activityRes.json()) as Array<unknown>;
          if (activity.length > 0) {
            return true;
          }
        }

        return false;
      } catch {
        return false;
      }
    },
    [],
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
            [ownerAddress as `0x${string}`],
          ),
        );

        const proxyAddress = getCreate2Address({
          from: SAFE_FACTORY as `0x${string}`,
          salt: salt,
          bytecodeHash: SAFE_INIT_CODE_HASH as `0x${string}`,
        });

        return proxyAddress;
      } catch {
        return null;
      }
    },
    [],
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
        return code !== undefined && code !== "0x";
      } catch {
        return false;
      }
    },
    [],
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
      } catch {
        return 0;
      }
    },
    [],
  );

  /**
   * Refresh proxy wallet data
   *
   * Strategy:
   * 1. Always derive the Safe address first using CREATE2 (deterministic)
   * 2. Check if the derived Safe is deployed on-chain
   * 3. If deployed, fetch USDC balance and optionally verify it has data
   *
   * This avoids the chicken-and-egg problem of querying Polymarket with EOA
   * when they only store data under proxy wallet addresses.
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
      // Step 1: Derive the Safe address using CREATE2 formula
      // This is deterministic - same EOA always produces same Safe address
      const derivedAddress = await deriveSafeAddress(address);

      if (!derivedAddress) {
        setData({
          proxyAddress: null,
          isDeployed: false,
          usdcBalance: 0,
          isLoading: false,
          error: "Failed to derive Polymarket wallet address",
        });
        return;
      }

      // Step 2: Check if the derived Safe is actually deployed on-chain
      const isActuallyDeployed = await checkIsDeployed(derivedAddress);

      if (!isActuallyDeployed) {
        // Safe not deployed - new user needs to create trading wallet
        setData({
          proxyAddress: null,
          isDeployed: false,
          usdcBalance: 0,
          isLoading: false,
          error: null,
        });
        return;
      }

      // Step 3: Safe is deployed - fetch USDC balance
      const usdcBalance = await fetchUsdcBalance(derivedAddress);

      setData({
        proxyAddress: derivedAddress,
        isDeployed: true,
        usdcBalance,
        isLoading: false,
        error: null,
      });
    } catch (err) {
      setData((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : "Unknown error",
      }));
    }
  }, [
    address,
    isConnected,
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
