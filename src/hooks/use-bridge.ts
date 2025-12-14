"use client";

import { useCallback, useState } from "react";
import { useProxyWallet } from "./use-proxy-wallet";

/**
 * Polymarket Bridge API base URL
 * @see https://docs.polymarket.com/developers/misc-endpoints/bridge-deposit
 */
const BRIDGE_API_URL = "https://bridge.polymarket.com";

/**
 * Supported asset from the Bridge API
 */
export interface SupportedAsset {
  chainId: string;
  chainName: string;
  token: {
    name: string;
    symbol: string;
    address: string;
    decimals: number;
  };
  minCheckoutUsd: number;
}

/**
 * Deposit address for a specific chain/token
 */
export interface DepositAddress {
  chainId: string;
  chainName: string;
  tokenAddress: string;
  tokenSymbol: string;
  depositAddress: string;
}

/**
 * Response from the create deposit endpoint
 * The API returns a single address object with addresses for different chains
 */
export interface CreateDepositResponse {
  address: {
    evm: string; // For EVM chains (Ethereum, Polygon, Arbitrum, etc.)
    svm: string; // For Solana
    btc: string; // For Bitcoin
  };
  note?: string;
}

/**
 * Response from the supported assets endpoint
 */
export interface SupportedAssetsResponse {
  supportedAssets: SupportedAsset[];
}

/**
 * Chain metadata for display
 */
export const CHAIN_METADATA: Record<
  string,
  { name: string; icon: string; color: string }
> = {
  "1": { name: "Ethereum", icon: "⟠", color: "#627EEA" },
  "137": { name: "Polygon", icon: "⬡", color: "#8247E5" },
  "42161": { name: "Arbitrum", icon: "🔷", color: "#28A0F0" },
  "10": { name: "Optimism", icon: "🔴", color: "#FF0420" },
  "8453": { name: "Base", icon: "🔵", color: "#0052FF" },
  "43114": { name: "Avalanche", icon: "🔺", color: "#E84142" },
  "56": { name: "BNB Chain", icon: "⛓️", color: "#F0B90B" },
  "324": { name: "zkSync", icon: "⚡", color: "#8C8DFC" },
};

/**
 * Hook for interacting with Polymarket Bridge API
 *
 * This hook provides methods to:
 * 1. Get supported assets for deposits
 * 2. Create deposit addresses for bridging assets to Polymarket
 *
 * @see https://docs.polymarket.com/developers/misc-endpoints/bridge-deposit
 * @see https://docs.polymarket.com/developers/misc-endpoints/bridge-supported-assets
 */
export function useBridge() {
  const { proxyAddress } = useProxyWallet();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supportedAssets, setSupportedAssets] = useState<SupportedAsset[]>([]);
  const [depositAddresses, setDepositAddresses] = useState<DepositAddress[]>(
    []
  );

  /**
   * Fetch supported assets for deposits
   *
   * Returns all supported chains and tokens that can be used for deposits.
   * Each asset includes minimum deposit amount in USD.
   */
  const getSupportedAssets = useCallback(async (): Promise<
    SupportedAsset[]
  > => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${BRIDGE_API_URL}/supported-assets`);

      if (!response.ok) {
        throw new Error(`Failed to fetch supported assets: ${response.status}`);
      }

      const data: SupportedAssetsResponse = await response.json();
      setSupportedAssets(data.supportedAssets);
      return data.supportedAssets;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to fetch supported assets";
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Create deposit addresses for a wallet
   *
   * The API returns a single address object with addresses for different chain types:
   * - evm: For all EVM chains (Ethereum, Polygon, Arbitrum, Base, etc.)
   * - svm: For Solana
   * - btc: For Bitcoin
   *
   * Assets sent to these addresses are automatically bridged to USDC.e on Polygon.
   *
   * @param walletAddress - The Polymarket wallet address (proxy wallet)
   */
  const createDepositAddresses = useCallback(
    async (walletAddress?: string): Promise<DepositAddress[]> => {
      const targetAddress = walletAddress || proxyAddress;

      if (!targetAddress) {
        throw new Error(
          "No wallet address provided. Please complete trading setup first."
        );
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`${BRIDGE_API_URL}/deposit`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            address: targetAddress,
          }),
        });

        if (!response.ok) {
          const errorData = (await response.json().catch(() => ({}))) as {
            message?: string;
          };
          throw new Error(
            errorData.message ||
              `Failed to create deposit addresses: ${response.status}`
          );
        }

        const data: CreateDepositResponse = await response.json();

        // Convert the API response to our DepositAddress format
        // The EVM address is used for all EVM chains (Polygon, Ethereum, Arbitrum, etc.)
        const evmDepositAddresses: DepositAddress[] = [
          // Polygon (primary for Polymarket)
          {
            chainId: "137",
            chainName: "Polygon",
            tokenAddress: "", // Any supported token
            tokenSymbol: "USDC", // Default to USDC
            depositAddress: data.address.evm,
          },
          // Ethereum
          {
            chainId: "1",
            chainName: "Ethereum",
            tokenAddress: "",
            tokenSymbol: "USDC",
            depositAddress: data.address.evm,
          },
          // Arbitrum
          {
            chainId: "42161",
            chainName: "Arbitrum",
            tokenAddress: "",
            tokenSymbol: "USDC",
            depositAddress: data.address.evm,
          },
          // Base
          {
            chainId: "8453",
            chainName: "Base",
            tokenAddress: "",
            tokenSymbol: "USDC",
            depositAddress: data.address.evm,
          },
          // Optimism
          {
            chainId: "10",
            chainName: "Optimism",
            tokenAddress: "",
            tokenSymbol: "USDC",
            depositAddress: data.address.evm,
          },
        ];

        setDepositAddresses(evmDepositAddresses);
        return evmDepositAddresses;
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : "Failed to create deposit addresses";
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [proxyAddress]
  );

  /**
   * Get chain metadata for display
   */
  const getChainMetadata = useCallback((chainId: string) => {
    return (
      CHAIN_METADATA[chainId] || {
        name: `Chain ${chainId}`,
        icon: "🔗",
        color: "#888888",
      }
    );
  }, []);

  /**
   * Clear deposit addresses (reset state)
   */
  const clearDepositAddresses = useCallback(() => {
    setDepositAddresses([]);
    setError(null);
  }, []);

  return {
    // State
    isLoading,
    error,
    supportedAssets,
    depositAddresses,
    proxyAddress,

    // Actions
    getSupportedAssets,
    createDepositAddresses,
    getChainMetadata,
    clearDepositAddresses,
  };
}
