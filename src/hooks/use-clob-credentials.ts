"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useSignTypedData } from "wagmi";

/**
 * EIP-712 Domain for CLOB Authentication (L1)
 * Used for authenticating API requests with the CLOB
 *
 * Note: chainId should match the chain you're authenticating for
 * Polymarket uses chainId in the domain for signature verification
 *
 * IMPORTANT: This must match exactly what Polymarket's SDK uses
 * See: @polymarket/clob-client/dist/signing/eip712.js
 */
const CLOB_AUTH_DOMAIN = {
  name: "ClobAuthDomain",
  version: "1",
  chainId: 137, // Polygon Mainnet
} as const;

/**
 * EIP-712 Type definitions for CLOB Authentication
 * Must match exactly what Polymarket expects
 *
 * IMPORTANT: The order and types must match the SDK exactly:
 * - address: address
 * - timestamp: string (NOT number!)
 * - nonce: uint256 (passed as number, not BigInt)
 * - message: string
 */
const CLOB_AUTH_TYPES = {
  ClobAuth: [
    { name: "address", type: "address" },
    { name: "timestamp", type: "string" },
    { name: "nonce", type: "uint256" },
    { name: "message", type: "string" },
  ],
} as const;

/**
 * The message to sign for CLOB authentication
 * Must match exactly: "This message attests that I control the given wallet"
 */
const MSG_TO_SIGN = "This message attests that I control the given wallet";

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
  const { address, isConnected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

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

    console.log("[ClobCredentials] Generating L1 signature:", {
      address,
      timestamp,
      nonce,
      message: MSG_TO_SIGN,
      domain: CLOB_AUTH_DOMAIN,
    });

    // Sign the EIP-712 typed data
    // Note: wagmi's signTypedDataAsync handles uint256 as either number or bigint
    const signature = await signTypedDataAsync({
      domain: CLOB_AUTH_DOMAIN,
      types: CLOB_AUTH_TYPES,
      primaryType: "ClobAuth",
      message: {
        address: address as `0x${string}`,
        timestamp: `${timestamp}`, // Must be string in the message (matches SDK)
        nonce: BigInt(nonce), // wagmi requires BigInt for uint256, but value is same
        message: MSG_TO_SIGN,
      },
    });

    console.log("[ClobCredentials] Signature generated:", {
      signature,
      signatureLength: signature.length,
    });

    return {
      signature,
      timestamp: `${timestamp}`, // Return as string for headers
      nonce: `${nonce}`, // Return as string for headers
    };
  }, [address, signTypedDataAsync]);

  /**
   * Derive API credentials from L1 authentication
   * This requires the user to sign an EIP-712 message
   */
  const deriveCredentials = useCallback(async (): Promise<ApiKeyCreds> => {
    if (!address) {
      throw new Error("Wallet not connected");
    }

    setIsLoading(true);
    setError(null);

    try {
      // Generate L1 signature
      const { signature, timestamp, nonce } = await generateL1Signature();

      console.log("[ClobCredentials] Deriving credentials with:", {
        address,
        timestamp,
        nonce,
        signatureLength: signature.length,
      });

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

      console.log("[ClobCredentials] API response:", {
        status: response.status,
        success: data.success,
        error: data.error,
        details: data.details,
        hasCredentials: !!data.credentials,
      });

      if (!response.ok || !data.success) {
        // Provide helpful error messages based on the error
        let errorMessage =
          data.error || data.details || "Failed to derive API credentials";

        // Common error cases with user-friendly messages
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

      console.log("[ClobCredentials] Credentials derived successfully");

      return creds;
    } catch (err) {
      console.error("[ClobCredentials] Error deriving credentials:", err);
      const error =
        err instanceof Error ? err : new Error("Failed to derive credentials");
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [address, generateL1Signature]);

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
  };
}
