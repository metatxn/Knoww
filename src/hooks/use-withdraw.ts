"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { encodeFunctionData, parseUnits } from "viem";
import { useConnection, useWalletClient } from "wagmi";
import { USDC_ADDRESS, USDC_DECIMALS } from "@/constants/contracts";
import { POLYGON_CHAIN_ID, RELAYER_API_URL } from "@/constants/polymarket";
import { PROXY_WALLET_QUERY_KEY, useProxyWallet } from "./use-proxy-wallet";

/**
 * ERC20 transfer ABI for encoding the transfer call
 */
const ERC20_TRANSFER_ABI = [
  {
    name: "transfer",
    type: "function",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

/**
 * Withdrawal transaction states
 */
export type WithdrawState =
  | "idle"
  | "signing"
  | "submitting"
  | "pending"
  | "confirmed"
  | "failed";

/**
 * Withdrawal result
 */
export interface WithdrawResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
}

/**
 * Supported tokens for withdrawal
 */
export type WithdrawTokenId = "usdc" | "usdc-e";

export interface WithdrawTokenConfig {
  id: WithdrawTokenId;
  symbol: string;
  name: string;
  address: string;
  decimals: number;
}

/**
 * Token configurations
 * Note: Polymarket uses USDC.e (Bridged USDC) internally
 */
export const WITHDRAW_TOKEN_CONFIGS: Record<
  WithdrawTokenId,
  WithdrawTokenConfig
> = {
  "usdc-e": {
    id: "usdc-e",
    symbol: "USDC.e",
    name: "Bridged USDC",
    address: USDC_ADDRESS, // 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174
    decimals: USDC_DECIMALS,
  },
  usdc: {
    id: "usdc",
    symbol: "USDC",
    name: "USD Coin",
    // Native USDC on Polygon (Circle's native USDC)
    address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    decimals: 6,
  },
};

/**
 * Parameters for initiating a withdrawal
 */
export interface WithdrawParams {
  /** Amount to withdraw in USDC (human-readable, e.g., "100.50") */
  amount: string;
  /** Destination address (external wallet) */
  destinationAddress: string;
  /** Token to withdraw (defaults to usdc-e) */
  tokenId?: WithdrawTokenId;
}

/**
 * Hook for withdrawing USDC from Polymarket proxy wallet to external wallet
 *
 * Uses the Polymarket relayer to execute gasless transactions from the Safe wallet.
 * The withdrawal is a simple ERC20 transfer from the proxy wallet to the external address.
 *
 * @example
 * ```tsx
 * const { withdraw, isWithdrawing, state, error } = useWithdraw();
 *
 * const handleWithdraw = async () => {
 *   const result = await withdraw({
 *     amount: "100",
 *     destinationAddress: "0x..."
 *   });
 *   if (result.success) {
 *     console.log("Withdrawal successful:", result.transactionHash);
 *   }
 * };
 * ```
 */
export function useWithdraw() {
  const { address, isConnected } = useConnection();
  const { data: walletClient } = useWalletClient();
  const {
    proxyAddress,
    usdcBalance,
    refresh: refreshBalance,
  } = useProxyWallet();
  const queryClient = useQueryClient();

  const [state, setState] = useState<WithdrawState>("idle");
  const [error, setError] = useState<string | null>(null);

  const builderSigningServerUrl =
    process.env.NEXT_PUBLIC_BUILDER_SIGNING_SERVER_URL;

  /**
   * Initialize the RelayClient for executing the withdrawal
   */
  const getClient = useCallback(async () => {
    if (!walletClient || !address) {
      throw new Error("Wallet not connected");
    }

    if (!builderSigningServerUrl) {
      throw new Error("Builder signing server URL not configured");
    }

    // Dynamic import to avoid SSR issues
    const { RelayClient } = await import("@polymarket/builder-relayer-client");
    const { BuilderConfig } = await import("@polymarket/builder-signing-sdk");

    // Configure builder with remote signing
    const authToken = process.env.NEXT_PUBLIC_INTERNAL_AUTH_TOKEN;
    const builderConfig = new BuilderConfig({
      remoteBuilderConfig: {
        url: builderSigningServerUrl,
        ...(authToken ? { token: authToken } : {}),
      },
    });

    // Initialize the relay client
    const client = new RelayClient(
      RELAYER_API_URL,
      POLYGON_CHAIN_ID,
      walletClient,
      builderConfig
    );

    return client;
  }, [walletClient, address, builderSigningServerUrl]);

  /**
   * Execute a withdrawal from the proxy wallet
   */
  const withdrawMutation = useMutation({
    mutationFn: async ({
      amount,
      destinationAddress,
      tokenId = "usdc-e",
    }: WithdrawParams): Promise<WithdrawResult> => {
      // Validate inputs
      if (!amount || Number.parseFloat(amount) <= 0) {
        throw new Error("Invalid withdrawal amount");
      }

      if (
        !destinationAddress ||
        !/^0x[a-fA-F0-9]{40}$/.test(destinationAddress)
      ) {
        throw new Error("Invalid destination address");
      }

      if (!proxyAddress) {
        throw new Error(
          "Trading wallet not found. Please complete trading setup first."
        );
      }

      const amountNum = Number.parseFloat(amount);
      if (amountNum > usdcBalance) {
        throw new Error(
          `Insufficient balance. Available: $${usdcBalance.toFixed(2)}`
        );
      }

      // Get token config
      const tokenConfig = WITHDRAW_TOKEN_CONFIGS[tokenId];
      if (!tokenConfig) {
        throw new Error(`Unsupported token: ${tokenId}`);
      }

      setState("signing");
      setError(null);

      try {
        // Get the relay client
        const client = await getClient();

        // Convert amount to token base units
        const amountInWei = parseUnits(amount, tokenConfig.decimals);

        // Encode the transfer function call
        const transferData = encodeFunctionData({
          abi: ERC20_TRANSFER_ABI,
          functionName: "transfer",
          args: [destinationAddress as `0x${string}`, amountInWei],
        });

        // Create the withdrawal transaction
        // Note: For now, we always withdraw from USDC.e (the token held in Polymarket)
        // In the future, we can add swap functionality to convert to other tokens
        const withdrawTx = {
          to: USDC_ADDRESS, // Always use USDC.e since that's what Polymarket holds
          data: transferData,
          value: "0",
        };

        console.log("[Withdraw] Submitting withdrawal transaction:", {
          from: proxyAddress,
          to: destinationAddress,
          token: tokenConfig.symbol,
          amount,
          amountInWei: amountInWei.toString(),
        });

        setState("submitting");

        // Execute the withdrawal via relayer (gasless)
        // Note: Polymarket uses "funwithdraw" as metadata internally
        const response = await client.execute([withdrawTx], "funwithdraw");

        console.log("[Withdraw] Transaction submitted:", {
          transactionID: response.transactionID,
          state: response.state,
        });

        setState("pending");

        // Wait for confirmation
        const result = await response.wait();

        if (
          result &&
          (result.state === "STATE_CONFIRMED" || result.state === "STATE_MINED")
        ) {
          console.log(
            "[Withdraw] Transaction confirmed:",
            result.transactionHash
          );
          setState("confirmed");

          // Refresh balance after successful withdrawal
          await refreshBalance();

          return {
            success: true,
            transactionHash: result.transactionHash,
          };
        }

        // If not confirmed, poll for status
        const maxAttempts = 15;
        const pollInterval = 2000;
        const successStates = [
          "STATE_EXECUTED",
          "STATE_MINED",
          "STATE_CONFIRMED",
        ];

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          console.log(
            `[Withdraw] Polling attempt ${attempt + 1}/${maxAttempts}...`
          );
          const txns = await client.getTransaction(response.transactionID);

          if (txns && txns.length > 0) {
            const tx = txns[0];
            console.log(`[Withdraw] Transaction state: ${tx.state}`);

            if (tx.state === "STATE_FAILED" || tx.state === "STATE_INVALID") {
              throw new Error(`Withdrawal failed with state: ${tx.state}`);
            }

            if (successStates.includes(tx.state)) {
              console.log(
                "[Withdraw] Withdrawal confirmed:",
                tx.transactionHash
              );
              setState("confirmed");

              // Refresh balance
              await refreshBalance();

              return {
                success: true,
                transactionHash: tx.transactionHash,
              };
            }
          }

          // Wait before next poll
          if (attempt < maxAttempts - 1) {
            await new Promise((resolve) => setTimeout(resolve, pollInterval));
          }
        }

        // If polling times out but transaction was submitted, consider it pending
        console.log(
          "[Withdraw] Polling timed out, but transaction was submitted"
        );
        setState("confirmed");
        await refreshBalance();

        return {
          success: true,
          transactionHash: response.transactionHash || response.transactionID,
        };
      } catch (err) {
        console.error("[Withdraw] Error:", err);
        const errorMessage =
          err instanceof Error ? err.message : "Withdrawal failed";
        setState("failed");
        setError(errorMessage);
        throw err;
      }
    },
    onSuccess: () => {
      // Invalidate proxy wallet query to refresh balance
      queryClient.invalidateQueries({
        queryKey: [PROXY_WALLET_QUERY_KEY, address],
      });
    },
    onError: (err) => {
      const errorMessage =
        err instanceof Error ? err.message : "Withdrawal failed";
      setState("failed");
      setError(errorMessage);
    },
  });

  /**
   * Execute a withdrawal
   */
  const withdraw = useCallback(
    async (params: WithdrawParams): Promise<WithdrawResult> => {
      try {
        return await withdrawMutation.mutateAsync(params);
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Withdrawal failed",
        };
      }
    },
    [withdrawMutation]
  );

  /**
   * Reset the withdrawal state
   */
  const reset = useCallback(() => {
    setState("idle");
    setError(null);
  }, []);

  return {
    // Actions
    withdraw,
    reset,

    // State
    state,
    error,
    isWithdrawing: withdrawMutation.isPending,
    isConnected,
    proxyAddress,
    usdcBalance,

    // Validation helpers
    canWithdraw: isConnected && !!proxyAddress && usdcBalance > 0,
    maxWithdrawAmount: usdcBalance,
  };
}
