import {
  createPlatformRegistry,
  type PlatformRegistry,
  type PlatformRegistryInit,
  type RegistryEnv,
} from "@knoww/services/registry";
import {
  createUnifiedPolymarketCredentialsOnlySigner,
  createUnifiedPolymarketViemSigner,
} from "@knoww/shared-types/polymarket-unified";
import type { Address, WalletClient } from "viem";
import { nextAwareFetch } from "@/lib/platform-registry";
import { getViemWalletClient } from "@/lib/viem-wallet-client";

type PolymarketTradingInit = NonNullable<
  NonNullable<PlatformRegistryInit["polymarket"]>["trading"]
>;

export interface UserTradingRegistryInit {
  /** wagmi's wallet client for the connected account. */
  walletClient: WalletClient;
  /** The connected EOA; the signer is bound to it. */
  address: Address;
  /** L2 CLOB credentials derived for `address`. */
  credentials: NonNullable<PolymarketTradingInit["credentials"]>;
  /** Deployment builder code; omitted when the deployment sets none. */
  builderCode?: string | undefined;
  /** Enablement flags; the registry's own defaults apply when omitted. */
  env?: RegistryEnv | undefined;
}

/**
 * A per-user registry whose Polymarket trading adapter signs with the
 * connected wallet. This is the one place in the web app that binds a
 * platform's trading credentials, so `useTradingAdapter` stays platform
 * agnostic and the boundary lint keeps the platform name out of `hooks/`.
 *
 * Reading the account never prompts the wallet. Chain switching is deferred
 * until the SDK requests a signature or transaction.
 */
export async function createUserTradingRegistry(
  init: UserTradingRegistryInit
): Promise<PlatformRegistry> {
  const signingClient = async () =>
    createUnifiedPolymarketViemSigner(
      await getViemWalletClient(init.walletClient, init.address)
    );
  const signer: NonNullable<PolymarketTradingInit["signer"]> = {
    getAddress: createUnifiedPolymarketCredentialsOnlySigner(init.address)
      .getAddress,
    signTypedData: async (payload) =>
      (await signingClient()).signTypedData(payload),
    signMessage: async (message) =>
      (await signingClient()).signMessage(message),
    sendTransaction: async (request) =>
      (await signingClient()).sendTransaction(request),
  };
  return createPlatformRegistry({
    env: init.env,
    fetchImpl: nextAwareFetch,
    polymarket: {
      trading: {
        signer,
        credentials: init.credentials,
        builderCode: init.builderCode,
      },
    },
  });
}
