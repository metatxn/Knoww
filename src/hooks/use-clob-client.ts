"use client";

import { useCallback, useMemo, useState } from "react";
import { useConnection } from "wagmi";
import { useClobCredentials } from "./use-clob-credentials";
import { useProxyWallet } from "./use-proxy-wallet";

/**
 * Order side enum
 */
export enum Side {
  BUY = "BUY",
  SELL = "SELL",
}

/**
 * Order type enum
 *
 * @see https://docs.polymarket.com/developers/CLOB/orders/create-order
 */
export enum OrderType {
  GTC = "GTC", // Good Till Cancelled - Limit order active until fulfilled or cancelled
  GTD = "GTD", // Good Till Date - Limit order active until specified date
  FOK = "FOK", // Fill Or Kill - Market order that must execute entirely or cancel
  FAK = "FAK", // Fill And Kill - Market order that fills as much as possible, cancels rest
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
 *
 * IMPORTANT: Orders are placed from the user's PROXY WALLET (Gnosis Safe),
 * not their EOA. The proxy wallet holds the USDC and has the allowance set.
 */
export function useClobClient() {
  const { address, isConnected } = useConnection();
  const { credentials, hasCredentials, deriveCredentials } =
    useClobCredentials();
  const { proxyAddress, isDeployed: hasProxyWallet } = useProxyWallet();

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
   * Requires: connected wallet, credentials, proxy wallet deployed
   */
  const canTrade = useMemo(() => {
    return (
      isConnected &&
      hasCredentials &&
      hasProxyWallet &&
      !!proxyAddress &&
      typeof window !== "undefined" &&
      !!window.ethereum
    );
  }, [isConnected, hasCredentials, hasProxyWallet, proxyAddress]);

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
          "API credentials not available. Please derive credentials first.",
        );
      }

      if (!builderSigningServerUrl) {
        throw new Error("Builder signing server URL not configured");
      }

      if (!proxyAddress || !hasProxyWallet) {
        throw new Error(
          "Proxy wallet not deployed. Please complete trading setup first.",
        );
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
          window.ethereum as any,
        );
        // Request account access if needed
        await provider.send("eth_requestAccounts", []);
        const signer = provider.getSigner();

        // Configure builder attribution via remote signing server
        // Note: token is optional - if not set, requests go without auth
        // Must use NEXT_PUBLIC_ prefix for client-side env vars in Next.js
        const authToken = process.env.NEXT_PUBLIC_INTERNAL_AUTH_TOKEN;
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
        //
        // IMPORTANT: We use POLY_GNOSIS_SAFE (2) because users trade via their
        // proxy wallet (Gnosis Safe), NOT their EOA. The proxy wallet holds
        // the USDC and has the allowance set for the CTF Exchange.
        const SIGNATURE_TYPE_POLY_GNOSIS_SAFE = 2;

        // Initialize ClobClient with user's wallet, credentials, and builder config
        // The funderAddress is the proxy wallet address where funds are held
        const client = new ClobClient(
          clobHost,
          chainId,
          signer,
          creds,
          SIGNATURE_TYPE_POLY_GNOSIS_SAFE, // Use Gnosis Safe for proxy wallet trading
          proxyAddress, // funderAddress - the proxy wallet that holds the funds
          undefined, // marketOrderDelay
          false, // enableAutoMargin
          builderConfig,
        );

        // Fetch the fee rate for this token
        // See: https://docs.polymarket.com/developers/CLOB/clients/methods-public#getfeeratebps
        const feeRateBps = await client.getFeeRateBps(params.tokenId);

        // Create the order (SDK handles signing)
        // Note: expiration should be 0 for GTC/FOK orders, only set for GTD
        const order = await client.createOrder({
          tokenID: params.tokenId,
          price: params.price,
          size: params.size,
          side: params.side,
          feeRateBps, // Pass the fetched fee rate
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
    [
      address,
      credentials,
      clobHost,
      chainId,
      builderSigningServerUrl,
      proxyAddress,
      hasProxyWallet,
    ],
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
    [clobHost],
  );

  /**
   * Get open orders for the connected user
   * Requires credentials and proxy wallet
   *
   * IMPORTANT: Uses POLY_GNOSIS_SAFE signature type since orders are placed
   * from the proxy wallet, not the EOA.
   *
   * Returns empty array if prerequisites aren't met (graceful degradation)
   */
  const getOpenOrders = useCallback(async () => {
    // Gracefully return empty if prerequisites aren't met
    if (!address || !credentials) {
      console.debug(
        "[getOpenOrders] Skipping: wallet not connected or no credentials",
      );
      return [];
    }

    if (typeof window === "undefined" || !window.ethereum) {
      console.debug("[getOpenOrders] Skipping: no wallet provider");
      return [];
    }

    if (!proxyAddress || !hasProxyWallet) {
      console.debug("[getOpenOrders] Skipping: proxy wallet not deployed");
      return [];
    }

    try {
      const { ClobClient } = await import("@polymarket/clob-client");
      const ethersModule = await import("ethers");

      const provider = new ethersModule.providers.Web3Provider(
        // biome-ignore lint/suspicious/noExplicitAny: window.ethereum is the wallet provider
        window.ethereum as any,
      );
      await provider.send("eth_requestAccounts", []);
      const signer = provider.getSigner();

      // SignatureType 2 = POLY_GNOSIS_SAFE (orders are placed from proxy wallet)
      const SIGNATURE_TYPE_POLY_GNOSIS_SAFE = 2;
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
        SIGNATURE_TYPE_POLY_GNOSIS_SAFE,
        proxyAddress, // funderAddress - the proxy wallet that holds the funds
      );

      const orders = await client.getOpenOrders();
      return orders || [];
    } catch (err) {
      console.error("Failed to get open orders:", err);
      // Return empty array instead of throwing for graceful degradation
      return [];
    }
  }, [address, credentials, clobHost, chainId, proxyAddress, hasProxyWallet]);

  /**
   * Get balance and allowance for the connected user
   * Returns USDC balance and current allowance for trading
   *
   * IMPORTANT: Uses POLY_GNOSIS_SAFE signature type since trading happens
   * from the proxy wallet, not the EOA.
   *
   * Returns default values if prerequisites aren't met (graceful degradation)
   *
   * @param assetType - "COLLATERAL" for USDC, "CONDITIONAL" for outcome tokens
   * @param tokenId - Optional token ID for conditional tokens
   */
  const getBalanceAllowance = useCallback(
    async (
      assetType: "COLLATERAL" | "CONDITIONAL" = "COLLATERAL",
      tokenId?: string,
    ) => {
      // Gracefully return defaults if prerequisites aren't met
      if (!address || !credentials) {
        console.debug(
          "[getBalanceAllowance] Skipping: wallet not connected or no credentials",
        );
        return { balance: "0", allowance: "0" };
      }

      if (typeof window === "undefined" || !window.ethereum) {
        console.debug("[getBalanceAllowance] Skipping: no wallet provider");
        return { balance: "0", allowance: "0" };
      }

      if (!proxyAddress || !hasProxyWallet) {
        console.debug(
          "[getBalanceAllowance] Skipping: proxy wallet not deployed",
        );
        return { balance: "0", allowance: "0" };
      }

      try {
        const { ClobClient, AssetType } = await import(
          "@polymarket/clob-client"
        );
        const ethersModule = await import("ethers");

        const provider = new ethersModule.providers.Web3Provider(
          // biome-ignore lint/suspicious/noExplicitAny: window.ethereum is the wallet provider
          window.ethereum as any,
        );
        await provider.send("eth_requestAccounts", []);
        const signer = provider.getSigner();

        // SignatureType 2 = POLY_GNOSIS_SAFE (trading happens from proxy wallet)
        const SIGNATURE_TYPE_POLY_GNOSIS_SAFE = 2;
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
          SIGNATURE_TYPE_POLY_GNOSIS_SAFE,
          proxyAddress, // funderAddress - the proxy wallet that holds the funds
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
    [address, credentials, clobHost, chainId, proxyAddress, hasProxyWallet],
  );

  /**
   * Update (set) the allowance for trading
   * This approves the Polymarket CTF Exchange to spend your USDC.e
   * Sends an actual on-chain transaction that requires MetaMask confirmation
   *
   * IMPORTANT: Polymarket uses USDC.e (bridged USDC), NOT native USDC!
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

      // USDC.e (bridged USDC) contract address on Polygon - used by Polymarket
      const USDC_ADDRESS =
        "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" as const;

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
   *
   * IMPORTANT: Uses POLY_GNOSIS_SAFE signature type since orders are placed
   * from the proxy wallet, not the EOA.
   */
  const cancelOrder = useCallback(
    async (orderId: string) => {
      if (!address || !credentials) {
        throw new Error("Wallet not connected or credentials not available");
      }

      if (!window.ethereum) {
        throw new Error("No wallet provider found. Please install MetaMask.");
      }

      if (!proxyAddress || !hasProxyWallet) {
        throw new Error(
          "Proxy wallet not deployed. Please complete trading setup first.",
        );
      }

      setIsLoading(true);
      setError(null);

      try {
        const { ClobClient } = await import("@polymarket/clob-client");
        const ethersModule = await import("ethers");

        // Get signer from MetaMask/wallet provider
        const provider = new ethersModule.providers.Web3Provider(
          // biome-ignore lint/suspicious/noExplicitAny: window.ethereum is the wallet provider
          window.ethereum as any,
        );
        await provider.send("eth_requestAccounts", []);
        const signer = provider.getSigner();

        // SignatureType 2 = POLY_GNOSIS_SAFE (orders are placed from proxy wallet)
        const SIGNATURE_TYPE_POLY_GNOSIS_SAFE = 2;
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
          SIGNATURE_TYPE_POLY_GNOSIS_SAFE,
          proxyAddress, // funderAddress - the proxy wallet that holds the funds
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
    [address, credentials, clobHost, chainId, proxyAddress, hasProxyWallet],
  );

  /**
   * Get USDC.e balance directly from the Polygon chain using viem
   * This fetches the actual on-chain balance using the USDC.e contract
   *
   * IMPORTANT: Polymarket uses USDC.e (bridged USDC), NOT native USDC!
   * USDC.e on Polygon: 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174
   * Native USDC on Polygon: 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359 (NOT used by Polymarket)
   * Note: USDC.e has 6 decimals
   *
   * @param walletAddress - Optional address to check balance for (defaults to EOA, but should be proxy wallet for trading)
   */
  const getUsdcBalance = useCallback(
    async (walletAddress?: string) => {
      const targetAddress = walletAddress || address;
      if (!targetAddress) {
        throw new Error("Wallet not connected");
      }

      try {
        const { createPublicClient, http, formatUnits } = await import("viem");
        const { polygon } = await import("viem/chains");

        // USDC.e (bridged USDC) contract address on Polygon - used by Polymarket
        const USDC_ADDRESS =
          "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" as const;
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

        // Get balance for the target address (proxy wallet or EOA)
        const balance = await client.readContract({
          address: USDC_ADDRESS,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [targetAddress as `0x${string}`],
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
    },
    [address],
  );

  /**
   * Get the fee rate in basis points for a specific token
   * This should be called before creating orders to ensure accurate fee calculation
   *
   * @see https://docs.polymarket.com/developers/CLOB/clients/methods-public#getfeeratebps
   */
  const getFeeRateBps = useCallback(
    async (tokenId: string): Promise<number> => {
      try {
        const { ClobClient } = await import("@polymarket/clob-client");

        // Public client (no signer needed for read-only operations)
        const client = new ClobClient(clobHost, chainId);

        const feeRate = await client.getFeeRateBps(tokenId);
        return feeRate;
      } catch (err) {
        console.error("Failed to get fee rate:", err);
        throw err;
      }
    },
    [clobHost, chainId],
  );

  /**
   * Get USDC.e allowance directly from the Polygon chain using viem
   * This fetches the actual on-chain allowance for the CTF Exchange
   *
   * IMPORTANT: Polymarket uses USDC.e (bridged USDC), NOT native USDC!
   *
   * @param walletAddress - Optional address to check allowance for (defaults to EOA, but should be proxy wallet for trading)
   */
  const getUsdcAllowance = useCallback(
    async (walletAddress?: string) => {
      const targetAddress = walletAddress || address;
      if (!targetAddress) {
        throw new Error("Wallet not connected");
      }

      try {
        const { createPublicClient, http, formatUnits } = await import("viem");
        const { polygon } = await import("viem/chains");

        // USDC.e (bridged USDC) contract address on Polygon - used by Polymarket
        const USDC_ADDRESS =
          "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" as const;
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

        // Get allowance for the target address (proxy wallet or EOA)
        const allowance = await client.readContract({
          address: USDC_ADDRESS,
          abi: ERC20_ABI,
          functionName: "allowance",
          args: [targetAddress as `0x${string}`, CTF_EXCHANGE_ADDRESS],
        });

        // Convert to human-readable format
        const allowanceFormatted = Number(
          formatUnits(allowance, USDC_DECIMALS),
        );

        return {
          allowance: allowanceFormatted,
          allowanceRaw: allowance.toString(),
          decimals: USDC_DECIMALS,
        };
      } catch (err) {
        console.error("Failed to get USDC allowance:", err);
        throw err;
      }
    },
    [address],
  );

  return {
    // State
    isConnected,
    canTrade,
    hasCredentials,
    hasProxyWallet,
    proxyAddress,
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
    getFeeRateBps,
  };
}
