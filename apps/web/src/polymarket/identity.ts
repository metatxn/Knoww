import {
  type WalletAccountType,
  type WalletIdentity,
  walletIdentitySchema,
} from "@knoww/services/core";
import type { TradingWalletMode } from "@knoww/shared-types/polymarket";

/**
 * The web app's Polymarket trading identity: the connected EOA signs, and in
 * the Deposit Wallet (default) and legacy Safe modes a contract wallet holds
 * the funds and positions. This is the only place the web app turns its
 * wallet-mode setting into the canonical identity the trading adapter takes.
 */
export interface PolymarketIdentityInput {
  /** The connected EOA, `undefined` while no wallet is connected. */
  address: string | undefined;
  walletMode: TradingWalletMode;
  /** The Deposit Wallet or Safe address once derived, absent for EOA mode. */
  proxyAddress?: string | null;
}

const ACCOUNT_TYPE_BY_MODE: Record<TradingWalletMode, WalletAccountType> = {
  eoa: "eoa",
  safe: "safe",
  deposit: "deposit_wallet",
};

/**
 * Builds the identity, or `null` while it is not ready: no connected
 * address, or a proxy-backed mode whose contract wallet is still unknown.
 */
export function toPolymarketWalletIdentity(
  input: PolymarketIdentityInput
): WalletIdentity | null {
  if (!input.address) return null;
  const accountType = ACCOUNT_TYPE_BY_MODE[input.walletMode];
  if (accountType === "eoa") {
    return walletIdentitySchema.parse({
      kind: "wallet",
      platform: "polymarket",
      address: input.address,
      accountType,
    });
  }
  if (!input.proxyAddress) return null;
  return walletIdentitySchema.parse({
    kind: "wallet",
    platform: "polymarket",
    address: input.address,
    accountType,
    tradingAddress: input.proxyAddress,
  });
}
