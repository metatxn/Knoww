"use client";

import type {
  PlatformId,
  TradingAdapter,
  WalletIdentity,
} from "@knoww/services/core";
import type { PlatformRegistry, RegistryEnv } from "@knoww/services/registry";
import { useCallback, useMemo, useRef } from "react";
import type { WalletClient } from "viem";
import { useConnection, useWalletClient } from "wagmi";
import { useFeatureFlags } from "@/context/feature-flags-context";
import { useClobCredentials } from "@/hooks/use-clob-credentials";
import { useTradingIdentity } from "@/hooks/use-trading-identity";
import { createUserTradingRegistry } from "@/polymarket/trading-registry";

export interface TradingAdapterHandle {
  /** The canonical identity on `platform`, `null` until the wallet resolves. */
  identity: WalletIdentity | null;
  /** True when the wallet, its identity and its credentials are all present. */
  isReady: boolean;
  /**
   * The platform's trading adapter bound to the connected wallet. Rejects
   * when the wallet or its credentials are missing, or when the platform
   * has no trading adapter.
   */
  getAdapter(): Promise<TradingAdapter>;
}

interface RegistryCache {
  key: string;
  walletClient: WalletClient;
  registry: Promise<PlatformRegistry>;
}

/**
 * The connected user's trading adapter for one platform. The registry is
 * built once per wallet, credential set and enablement and reused across
 * renders; a failed build is dropped so the next call retries.
 */
export function useTradingAdapter(platform: PlatformId): TradingAdapterHandle {
  const { address } = useConnection();
  const { data: walletClient } = useWalletClient();
  const { credentials } = useClobCredentials();
  const { identity: resolved } = useTradingIdentity();
  const flags = useFeatureFlags();

  const identity = resolved?.platform === platform ? resolved : null;

  const env = useMemo<RegistryEnv | undefined>(() => {
    const enabled = Object.entries(flags.platforms)
      .filter(([, platformFlags]) => platformFlags?.enabled)
      .map(([id]) => id);
    return enabled.length > 0
      ? { KNOWW_ENABLED_PLATFORMS: enabled.join(",") }
      : undefined;
  }, [flags]);

  const builderCode = process.env.NEXT_PUBLIC_POLY_BUILDER_CODE;
  const cache = useRef<RegistryCache | null>(null);

  const getAdapter = useCallback(async (): Promise<TradingAdapter> => {
    if (!address || !walletClient) {
      throw new Error("Wallet not connected. Please reconnect and try again.");
    }
    if (!credentials) {
      throw new Error(
        "Trading credentials are not available. Enable trading and try again."
      );
    }
    const key = [
      address,
      credentials.apiKey,
      builderCode ?? "",
      env?.KNOWW_ENABLED_PLATFORMS ?? "",
    ].join("|");
    let entry = cache.current;
    if (!entry || entry.key !== key || entry.walletClient !== walletClient) {
      const fresh: RegistryCache = {
        key,
        walletClient,
        registry: createUserTradingRegistry({
          walletClient,
          address,
          credentials,
          builderCode,
          env,
        }),
      };
      fresh.registry.catch(() => {
        if (cache.current === fresh) cache.current = null;
      });
      cache.current = fresh;
      entry = fresh;
    }
    const registry = await entry.registry;
    const adapter = registry.getTradingAdapter(platform);
    if (!adapter) {
      throw new Error(`Trading is not available on ${platform}.`);
    }
    return adapter;
  }, [address, walletClient, credentials, builderCode, env, platform]);

  return {
    identity,
    isReady: Boolean(identity && walletClient && credentials),
    getAdapter,
  };
}
