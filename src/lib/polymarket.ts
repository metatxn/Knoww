import { BuilderConfig } from "@polymarket/builder-signing-sdk";
import { ClobClient } from "@polymarket/clob-client";
import { SignatureType } from "@polymarket/order-utils";
import { Wallet } from "ethers";

export { SignatureType };

export enum Side {
  BUY = "BUY",
  SELL = "SELL",
}

/**
 * Dummy wallet for initializing ClobClient (lazily initialized)
 *
 * Why we need this:
 * - ClobClient constructor requires a wallet/signer parameter
 * - We use ClobClient for read-only operations (markets, balances)
 * - We use ClobClient to relay pre-signed orders (user signs on frontend)
 * - This dummy wallet is NEVER used for actual signing
 * - It has no funds and never will
 *
 * This is safe because:
 * ✅ Used only for SDK initialization, not for signing
 * ✅ All real signing happens on the frontend with user's wallet
 * ✅ Pre-signed orders already have signatures attached
 * ✅ Backend only adds builder attribution headers
 *
 * Why use a fixed private key instead of Wallet.createRandom():
 * ❌ Wallet.createRandom() uses crypto.getRandomValues() which may have issues
 * ✅ Fixed dummy private key works in global scope and is perfectly safe since it's never used for real transactions
 *
 * This private key is public and meaningless - it's only used to satisfy the SDK's constructor requirements.
 */
let dummyWallet: Wallet | null = null;

function getDummyWallet(): Wallet {
  if (!dummyWallet) {
    // Use a fixed dummy private key (this is safe - it's never used for signing)
    // This is just to satisfy ClobClient's constructor requirements
    const DUMMY_PRIVATE_KEY =
      "0x0000000000000000000000000000000000000000000000000000000000000001";
    dummyWallet = new Wallet(DUMMY_PRIVATE_KEY);
  }
  return dummyWallet;
}

/**
 * Client cache for reusing ClobClient instances
 *
 * In Next.js, this cache lives for the duration of the Node.js process.
 * This provides significant performance benefits by avoiding repeated client initialization.
 *
 * Key: host_chainId (e.g., "https://clob.polymarket.com_137")
 * Value: ClobClient instance
 */
const clientCache = new Map<string, ClobClient>();

/**
 * Get environment variable or throw error if not found
 */
function getEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Environment variable ${key} is not defined`);
  }
  return value;
}

/**
 * Get environment variable (optional)
 */
function getEnvOptional(key: string): string | undefined {
  return process.env[key];
}

/**
 * Initialize Polymarket CLOB Client for Query Operations
 *
 * This function uses caching to reuse client instances across requests,
 * improving performance.
 *
 * Two authentication methods:
 * 1. CLOB API Credentials (optional) - For L2 API authentication
 * 2. Builder Config (required) - For order attribution via remote signing
 *
 * Note: For non-custodial architecture, this client is used for read-only operations
 * like fetching markets, balances, and positions.
 *
 * Orders should be signed on the frontend and submitted via API endpoints.
 *
 * @param userAddress - User's wallet address (for querying their data) - optional, not used in cache key
 * @returns Cached or newly created ClobClient instance
 */
export function initPolymarketClient(_userAddress?: string): ClobClient {
  const host = getEnv("POLYMARKET_HOST");
  const chainId = getEnv("POLYMARKET_CHAIN_ID");

  // Create cache key based on host and chainId
  const cacheKey = `${host}_${chainId}`;

  // Return cached client if available
  const cachedClient = clientCache.get(cacheKey);
  if (cachedClient) {
    return cachedClient;
  }

  // CLOB API Credentials (optional but recommended for production)
  // These are for L2 authentication with Polymarket's CLOB API
  let creds: { key: string; secret: string; passphrase: string } | undefined;

  const apiKey = getEnvOptional("POLY_BUILDER_API_KEY");
  const apiSecret = getEnvOptional("POLY_BUILDER_SECRET");
  const apiPassphrase = getEnvOptional("POLY_BUILDER_PASSPHRASE");

  if (apiKey && apiSecret && apiPassphrase) {
    creds = {
      key: apiKey,
      secret: apiSecret,
      passphrase: apiPassphrase,
    };
  }

  // Builder Config (required for order attribution)
  // This handles signing of builder headers via remote signing server
  const builderConfig = new BuilderConfig({
    remoteBuilderConfig: {
      url: getEnv("POLYMARKET_BUILDER_SIGNING_SERVER_URL"),
      token: getEnv("INTERNAL_AUTH_TOKEN"), // Auth token for signing server
    },
  });

  const clobClient = new ClobClient(
    host,
    Number.parseInt(chainId, 10),
    getDummyWallet(), // Dummy wallet for SDK initialization only
    creds, // CLOB API credentials (optional, undefined if not provided)
    SignatureType.POLY_PROXY,
    process.env.POLYMARKET_FUNDER_ADDRESS || undefined,
    undefined, // marketOrderDelay
    false, // enableAutoMargin
    builderConfig, // Builder config for order attribution
  );

  // Cache the client for reuse
  clientCache.set(cacheKey, clobClient);

  return clobClient;
}

/**
 * Create CLOB Client for Relaying Pre-Signed Orders
 *
 * This is actually just an alias for initPolymarketClient since both use the same
 * client configuration. The client is cached and reused for better performance.
 *
 * This client is used to relay orders that have already been signed by the user on the frontend.
 *
 * @returns Cached or newly created ClobClient instance
 */
export function createRelayClient(): ClobClient {
  // Reuse the same cached client as initPolymarketClient
  return initPolymarketClient();
}

/**
 * Get allowed origins for CORS (used in API routes)
 */
export function getAllowedOrigins(): string[] {
  const origins = process.env.ALLOWED_ORIGINS;
  if (!origins) {
    return ["*"]; // Allow all origins if not specified (not recommended for production)
  }
  return origins.split(",").map((origin) => origin.trim());
}
