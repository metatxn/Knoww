import {
  createPlatformRegistry,
  type PlatformRegistry,
  type PlatformRegistryInit,
  type RegistryEnv,
} from "@knoww/services/registry";
import { createUnifiedPolymarketViemSigner } from "@knoww/shared-types/polymarket-unified";
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
 * The signer goes through the same Polygon wallet client the legacy hook
 * builds, so chain switching and signing prompts are unchanged.
 */
export async function createUserTradingRegistry(
  init: UserTradingRegistryInit
): Promise<PlatformRegistry> {
  const viemClient = await getViemWalletClient(init.walletClient, init.address);
  return createPlatformRegistry({
    env: init.env,
    fetchImpl: nextAwareFetch,
    polymarket: {
      trading: {
        signer: createUnifiedPolymarketViemSigner(viemClient),
        credentials: init.credentials,
        builderCode: init.builderCode,
      },
    },
  });
}
