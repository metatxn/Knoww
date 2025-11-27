"use client";

import { useCallback, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { useClobCredentials } from "./use-clob-credentials";

/**
 * Order side enum
 */
export enum Side {
  BUY = "BUY",
  SELL = "SELL",
}

/**
 * Order type enum
 */
export enum OrderType {
  GTC = "GTC", // Good Till Cancelled
  FOK = "FOK", // Fill Or Kill
  GTD = "GTD", // Good Till Date
}

/**
 * Order parameters for creating a new order
 */
export interface CreateOrderParams {
  tokenId: string;
  price: number; // 0.01 to 0.99
  size: number; // Number of shares
  side: Side;
  orderType?: OrderType;
  expiration?: number; // Unix timestamp for GTD orders
}

/**
 * Hook for interacting with Polymarket CLOB using the official SDK
 *
 * This hook provides a way to create and post orders using the ClobClient
 * directly from the frontend, with the user's wallet for signing and
 * builder attribution via the remote signing server.
 *
 * Flow:
 * 1. User connects wallet (wagmi)
 * 2. User derives API credentials (L1 signature → L2 creds)
 * 3. ClobClient is initialized with user's wallet + creds + builder config
 * 4. Orders are created and posted through the SDK
 */
export function useClobClient() {
  const { address, isConnected } = useAccount();
  const { credentials, hasCredentials, deriveCredentials } =
    useClobCredentials();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Environment config
  const clobHost =
    process.env.NEXT_PUBLIC_POLYMARKET_HOST || "https://clob.polymarket.com";
  const chainId = Number(process.env.NEXT_PUBLIC_POLYMARKET_CHAIN_ID || "137");
  const builderSigningServerUrl =
    process.env.NEXT_PUBLIC_BUILDER_SIGNING_SERVER_URL;

  /**
   * Check if the client can be used
   */
  const canTrade = useMemo(() => {
    return (
      isConnected &&
      hasCredentials &&
      typeof window !== "undefined" &&
      !!window.ethereum
    );
  }, [isConnected, hasCredentials]);

  /**
   * Create and post an order
   *
   * This function:
   * 1. Dynamically imports the ClobClient (to avoid SSR issues)
   * 2. Initializes the client with user's wallet and credentials
   * 3. Creates and signs the order
   * 4. Posts the order with builder attribution
   */
  const createOrder = useCallback(
    async (params: CreateOrderParams) => {
      if (!address) {
        throw new Error("Wallet not connected");
      }

      if (!window.ethereum) {
        throw new Error("No wallet provider found. Please install MetaMask.");
      }

      if (!credentials) {
        throw new Error(
          "API credentials not available. Please derive credentials first."
        );
      }

      if (!builderSigningServerUrl) {
        throw new Error("Builder signing server URL not configured");
      }

      setIsLoading(true);
      setError(null);

      try {
        // Dynamically import to avoid SSR issues
        const { ClobClient } = await import("@polymarket/clob-client");
        const { BuilderConfig } = await import(
          "@polymarket/builder-signing-sdk"
        );
        const ethersModule = await import("ethers");

        // Get signer from MetaMask/wallet provider using window.ethereum
        const provider = new ethersModule.providers.Web3Provider(
          // biome-ignore lint/suspicious/noExplicitAny: window.ethereum is the wallet provider
          window.ethereum as any
        );
        // Request account access if needed
        await provider.send("eth_requestAccounts", []);
        const signer = provider.getSigner();

        // Configure builder attribution via remote signing server
        // Note: token is optional - if not set, requests go without auth
        const authToken = process.env.INTERNAL_AUTH_TOKEN;
        const builderConfig = new BuilderConfig({
          remoteBuilderConfig: {
            url: builderSigningServerUrl,
            ...(authToken ? { token: authToken } : {}),
          },
        });

        // User's L2 API credentials
        const creds = {
          key: credentials.apiKey,
          secret: credentials.apiSecret,
          passphrase: credentials.apiPassphrase,
        };

        // SignatureType enum values:
        // 0 = EOA (Externally Owned Account - regular MetaMask)
        // 1 = POLY_PROXY (Polymarket Proxy Wallet)
        // 2 = POLY_GNOSIS_SAFE (Gnosis Safe)
        const SIGNATURE_TYPE_EOA = 0;

        // Initialize ClobClient with user's wallet, credentials, and builder config
        const client = new ClobClient(
          clobHost,
          chainId,
          signer,
          creds,
          SIGNATURE_TYPE_EOA, // Use EOA for regular wallets (MetaMask, etc.)
          undefined, // funderAddress
          undefined, // marketOrderDelay
          false, // enableAutoMargin
          builderConfig
        );

        // Create the order (SDK handles signing)
        // Note: expiration should be 0 for GTC/FOK orders, only set for GTD
        const order = await client.createOrder({
          tokenID: params.tokenId,
          price: params.price,
          size: params.size,
          side: params.side,
          expiration:
            params.orderType === OrderType.GTD ? params.expiration : 0,
        });

        // Post the order (SDK handles builder headers)
        const response = await client.postOrder(order, params.orderType);

        return {
          success: true,
          order: response,
        };
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error("Failed to create order");
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [address, credentials, clobHost, chainId, builderSigningServerUrl]
  );

  /**
   * Get the order book for a token
   * This is a read-only operation that calls the CLOB API directly
   */
  const getOrderBook = useCallback(
    async (tokenId: string) => {
      try {
        // Call CLOB API directly for read-only operations
        const response = await fetch(`${clobHost}/book?token_id=${tokenId}`);

        if (!response.ok) {
          throw new Error(`Failed to fetch order book: ${response.statusText}`);
        }

        return await response.json();
      } catch (err) {
        console.error("Failed to get order book:", err);
        throw err;
      }
    },
    [clobHost]
  );

  /**
   * Get open orders for the connected user
   * Requires credentials
   */
  const getOpenOrders = useCallback(async () => {
    if (!address || !credentials) {
      throw new Error("Wallet not connected or credentials not available");
    }

    if (!window.ethereum) {
      throw new Error("No wallet provider found. Please install MetaMask.");
    }

    try {
      const { ClobClient } = await import("@polymarket/clob-client");
      const ethersModule = await import("ethers");

      const provider = new ethersModule.providers.Web3Provider(
        // biome-ignore lint/suspicious/noExplicitAny: window.ethereum is the wallet provider
        window.ethereum as any
      );
      await provider.send("eth_requestAccounts", []);
      const signer = provider.getSigner();

      const SIGNATURE_TYPE_EOA = 0;
      const creds = {
        key: credentials.apiKey,
        secret: credentials.apiSecret,
        passphrase: credentials.apiPassphrase,
      };

      const client = new ClobClient(
        clobHost,
        chainId,
        signer,
        creds,
        SIGNATURE_TYPE_EOA
      );

      const orders = await client.getOpenOrders();
      return orders || [];
    } catch (err) {
      console.error("Failed to get open orders:", err);
      throw err;
    }
  }, [address, credentials, clobHost, chainId]);

  /**
   * Get balance and allowance for the connected user
   * Returns USDC balance and current allowance for trading
   *
   * @param assetType - "COLLATERAL" for USDC, "CONDITIONAL" for outcome tokens
   * @param tokenId - Optional token ID for conditional tokens
   */
  const getBalanceAllowance = useCallback(
    async (
      assetType: "COLLATERAL" | "CONDITIONAL" = "COLLATERAL",
      tokenId?: string
    ) => {
      if (!address || !credentials) {
        throw new Error("Wallet not connected or credentials not available");
      }

      if (!window.ethereum) {
        throw new Error("No wallet provider found. Please install MetaMask.");
      }

      try {
        const { ClobClient, AssetType } = await import(
          "@polymarket/clob-client"
        );
        const ethersModule = await import("ethers");

        const provider = new ethersModule.providers.Web3Provider(
          // biome-ignore lint/suspicious/noExplicitAny: window.ethereum is the wallet provider
          window.ethereum as any
        );
        await provider.send("eth_requestAccounts", []);
        const signer = provider.getSigner();

        const SIGNATURE_TYPE_EOA = 0;
        const creds = {
          key: credentials.apiKey,
          secret: credentials.apiSecret,
          passphrase: credentials.apiPassphrase,
        };

        const client = new ClobClient(
          clobHost,
          chainId,
          signer,
          creds,
          SIGNATURE_TYPE_EOA
        );

        // Get balance and allowance
        const params = {
          asset_type:
            assetType === "COLLATERAL"
              ? AssetType.COLLATERAL
              : AssetType.CONDITIONAL,
          ...(tokenId && { token_id: tokenId }),
        };
        const result = await client.getBalanceAllowance(params);

        return {
          balance: result?.balance || "0",
          allowance: result?.allowance || "0",
        };
      } catch (err) {
        console.error("Failed to get balance/allowance:", err);
        throw err;
      }
    },
    [address, credentials, clobHost, chainId]
  );

  /**
   * Update (set) the allowance for trading
   * This approves the Polymarket CTF Exchange to spend your USDC
   * Sends an actual on-chain transaction that requires MetaMask confirmation
   */
  const updateAllowance = useCallback(async () => {
    if (!address) {
      throw new Error("Wallet not connected");
    }

    if (!window.ethereum) {
      throw new Error("No wallet provider found. Please install MetaMask.");
    }

    setIsLoading(true);
    setError(null);

    try {
      const { createWalletClient, custom, maxUint256 } = await import("viem");
      const { polygon } = await import("viem/chains");

      // USDC contract address on Polygon
      const USDC_ADDRESS =
        "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as const;

      // Polymarket CTF Exchange contract on Polygon mainnet
      const CTF_EXCHANGE_ADDRESS =
        "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E" as const;

      // ERC20 ABI for approve function
      const ERC20_ABI = [
        {
          inputs: [
            { name: "spender", type: "address" },
            { name: "amount", type: "uint256" },
          ],
          name: "approve",
          outputs: [{ name: "", type: "bool" }],
          stateMutability: "nonpayable",
          type: "function",
        },
      ] as const;

      // Create wallet client for sending transactions
      const walletClient = createWalletClient({
        chain: polygon,
        // biome-ignore lint/suspicious/noExplicitAny: window.ethereum is the EIP-1193 provider
        transport: custom(window.ethereum as any),
        account: address,
      });

      // Request account access
      await walletClient.requestAddresses();

      // Send the approve transaction (this will open MetaMask)
      const hash = await walletClient.writeContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [CTF_EXCHANGE_ADDRESS, maxUint256],
      });

      // Wait for transaction confirmation
      const { createPublicClient, http } = await import("viem");
      const publicClient = createPublicClient({
        chain: polygon,
        transport: http(),
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status === "success") {
        return {
          success: true,
          hash,
        };
      } else {
        throw new Error("Transaction failed");
      }
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error("Failed to approve USDC");
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  /**
   * Cancel an order
   */
  const cancelOrder = useCallback(
    async (orderId: string) => {
      if (!address || !credentials) {
        throw new Error("Wallet not connected or credentials not available");
      }

      if (!window.ethereum) {
        throw new Error("No wallet provider found. Please install MetaMask.");
      }

      setIsLoading(true);
      setError(null);

      try {
        const { ClobClient } = await import("@polymarket/clob-client");
        const ethersModule = await import("ethers");

        // Get signer from MetaMask/wallet provider
        const provider = new ethersModule.providers.Web3Provider(
          // biome-ignore lint/suspicious/noExplicitAny: window.ethereum is the wallet provider
          window.ethereum as any
        );
        await provider.send("eth_requestAccounts", []);
        const signer = provider.getSigner();

        const SIGNATURE_TYPE_EOA = 0;
        const creds = {
          key: credentials.apiKey,
          secret: credentials.apiSecret,
          passphrase: credentials.apiPassphrase,
        };

        const client = new ClobClient(
          clobHost,
          chainId,
          signer,
          creds,
          SIGNATURE_TYPE_EOA
        );

        const response = await client.cancelOrder({ orderID: orderId });

        return {
          success: true,
          response,
        };
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error("Failed to cancel order");
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [address, credentials, clobHost, chainId]
  );

  /**
   * Get USDC balance directly from the Polygon chain using viem
   * This fetches the actual on-chain balance using the USDC contract
   *
   * USDC on Polygon: 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359
   * Note: USDC has 6 decimals
   */
  const getUsdcBalance = useCallback(async () => {
    if (!address) {
      throw new Error("Wallet not connected");
    }

    try {
      const { createPublicClient, http, formatUnits } = await import("viem");
      const { polygon } = await import("viem/chains");

      // USDC contract address on Polygon
      const USDC_ADDRESS =
        "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as const;
      const USDC_DECIMALS = 6;

      // ERC20 ABI for balanceOf function
      const ERC20_ABI = [
        {
          inputs: [{ name: "owner", type: "address" }],
          name: "balanceOf",
          outputs: [{ name: "", type: "uint256" }],
          stateMutability: "view",
          type: "function",
        },
      ] as const;

      // Create a public client for Polygon
      const client = createPublicClient({
        chain: polygon,
        transport: http(),
      });

      // Get balance
      const balance = await client.readContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [address],
      });

      // Convert to human-readable format
      const balanceFormatted = Number(formatUnits(balance, USDC_DECIMALS));

      return {
        balance: balanceFormatted,
        balanceRaw: balance.toString(),
        decimals: USDC_DECIMALS,
      };
    } catch (err) {
      console.error("Failed to get USDC balance:", err);
      throw err;
    }
  }, [address]);

  /**
   * Get USDC allowance directly from the Polygon chain using viem
   * This fetches the actual on-chain allowance for the CTF Exchange
   */
  const getUsdcAllowance = useCallback(async () => {
    if (!address) {
      throw new Error("Wallet not connected");
    }

    try {
      const { createPublicClient, http, formatUnits } = await import("viem");
      const { polygon } = await import("viem/chains");

      // USDC contract address on Polygon
      const USDC_ADDRESS =
        "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as const;
      const USDC_DECIMALS = 6;

      // Polymarket CTF Exchange contract on Polygon mainnet
      const CTF_EXCHANGE_ADDRESS =
        "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E" as const;

      // ERC20 ABI for allowance function
      const ERC20_ABI = [
        {
          inputs: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
          ],
          name: "allowance",
          outputs: [{ name: "", type: "uint256" }],
          stateMutability: "view",
          type: "function",
        },
      ] as const;

      // Create a public client for Polygon
      const client = createPublicClient({
        chain: polygon,
        transport: http(),
      });

      // Get allowance
      const allowance = await client.readContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [address, CTF_EXCHANGE_ADDRESS],
      });

      // Convert to human-readable format
      const allowanceFormatted = Number(formatUnits(allowance, USDC_DECIMALS));

      return {
        allowance: allowanceFormatted,
        allowanceRaw: allowance.toString(),
        decimals: USDC_DECIMALS,
      };
    } catch (err) {
      console.error("Failed to get USDC allowance:", err);
      throw err;
    }
  }, [address]);

  return {
    // State
    isConnected,
    canTrade,
    hasCredentials,
    isLoading,
    error,

    // Actions
    createOrder,
    cancelOrder,
    getOrderBook,
    getOpenOrders,
    deriveCredentials,
    getBalanceAllowance,
    updateAllowance,
    getUsdcBalance,
    getUsdcAllowance,
  };
}
