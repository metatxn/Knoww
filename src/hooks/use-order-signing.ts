"use client";

import { useCallback, useState } from "react";
import { useAccount, useSignTypedData } from "wagmi";

/**
 * Polymarket CTF Exchange Contract Addresses (Polygon Mainnet)
 * Reference: https://docs.polymarket.com/developers/CLOB/introduction
 */
const CTF_EXCHANGE_ADDRESS = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E";
const NEG_RISK_CTF_EXCHANGE_ADDRESS =
  "0xC5d563A36AE78145C45a50134d48A1215220f80a";

/**
 * EIP-712 Domain for Polymarket CTF Exchange
 */
const EXCHANGE_DOMAIN = {
  name: "Polymarket CTF Exchange",
  version: "1",
  chainId: 137, // Polygon Mainnet
} as const;

/**
 * EIP-712 Type definitions for Order signing
 */
const ORDER_TYPES = {
  Order: [
    { name: "salt", type: "uint256" },
    { name: "maker", type: "address" },
    { name: "signer", type: "address" },
    { name: "taker", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "makerAmount", type: "uint256" },
    { name: "takerAmount", type: "uint256" },
    { name: "expiration", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "feeRateBps", type: "uint256" },
    { name: "side", type: "uint8" },
    { name: "signatureType", type: "uint8" },
  ],
} as const;

/**
 * Order side enum matching Polymarket's CLOB
 */
export enum OrderSide {
  BUY = 0,
  SELL = 1,
}

/**
 * Signature type enum
 * EOA = 0 (Externally Owned Account)
 * POLY_PROXY = 1 (Polymarket Proxy Wallet)
 * POLY_GNOSIS_SAFE = 2 (Gnosis Safe)
 */
export enum SignatureType {
  EOA = 0,
  POLY_PROXY = 1,
  POLY_GNOSIS_SAFE = 2,
}

/**
 * Order type for CLOB
 */
export enum OrderType {
  GTC = "GTC", // Good Till Cancelled
  FOK = "FOK", // Fill Or Kill
  GTD = "GTD", // Good Till Date
}

/**
 * Order parameters for creating a new order
 */
export interface OrderParams {
  tokenId: string;
  price: number; // 0.01 to 0.99
  size: number; // Number of shares
  side: OrderSide;
  expiration?: number; // Unix timestamp (optional, defaults to 24 hours)
  nonce?: number; // Optional, will be generated if not provided
  feeRateBps?: number; // Fee rate in basis points (default: 0)
  negRisk?: boolean; // Whether this is a neg risk market
}

/**
 * Signed order ready to be submitted to CLOB
 */
export interface SignedOrder {
  salt: string;
  maker: string;
  signer: string;
  taker: string;
  tokenId: string;
  makerAmount: string;
  takerAmount: string;
  expiration: string;
  nonce: string;
  feeRateBps: string;
  side: "BUY" | "SELL";
  signatureType: string;
  signature: string;
}

/**
 * Generate a random salt for order uniqueness
 */
function generateSalt(): string {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  return (
    "0x" +
    Array.from(randomBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

/**
 * Generate a nonce based on current timestamp
 */
function generateNonce(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Calculate maker and taker amounts from price and size
 * For BUY orders: makerAmount = price * size (USDC), takerAmount = size (shares)
 * For SELL orders: makerAmount = size (shares), takerAmount = price * size (USDC)
 *
 * Amounts are in wei (18 decimals for shares, 6 decimals for USDC)
 */
function calculateAmounts(
  price: number,
  size: number,
  side: OrderSide
): { makerAmount: string; takerAmount: string } {
  // Price is between 0 and 1 (e.g., 0.55 for 55%)
  // Size is number of shares
  // USDC has 6 decimals, shares have 6 decimals on Polymarket

  const USDC_DECIMALS = 6;
  const SHARE_DECIMALS = 6;

  const usdcAmount = Math.floor(price * size * 10 ** USDC_DECIMALS);
  const shareAmount = Math.floor(size * 10 ** SHARE_DECIMALS);

  if (side === OrderSide.BUY) {
    // Buying shares: give USDC, receive shares
    return {
      makerAmount: usdcAmount.toString(),
      takerAmount: shareAmount.toString(),
    };
  }
  // Selling shares: give shares, receive USDC
  return {
    makerAmount: shareAmount.toString(),
    takerAmount: usdcAmount.toString(),
  };
}

/**
 * Hook for signing Polymarket orders using EIP-712
 *
 * This hook provides functionality to:
 * 1. Build order structs matching Polymarket's CTF Exchange format
 * 2. Sign orders using wagmi's useSignTypedData
 * 3. Return signed orders ready for submission to the CLOB
 */
export function useOrderSigning() {
  const { address, isConnected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Build an unsigned order struct
   */
  const buildOrder = useCallback(
    (params: OrderParams) => {
      if (!address) {
        throw new Error("Wallet not connected");
      }

      const {
        tokenId,
        price,
        size,
        side,
        expiration = Math.floor(Date.now() / 1000) + 24 * 60 * 60, // Default 24 hours
        nonce = generateNonce(),
        feeRateBps = 0,
        negRisk = false,
      } = params;

      // Validate price
      if (price < 0.01 || price > 0.99) {
        throw new Error("Price must be between 0.01 and 0.99");
      }

      // Validate size
      if (size < 1) {
        throw new Error("Size must be at least 1");
      }

      const { makerAmount, takerAmount } = calculateAmounts(price, size, side);

      const order = {
        salt: generateSalt(),
        maker: address,
        signer: address,
        taker: "0x0000000000000000000000000000000000000000", // Open order (any taker)
        tokenId: tokenId,
        makerAmount,
        takerAmount,
        expiration: expiration.toString(),
        nonce: nonce.toString(),
        feeRateBps: feeRateBps.toString(),
        side: side,
        signatureType: SignatureType.EOA,
        negRisk,
      };

      return order;
    },
    [address]
  );

  /**
   * Sign an order using EIP-712 typed data signing
   */
  const signOrder = useCallback(
    async (params: OrderParams): Promise<SignedOrder> => {
      if (!address) {
        throw new Error("Wallet not connected");
      }

      setIsLoading(true);
      setError(null);

      try {
        const order = buildOrder(params);

        // Determine which exchange contract to use
        const verifyingContract = order.negRisk
          ? NEG_RISK_CTF_EXCHANGE_ADDRESS
          : CTF_EXCHANGE_ADDRESS;

        // Sign the order using EIP-712
        const signature = await signTypedDataAsync({
          domain: {
            ...EXCHANGE_DOMAIN,
            verifyingContract: verifyingContract as `0x${string}`,
          },
          types: ORDER_TYPES,
          primaryType: "Order",
          message: {
            salt: BigInt(order.salt),
            maker: order.maker as `0x${string}`,
            signer: order.signer as `0x${string}`,
            taker: order.taker as `0x${string}`,
            tokenId: BigInt(order.tokenId),
            makerAmount: BigInt(order.makerAmount),
            takerAmount: BigInt(order.takerAmount),
            expiration: BigInt(order.expiration),
            nonce: BigInt(order.nonce),
            feeRateBps: BigInt(order.feeRateBps),
            side: order.side,
            signatureType: order.signatureType,
          },
        });

        // Return the signed order in the format expected by the CLOB
        const signedOrder: SignedOrder = {
          salt: order.salt,
          maker: order.maker,
          signer: order.signer,
          taker: order.taker,
          tokenId: order.tokenId,
          makerAmount: order.makerAmount,
          takerAmount: order.takerAmount,
          expiration: order.expiration,
          nonce: order.nonce,
          feeRateBps: order.feeRateBps,
          side: order.side === OrderSide.BUY ? "BUY" : "SELL",
          signatureType: order.signatureType.toString(),
          signature,
        };

        return signedOrder;
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error("Failed to sign order");
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [address, buildOrder, signTypedDataAsync]
  );

  /**
   * Submit a signed order to the backend API
   */
  const submitOrder = useCallback(
    async (
      signedOrder: SignedOrder,
      orderType: OrderType = OrderType.GTC
    ): Promise<{ success: boolean; order?: unknown; error?: string }> => {
      if (!address) {
        throw new Error("Wallet not connected");
      }

      try {
        const response = await fetch("/api/orders/create", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userAddress: address,
            signedOrder: {
              salt: signedOrder.salt,
              maker: signedOrder.maker,
              signer: signedOrder.signer,
              taker: signedOrder.taker,
              tokenId: signedOrder.tokenId,
              makerAmount: signedOrder.makerAmount,
              takerAmount: signedOrder.takerAmount,
              expiration: signedOrder.expiration,
              nonce: signedOrder.nonce,
              feeRateBps: signedOrder.feeRateBps,
              side: signedOrder.side,
              signatureType: signedOrder.signatureType,
            },
            signature: signedOrder.signature,
            orderType,
          }),
        });

        const data = (await response.json()) as {
          success: boolean;
          order?: unknown;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error || "Failed to submit order");
        }

        return data;
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error("Failed to submit order");
        setError(error);
        throw error;
      }
    },
    [address]
  );

  /**
   * Sign and submit an order in one call
   */
  const createOrder = useCallback(
    async (
      params: OrderParams,
      orderType: OrderType = OrderType.GTC
    ): Promise<{ success: boolean; order?: unknown; error?: string }> => {
      const signedOrder = await signOrder(params);
      return submitOrder(signedOrder, orderType);
    },
    [signOrder, submitOrder]
  );

  /**
   * Cancel an order
   */
  const cancelOrder = useCallback(
    async (
      orderId: string
    ): Promise<{ success: boolean; response?: unknown; error?: string }> => {
      if (!address) {
        throw new Error("Wallet not connected");
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/orders/cancel", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userAddress: address,
            orderID: orderId,
            signature: "cancel", // Backend handles cancellation differently
          }),
        });

        const data = (await response.json()) as {
          success: boolean;
          response?: unknown;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error || "Failed to cancel order");
        }

        return data;
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error("Failed to cancel order");
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [address]
  );

  return {
    // State
    isConnected,
    address,
    isLoading,
    error,

    // Actions
    buildOrder,
    signOrder,
    submitOrder,
    createOrder,
    cancelOrder,

    // Utilities
    generateSalt,
    generateNonce,
    calculateAmounts,
  };
}

/**
 * Calculate potential profit/loss for an order
 */
export function calculatePotentialPnL(
  price: number,
  size: number,
  side: OrderSide
): { cost: number; potentialWin: number; potentialLoss: number } {
  const cost = price * size;

  if (side === OrderSide.BUY) {
    // Buying YES: pay price * size, win size if YES, lose cost if NO
    return {
      cost,
      potentialWin: size - cost, // Profit = payout - cost
      potentialLoss: cost,
    };
  }
  // Selling YES (buying NO): pay (1-price) * size, win size if NO
  const noPrice = 1 - price;
  const noCost = noPrice * size;
  return {
    cost: noCost,
    potentialWin: size - noCost,
    potentialLoss: noCost,
  };
}
