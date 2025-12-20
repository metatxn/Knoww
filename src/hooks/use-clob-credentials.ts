"use client";

import { useCallback, useEffect, useState } from "react";
import { useConnection, useSignTypedData } from "wagmi";
import {
  CLOB_AUTH_DOMAIN,
  CLOB_AUTH_MESSAGE,
  CLOB_AUTH_TYPES,
} from "@/constants/polymarket";

/**
 * API Key credentials returned by Polymarket
 */
export interface ApiKeyCreds {
  apiKey: string;
  apiSecret: string;
  apiPassphrase: string;
}

/**
 * Storage key for credentials in localStorage
 */
const CREDS_STORAGE_KEY = "polymarket_api_creds";

/**
 * Get stored credentials from localStorage
 */
function getStoredCredentials(address: string): ApiKeyCreds | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = localStorage.getItem(
      `${CREDS_STORAGE_KEY}_${address.toLowerCase()}`
    );
    if (stored) {
      return JSON.parse(stored) as ApiKeyCreds;
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

/**
 * Store credentials in localStorage
 */
function storeCredentials(address: string, creds: ApiKeyCreds): void {
  if (typeof window === "undefined") return;

  localStorage.setItem(
    `${CREDS_STORAGE_KEY}_${address.toLowerCase()}`,
    JSON.stringify(creds)
  );
}

/**
 * Clear stored credentials from localStorage
 */
function clearStoredCredentials(address: string): void {
  if (typeof window === "undefined") return;

  localStorage.removeItem(`${CREDS_STORAGE_KEY}_${address.toLowerCase()}`);
}

/**
 * Hook for managing Polymarket CLOB API credentials
 *
 * This hook handles:
 * 1. Checking for existing stored credentials
 * 2. Deriving new credentials via L1 authentication
 * 3. Storing credentials for future use
 *
 * Users need valid API credentials to post orders to the CLOB.
 * Credentials are derived by signing an EIP-712 message.
 */
export function useClobCredentials() {
  const { address, isConnected } = useConnection();
  const signTypedData = useSignTypedData();

  const [credentials, setCredentials] = useState<ApiKeyCreds | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Load stored credentials when address changes
  useEffect(() => {
    if (address) {
      const stored = getStoredCredentials(address);
      setCredentials(stored);
    } else {
      setCredentials(null);
    }
  }, [address]);

  /**
   * Generate L1 authentication signature
   * This creates an EIP-712 signature that Polymarket uses for authentication
   *
   * IMPORTANT: The signature format must match exactly what Polymarket's SDK produces:
   * - timestamp: string representation of unix seconds
   * - nonce: number (the SDK uses plain number, wagmi/viem accepts number for uint256)
   * - message: exact string "This message attests that I control the given wallet"
   */
  const generateL1Signature = useCallback(async (): Promise<{
    signature: string;
    timestamp: string;
    nonce: string;
  }> => {
    if (!address) {
      throw new Error("Wallet not connected");
    }

    // Timestamp should be current unix time in seconds
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = 0; // Default nonce is 0

    // Sign the EIP-712 typed data
    const signature = await signTypedData.mutateAsync({
      domain: CLOB_AUTH_DOMAIN,
      types: CLOB_AUTH_TYPES,
      primaryType: "ClobAuth",
      message: {
        address: address as `0x${string}`,
        timestamp: `${timestamp}`,
        nonce: BigInt(nonce),
        message: CLOB_AUTH_MESSAGE,
      },
    });

    return {
      signature,
      timestamp: `${timestamp}`, // Return as string for headers
      nonce: `${nonce}`, // Return as string for headers
    };
  }, [address, signTypedData]);

  /**
   * Fallback method: Derive credentials via our API route
   * Used when SDK methods fail (e.g., due to network issues)
   */
  const deriveCredentialsViaApi =
    useCallback(async (): Promise<ApiKeyCreds> => {
      if (!address) {
        throw new Error("Wallet not connected");
      }

      // Generate L1 signature
      const { signature, timestamp, nonce } = await generateL1Signature();

      // Call our API to derive credentials
      const response = await fetch("/api/auth/derive-api-key", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          address,
          signature,
          timestamp,
          nonce,
        }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
        details?: string;
        credentials?: {
          apiKey?: string;
          secret?: string;
          passphrase?: string;
        };
      };

      if (!response.ok || !data.success) {
        let errorMessage =
          data.error || data.details || "Failed to derive API credentials";

        if (errorMessage.includes("Could not derive api key")) {
          errorMessage =
            "Unable to create trading credentials. Please ensure you have completed all previous setup steps (Deploy wallet & Approve USDC) and try again.";
        } else if (errorMessage.includes("Invalid signature")) {
          errorMessage =
            "Signature verification failed. Please try signing again.";
        }

        throw new Error(errorMessage);
      }

      const creds: ApiKeyCreds = {
        apiKey: data.credentials?.apiKey || "",
        apiSecret: data.credentials?.secret || "",
        apiPassphrase: data.credentials?.passphrase || "",
      };

      // Store credentials for future use
      storeCredentials(address, creds);
      setCredentials(creds);

      return creds;
    }, [address, generateL1Signature]);

  /**
   * Create or derive API credentials using the SDK directly
   *
   * This follows the official Polymarket pattern:
   * 1. First try deriveApiKey() - works for returning users
   * 2. If that fails, try createApiKey() - for new users
   *
   * Reference: https://github.com/Polymarket/wagmi-safe-builder-example
   */
  const deriveCredentials = useCallback(async (): Promise<ApiKeyCreds> => {
    if (!address) {
      throw new Error("Wallet not connected");
    }

    if (typeof window === "undefined" || !window.ethereum) {
      throw new Error("No wallet provider found");
    }

    setIsLoading(true);
    setError(null);

    try {
      // Dynamic imports to avoid SSR issues
      const { ClobClient } = await import("@polymarket/clob-client");
      const ethersModule = await import("ethers");

      // Create ethers signer from wallet provider
      const provider = new ethersModule.providers.Web3Provider(
        // biome-ignore lint/suspicious/noExplicitAny: window.ethereum is the wallet provider
        window.ethereum as any
      );
      await provider.send("eth_requestAccounts", []);
      const signer = provider.getSigner();

      // Create a temporary CLOB client (no credentials yet)
      const tempClient = new ClobClient(
        process.env.NEXT_PUBLIC_POLYMARKET_HOST ||
          "https://clob.polymarket.com",
        137, // Polygon chain ID
        signer
      );

      // Try to derive existing credentials first (for returning users)
      // If that fails, create new credentials (for new users)
      let creds: { key: string; secret: string; passphrase: string };

      try {
        console.log(
          "[ClobCredentials] Attempting to derive existing API key..."
        );
        creds = await tempClient.deriveApiKey();
        console.log("[ClobCredentials] Successfully derived existing API key");
      } catch (deriveErr) {
        console.log(
          "[ClobCredentials] Derive failed, creating new API key...",
          deriveErr
        );
        try {
          creds = await tempClient.createApiKey();
          console.log("[ClobCredentials] Successfully created new API key");
        } catch (createErr) {
          // If both SDK methods fail, fall back to our API route
          console.log(
            "[ClobCredentials] SDK methods failed, using API fallback...",
            createErr
          );
          return await deriveCredentialsViaApi();
        }
      }

      const apiCreds: ApiKeyCreds = {
        apiKey: creds.key,
        apiSecret: creds.secret,
        apiPassphrase: creds.passphrase,
      };

      // Store credentials for future use
      storeCredentials(address, apiCreds);
      setCredentials(apiCreds);

      return apiCreds;
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error("Failed to derive credentials");
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [address, deriveCredentialsViaApi]);

  /**
   * Clear stored credentials
   */
  const clearCredentials = useCallback(() => {
    if (address) {
      clearStoredCredentials(address);
      setCredentials(null);
    }
  }, [address]);

  /**
   * Refresh credentials from storage
   * Useful after completing onboarding to ensure state is up to date
   */
  const refresh = useCallback(() => {
    if (address) {
      const stored = getStoredCredentials(address);
      setCredentials(stored);
    }
  }, [address]);

  /**
   * Check if credentials exist and are valid
   */
  const hasCredentials = credentials !== null;

  return {
    // State
    credentials,
    hasCredentials,
    isConnected,
    isLoading,
    error,

    // Actions
    deriveCredentials,
    clearCredentials,
    generateL1Signature,
    refresh,
  };
}
