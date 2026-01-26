/**
 * CTF Operations Hook
 *
 * Handles Conditional Token Framework operations:
 * - Split: Convert USDC into YES + NO outcome tokens
 * - Merge: Convert YES + NO outcome tokens back to USDC
 * - Redeem: Claim winnings after market resolution
 *
 * Reference: https://docs.polymarket.com/developers/CTF/overview
 */

"use client";

import { useCallback, useState } from "react";
import { useConnection, useWalletClient } from "wagmi";
import { CONTRACTS, CTF_ADDRESS, USDC_E_DECIMALS } from "@/constants/contracts";
import { POLYGON_CHAIN_ID, RELAYER_API_URL } from "@/constants/polymarket";

// ============================================================================
// Constants
// ============================================================================

/** Parent collection ID is always bytes32(0) for Polymarket */
const PARENT_COLLECTION_ID =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;

/** Binary partition: [1, 2] for YES (0b01) and NO (0b10) */
const BINARY_PARTITION = [BigInt(1), BigInt(2)];

/** Transaction polling configuration */
const POLL_CONFIG = {
  maxAttempts: 15,
  intervalMs: 2000,
  successStates: [
    "STATE_EXECUTED",
    "STATE_MINED",
    "STATE_CONFIRMED",
  ] as string[],
  failureStates: ["STATE_FAILED", "STATE_INVALID"] as string[],
};

// ============================================================================
// ABI Definitions
// ============================================================================

const CTF_ABI = [
  {
    name: "splitPosition",
    type: "function",
    inputs: [
      { name: "collateralToken", type: "address" },
      { name: "parentCollectionId", type: "bytes32" },
      { name: "conditionId", type: "bytes32" },
      { name: "partition", type: "uint256[]" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "mergePositions",
    type: "function",
    inputs: [
      { name: "collateralToken", type: "address" },
      { name: "parentCollectionId", type: "bytes32" },
      { name: "conditionId", type: "bytes32" },
      { name: "partition", type: "uint256[]" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "redeemPositions",
    type: "function",
    inputs: [
      { name: "collateralToken", type: "address" },
      { name: "parentCollectionId", type: "bytes32" },
      { name: "conditionId", type: "bytes32" },
      { name: "indexSets", type: "uint256[]" },
    ],
    outputs: [],
  },
  {
    name: "balanceOfBatch",
    type: "function",
    inputs: [
      { name: "owners", type: "address[]" },
      { name: "ids", type: "uint256[]" },
    ],
    outputs: [{ name: "", type: "uint256[]" }],
    stateMutability: "view",
  },
] as const;

// ============================================================================
// Types
// ============================================================================

export interface CTFOperationState {
  isLoading: boolean;
  error: string | null;
  txHash: string | null;
}

export interface OutcomeTokenBalances {
  yesBalance: bigint;
  noBalance: bigint;
  minBalance: bigint;
}

type OperationResult = { success: boolean; txHash?: string; error?: string };

type CTFFunction = "splitPosition" | "mergePositions" | "redeemPositions";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse error message into user-friendly format
 */
function parseUserFriendlyError(errorMessage: string): string {
  const lowerMsg = errorMessage.toLowerCase();

  const errorMappings: Array<{ patterns: string[]; message: string }> = [
    {
      patterns: ["user rejected", "user denied", "rejected the request"],
      message: "Transaction cancelled",
    },
    {
      patterns: ["insufficient", "exceeds balance"],
      message: "Insufficient balance",
    },
    {
      patterns: ["network", "timeout", "connection"],
      message: "Network error. Please try again.",
    },
    {
      patterns: ["gas", "execution reverted"],
      message: "Transaction failed. Please try again.",
    },
  ];

  for (const { patterns, message } of errorMappings) {
    if (patterns.some((p) => lowerMsg.includes(p))) {
      return message;
    }
  }

  return errorMessage.length > 100
    ? `${errorMessage.substring(0, 100)}...`
    : errorMessage;
}

/**
 * Poll for transaction confirmation
 */
async function pollForConfirmation(
  client: {
    getTransaction: (
      id: string
    ) => Promise<Array<{ state: string; transactionHash: string }>>;
  },
  transactionID: string,
  operationName: string
): Promise<string | null> {
  for (let attempt = 0; attempt < POLL_CONFIG.maxAttempts; attempt++) {
    const txns = await client.getTransaction(transactionID);

    if (txns?.length > 0) {
      const tx = txns[0];

      if (POLL_CONFIG.failureStates.includes(tx.state)) {
        throw new Error(`${operationName} failed with state: ${tx.state}`);
      }

      if (POLL_CONFIG.successStates.includes(tx.state)) {
        return tx.transactionHash;
      }
    }

    if (attempt < POLL_CONFIG.maxAttempts - 1) {
      await new Promise((resolve) =>
        setTimeout(resolve, POLL_CONFIG.intervalMs)
      );
    }
  }

  return null; // Timeout - transaction submitted but not confirmed
}

// ============================================================================
// Hook
// ============================================================================

export function useCtfOperations() {
  const { address, isConnected } = useConnection();
  const { data: walletClient } = useWalletClient();

  const [state, setState] = useState<CTFOperationState>({
    isLoading: false,
    error: null,
    txHash: null,
  });

  const builderSigningServerUrl =
    process.env.NEXT_PUBLIC_BUILDER_SIGNING_SERVER_URL;

  /**
   * Get the RelayClient for gasless transactions
   */
  const getRelayClient = useCallback(async () => {
    if (!walletClient || !address) {
      throw new Error("Wallet not connected");
    }

    if (!builderSigningServerUrl) {
      throw new Error("Builder signing server URL not configured");
    }

    const { RelayClient } = await import("@polymarket/builder-relayer-client");
    const { BuilderConfig } = await import("@polymarket/builder-signing-sdk");

    const authToken = process.env.NEXT_PUBLIC_INTERNAL_AUTH_TOKEN;
    const builderConfig = new BuilderConfig({
      remoteBuilderConfig: {
        url: builderSigningServerUrl,
        ...(authToken ? { token: authToken } : {}),
      },
    });

    return new RelayClient(
      RELAYER_API_URL,
      POLYGON_CHAIN_ID,
      walletClient,
      builderConfig
    );
  }, [walletClient, address, builderSigningServerUrl]);

  /**
   * Execute a CTF operation via relayer with polling
   */
  const executeCTFOperation = useCallback(
    async (
      operationName: CTFFunction,
      encodedData: `0x${string}`
    ): Promise<OperationResult> => {
      setState({ isLoading: true, error: null, txHash: null });

      try {
        const client = await getRelayClient();

        const response = await client.execute([
          { to: CTF_ADDRESS, data: encodedData, value: "0" },
        ]);

        const confirmedHash = await pollForConfirmation(
          client,
          response.transactionID,
          operationName
        );

        const txHash =
          confirmedHash || response.transactionHash || response.transactionID;

        setState({ isLoading: false, error: null, txHash });
        return { success: true, txHash };
      } catch (err) {
        const rawMessage =
          err instanceof Error ? err.message : `${operationName} failed`;
        const errorMessage = parseUserFriendlyError(rawMessage);
        console.error(`[CTF] ${operationName} error:`, err);
        setState({ isLoading: false, error: errorMessage, txHash: null });
        return { success: false, error: errorMessage };
      }
    },
    [getRelayClient]
  );

  /**
   * Get outcome token balances for a market
   */
  const getOutcomeBalances = useCallback(
    async (
      yesTokenId: string,
      noTokenId: string,
      ownerAddress?: string
    ): Promise<OutcomeTokenBalances> => {
      const owner = ownerAddress || address;
      if (!owner) {
        throw new Error("No address available");
      }

      const { createPublicClient, http } = await import("viem");
      const { polygon } = await import("viem/chains");
      const { getRpcUrl } = await import("@/lib/rpc");

      const publicClient = createPublicClient({
        chain: polygon,
        transport: http(getRpcUrl()),
      });

      const balances = (await publicClient.readContract({
        address: CTF_ADDRESS as `0x${string}`,
        abi: CTF_ABI,
        functionName: "balanceOfBatch",
        args: [
          [owner as `0x${string}`, owner as `0x${string}`],
          [BigInt(yesTokenId), BigInt(noTokenId)],
        ],
      })) as [bigint, bigint];

      const [yesBalance, noBalance] = balances;
      const minBalance = yesBalance < noBalance ? yesBalance : noBalance;

      return { yesBalance, noBalance, minBalance };
    },
    [address]
  );

  /**
   * Split USDC into YES + NO outcome tokens
   * 1 USDC → 1 YES + 1 NO
   */
  const splitPosition = useCallback(
    async (
      conditionId: string,
      amount: number,
      _proxyAddress: string
    ): Promise<OperationResult> => {
      const { encodeFunctionData, parseUnits } = await import("viem");

      const amountInWei = parseUnits(amount.toString(), USDC_E_DECIMALS);

      const encodedData = encodeFunctionData({
        abi: CTF_ABI,
        functionName: "splitPosition",
        args: [
          CONTRACTS.USDC_E as `0x${string}`,
          PARENT_COLLECTION_ID,
          conditionId as `0x${string}`,
          BINARY_PARTITION,
          amountInWei,
        ],
      });

      return executeCTFOperation("splitPosition", encodedData);
    },
    [executeCTFOperation]
  );

  /**
   * Merge YES + NO outcome tokens back to USDC
   * 1 YES + 1 NO → 1 USDC
   */
  const mergePositions = useCallback(
    async (
      conditionId: string,
      amount: number,
      _proxyAddress: string
    ): Promise<OperationResult> => {
      const { encodeFunctionData, parseUnits } = await import("viem");

      const amountInWei = parseUnits(amount.toString(), USDC_E_DECIMALS);

      const encodedData = encodeFunctionData({
        abi: CTF_ABI,
        functionName: "mergePositions",
        args: [
          CONTRACTS.USDC_E as `0x${string}`,
          PARENT_COLLECTION_ID,
          conditionId as `0x${string}`,
          BINARY_PARTITION,
          amountInWei,
        ],
      });

      return executeCTFOperation("mergePositions", encodedData);
    },
    [executeCTFOperation]
  );

  /**
   * Redeem winning positions after market resolution
   */
  const redeemPositions = useCallback(
    async (
      conditionId: string,
      _proxyAddress: string
    ): Promise<OperationResult> => {
      const { encodeFunctionData } = await import("viem");

      const encodedData = encodeFunctionData({
        abi: CTF_ABI,
        functionName: "redeemPositions",
        args: [
          CONTRACTS.USDC_E as `0x${string}`,
          PARENT_COLLECTION_ID,
          conditionId as `0x${string}`,
          BINARY_PARTITION,
        ],
      });

      return executeCTFOperation("redeemPositions", encodedData);
    },
    [executeCTFOperation]
  );

  /**
   * Reset the operation state
   */
  const reset = useCallback(() => {
    setState({ isLoading: false, error: null, txHash: null });
  }, []);

  return {
    ...state,
    isConnected,
    splitPosition,
    mergePositions,
    redeemPositions,
    getOutcomeBalances,
    reset,
  };
}
