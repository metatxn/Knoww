/**
 * Polymarket Relayer Client Hook
 *
 * Uses Polymarket's relayer infrastructure for gasless transactions:
 * - Deploy Safe wallets for users
 * - Set token approvals (USDC for CTF)
 * - Execute CTF operations (split, merge, redeem)
 *
 * Reference: https://docs.polymarket.com/developers/builders/relayer-client
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { useConnection, useWalletClient } from "wagmi";

// Contract addresses on Polygon Mainnet
const CONTRACTS = {
  USDC: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
  CTF: "0x4d97dcd97ec945f40cf65f87097ace5ea0476045",
  CTF_EXCHANGE: "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E",
  NEG_RISK_CTF_EXCHANGE: "0xC5d563A36AE78145C45a50134d48A1215220f80a",
} as const;

// Polymarket Safe Factory address on Polygon mainnet
// This is Polymarket's custom factory, not the standard Gnosis Safe factory
const SAFE_FACTORY = "0xaacFeEa03eb1561C4e67d661e40682Bd20E3541b";

// Init code hash used by Polymarket's factory
// This is from @polymarket/builder-relayer-client constants
const SAFE_INIT_CODE_HASH =
  "0x2bce2127ff07fb632d16c8347c4ebf501f4841168bed00d9e6ef715ddb6fcecf";

const POLYMARKET_RELAYER_URL = "https://relayer-v2.polymarket.com/";
const CHAIN_ID = 137; // Polygon mainnet

// Transaction states from the relayer
type TransactionState =
  | "STATE_NEW"
  | "STATE_EXECUTED"
  | "STATE_MINED"
  | "STATE_CONFIRMED"
  | "STATE_FAILED"
  | "STATE_INVALID";

interface RelayerClientState {
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  proxyAddress: string | null;
  hasDeployedSafe: boolean;
}

export function useRelayerClient() {
  const { address, isConnected } = useConnection();
  const { data: walletClient } = useWalletClient();

  const [state, setState] = useState<RelayerClientState>({
    isInitialized: false,
    isLoading: false,
    error: null,
    proxyAddress: null,
    hasDeployedSafe: false,
  });

  // Get builder signing server URL
  const builderSigningServerUrl =
    process.env.NEXT_PUBLIC_BUILDER_SIGNING_SERVER_URL;

  /**
   * Initialize the RelayClient with the user's wallet
   * Uses viem WalletClient directly (supported by @polymarket/builder-relayer-client)
   */
  const getClient = useCallback(async () => {
    if (!walletClient || !address) {
      throw new Error("Wallet not connected");
    }

    if (!builderSigningServerUrl) {
      throw new Error("Builder signing server URL not configured");
    }

    console.log("[RelayerClient] Initializing with:", {
      relayerUrl: POLYMARKET_RELAYER_URL,
      chainId: CHAIN_ID,
      builderServerUrl: builderSigningServerUrl,
      walletAddress: address,
    });

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

    // Initialize the relay client with viem WalletClient directly
    // The RelayClient accepts WalletClient from viem
    const client = new RelayClient(
      POLYMARKET_RELAYER_URL,
      CHAIN_ID,
      walletClient,
      builderConfig
    );

    return client;
  }, [walletClient, address, builderSigningServerUrl]);

  /**
   * Derive the Safe address using the same formula as Polymarket SDK
   * deriveSafe(address, safeFactory) from @polymarket/builder-relayer-client
   *
   * Uses viem's getCreate2Address with:
   * - from: safeFactory address (SAFE_FACTORY constant)
   * - salt: keccak256(abi.encode(ownerAddress))
   * - bytecodeHash: SAFE_INIT_CODE_HASH
   */
  const deriveSafeAddress = useCallback(async (): Promise<string | null> => {
    if (!address) return null;

    try {
      const { getCreate2Address, keccak256, encodeAbiParameters } =
        await import("viem");

      // Salt = keccak256(abi.encode(address))
      // This matches the SDK's derivation
      const salt = keccak256(
        encodeAbiParameters(
          [{ name: "address", type: "address" }],
          [address as `0x${string}`]
        )
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
  }, [address]);

  /**
   * Deploy a Safe wallet for the user (gasless)
   * Returns the proxy address of the deployed Safe
   * If Safe is already deployed, returns the existing address
   */
  const deploySafe = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const client = await getClient();

      let response;
      try {
        response = await client.deploy();
      } catch (deployErr) {
        // Check if the error is "safe already deployed"
        const errMessage =
          deployErr instanceof Error ? deployErr.message : String(deployErr);

        if (errMessage.toLowerCase().includes("safe already deployed")) {
          // Derive the Safe address
          const derivedAddress = await deriveSafeAddress();

          if (derivedAddress) {
            setState((prev) => ({
              ...prev,
              isLoading: false,
              proxyAddress: derivedAddress,
              hasDeployedSafe: true,
            }));

            return {
              success: true,
              transactionHash: "",
              proxyAddress: derivedAddress,
              alreadyDeployed: true,
            };
          }

          // If we can't derive the address, still mark as success since it's deployed
          setState((prev) => ({
            ...prev,
            isLoading: false,
            hasDeployedSafe: true,
          }));

          return {
            success: true,
            transactionHash: "",
            proxyAddress: "",
            alreadyDeployed: true,
            message: "Safe already deployed - address will be computed",
          };
        }

        // Re-throw other errors
        throw deployErr;
      }

      // Use SDK's built-in wait() method as per documentation
      // https://docs.polymarket.com/developers/builders/relayer-client#deploying-safe-wallets
      console.log(
        "[RelayerClient] Waiting for Safe deployment confirmation..."
      );
      const result = await response.wait();

      if (result) {
        console.log("[RelayerClient] Safe deployed successfully:", {
          transactionHash: result.transactionHash,
          proxyAddress: result.proxyAddress,
          state: result.state,
        });

        setState((prev) => ({
          ...prev,
          isLoading: false,
          proxyAddress: result.proxyAddress,
          hasDeployedSafe: true,
        }));

        return {
          success: true,
          transactionHash: result.transactionHash,
          proxyAddress: result.proxyAddress,
        };
      } else {
        throw new Error("Safe deployment failed or timed out");
      }
    } catch (err) {
      console.error("[RelayerClient] Deploy error:", err);
      const errorMessage =
        err instanceof Error ? err.message : "Failed to deploy Safe";
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
      return { success: false, error: errorMessage };
    }
  }, [getClient, deriveSafeAddress]);

  /**
   * Set USDC approval for the CTF Exchange (gasless)
   * This allows the exchange to spend USDC on behalf of the user's Safe
   */
  const approveUsdcForTrading = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const client = await getClient();
      const { encodeFunctionData, maxUint256 } = await import("viem");

      // First, verify the Safe is deployed
      const expectedSafe = await deriveSafeAddress();
      if (!expectedSafe) {
        throw new Error(
          "Could not derive Safe address. Please ensure your wallet is connected."
        );
      }

      const isDeployed = await client.getDeployed(expectedSafe);
      console.log("[RelayerClient] Safe deployment check:", {
        expectedSafe,
        isDeployed,
      });

      if (!isDeployed) {
        throw new Error(
          "Your trading wallet is not deployed yet. Please complete the 'Create Trading Wallet' step first."
        );
      }

      // ERC20 approve ABI
      const erc20ApproveAbi = [
        {
          name: "approve",
          type: "function",
          inputs: [
            { name: "spender", type: "address" },
            { name: "amount", type: "uint256" },
          ],
          outputs: [{ name: "", type: "bool" }],
        },
      ] as const;

      // Create approval transactions for both exchanges
      // The SDK's execute() method expects Transaction objects with: to, data, value
      // It internally converts these to SafeTransactions with operation: Call
      const approvalTxs = [
        // Approve CTF Exchange
        {
          to: CONTRACTS.USDC,
          data: encodeFunctionData({
            abi: erc20ApproveAbi,
            functionName: "approve",
            args: [CONTRACTS.CTF_EXCHANGE, maxUint256],
          }),
          value: "0",
        },
        // Approve Neg Risk CTF Exchange
        {
          to: CONTRACTS.USDC,
          data: encodeFunctionData({
            abi: erc20ApproveAbi,
            functionName: "approve",
            args: [CONTRACTS.NEG_RISK_CTF_EXCHANGE, maxUint256],
          }),
          value: "0",
        },
        // Approve CTF contract itself (for split/merge operations)
        {
          to: CONTRACTS.USDC,
          data: encodeFunctionData({
            abi: erc20ApproveAbi,
            functionName: "approve",
            args: [CONTRACTS.CTF, maxUint256],
          }),
          value: "0",
        },
      ];

      console.log("[RelayerClient] Submitting USDC approval transactions...");
      console.log("[RelayerClient] Approval targets:", {
        CTF_EXCHANGE: CONTRACTS.CTF_EXCHANGE,
        NEG_RISK_CTF_EXCHANGE: CONTRACTS.NEG_RISK_CTF_EXCHANGE,
        CTF: CONTRACTS.CTF,
      });

      // Execute the approval transactions with retry logic
      // The Polymarket relayer can sometimes return STATE_FAILED intermittently
      const maxRetries = 3;
      let lastError: Error | null = null;
      let response: Awaited<ReturnType<typeof client.execute>> | null = null;

      for (let retry = 0; retry < maxRetries; retry++) {
        try {
          if (retry > 0) {
            console.log(
              `[RelayerClient] Retry attempt ${retry + 1}/${maxRetries}...`
            );
            // Wait before retrying (exponential backoff: 1s, 2s, 4s)
            await new Promise((resolve) =>
              setTimeout(resolve, 1000 * Math.pow(2, retry - 1))
            );
          }

          response = await client.execute(approvalTxs);

          console.log("[RelayerClient] Approval response:", {
            transactionID: response.transactionID,
            state: response.state,
            hash: response.transactionHash,
            retry,
          });

          // Check if the initial response already indicates failure
          if (
            response.state === "STATE_FAILED" ||
            response.state === "STATE_INVALID"
          ) {
            console.warn(
              `[RelayerClient] Approval failed with state: ${response.state}, will retry...`
            );
            lastError = new Error(
              `Approval failed with state: ${response.state}`
            );
            continue; // Try again
          }

          // Success - break out of retry loop
          break;
        } catch (executeErr) {
          console.error(
            `[RelayerClient] Execute error on attempt ${retry + 1}:`,
            executeErr
          );
          lastError =
            executeErr instanceof Error
              ? executeErr
              : new Error(String(executeErr));
          // Continue to next retry
        }
      }

      // If all retries failed, throw the last error
      if (
        !response ||
        response.state === "STATE_FAILED" ||
        response.state === "STATE_INVALID"
      ) {
        throw lastError || new Error("Approval failed after all retries");
      }

      const transactionId = response.transactionID;
      if (!transactionId) {
        throw new Error("No transaction ID returned from execute");
      }

      // Poll for the transaction result - simple polling loop
      const maxAttempts = 15;
      const pollInterval = 2000; // 2 seconds
      const successStates = [
        "STATE_EXECUTED",
        "STATE_MINED",
        "STATE_CONFIRMED",
      ];

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        console.log(
          `[RelayerClient] Polling attempt ${attempt + 1}/${maxAttempts}...`
        );
        const txns = await client.getTransaction(transactionId);

        if (txns && txns.length > 0) {
          const tx = txns[0];
          console.log(`[RelayerClient] Transaction state: ${tx.state}`);

          // Check for failure states
          if (tx.state === "STATE_FAILED" || tx.state === "STATE_INVALID") {
            console.error("[RelayerClient] Transaction failed:", tx);
            throw new Error(
              `Approval failed with state: ${tx.state}. ` +
                `Transaction hash: ${tx.transactionHash || "none"}`
            );
          }

          // Check for success states
          if (successStates.includes(tx.state)) {
            console.log(
              "[RelayerClient] Approval successful:",
              tx.transactionHash
            );
            setState((prev) => ({ ...prev, isLoading: false }));
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

      // If we get here, polling timed out but transaction was submitted
      // Consider it a success since the relayer accepted it
      console.log(
        "[RelayerClient] Approval polling timed out, but transaction was submitted"
      );
      setState((prev) => ({ ...prev, isLoading: false }));
      return {
        success: true,
        transactionHash: response.transactionHash || transactionId,
      };
    } catch (err) {
      console.error("[RelayerClient] Approval error:", err);
      const errorMessage =
        err instanceof Error ? err.message : "Failed to approve USDC";
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
      return { success: false, error: errorMessage };
    }
  }, [getClient, deriveSafeAddress]);

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

        return code !== undefined && code !== "0x";
      } catch (err) {
        console.error("[RelayerClient] Failed to check deployment:", err);
        return false;
      }
    },
    []
  );

  /**
   * Check if user has a deployed Safe wallet
   * Derives the expected address and checks if it has code deployed
   */
  const checkSafeDeployment = useCallback(async () => {
    if (!address) return;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // Derive the expected Safe address
      const derivedAddress = await deriveSafeAddress();

      if (!derivedAddress) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          isInitialized: true,
          hasDeployedSafe: false,
          proxyAddress: null,
        }));
        return;
      }

      // IMPORTANT: Check if the derived address actually has code deployed
      // For new users, this will be FALSE because their Safe doesn't exist yet
      const isDeployed = await checkIsDeployed(derivedAddress);

      console.log(
        "[RelayerClient] Safe check:",
        derivedAddress,
        "deployed:",
        isDeployed,
        isDeployed
          ? "- Safe exists on-chain"
          : "- Safe NOT deployed yet (new user)"
      );

      setState((prev) => ({
        ...prev,
        isLoading: false,
        isInitialized: true,
        // ONLY set proxyAddress if the Safe is actually deployed
        // For new users, we don't want to show a non-existent address
        proxyAddress: isDeployed ? derivedAddress : null,
        hasDeployedSafe: isDeployed,
      }));
    } catch (err) {
      console.error("[RelayerClient] Check deployment error:", err);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        isInitialized: true,
        error: err instanceof Error ? err.message : "Failed to check Safe",
      }));
    }
  }, [address, deriveSafeAddress, checkIsDeployed]);

  /**
   * Full onboarding flow:
   * 1. Deploy Safe wallet (if not exists)
   * 2. Approve USDC for trading
   * 3. Return the proxy address
   */
  const onboardUser = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // Step 1: Deploy Safe
      const deployResult = await deploySafe();
      if (!deployResult.success) {
        return deployResult;
      }

      // Step 2: Approve USDC
      const approveResult = await approveUsdcForTrading();
      if (!approveResult.success) {
        return {
          success: false,
          error: approveResult.error,
          proxyAddress: deployResult.proxyAddress,
        };
      }

      return {
        success: true,
        proxyAddress: deployResult.proxyAddress,
        message: "Onboarding complete! You can now trade on Polymarket.",
      };
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Onboarding failed";
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
      return { success: false, error: errorMessage };
    }
  }, [deploySafe, approveUsdcForTrading]);

  // Check Safe deployment when address changes
  useEffect(() => {
    if (isConnected && address) {
      checkSafeDeployment();
    } else {
      setState({
        isInitialized: false,
        isLoading: false,
        error: null,
        proxyAddress: null,
        hasDeployedSafe: false,
      });
    }
  }, [isConnected, address, checkSafeDeployment]);

  return {
    // State
    ...state,
    isConnected,

    // Actions
    deploySafe,
    approveUsdcForTrading,
    onboardUser,
    checkSafeDeployment,

    // Constants
    contracts: CONTRACTS,
    relayerUrl: POLYMARKET_RELAYER_URL,
    chainId: CHAIN_ID,
  };
}
