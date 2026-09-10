"use client";

import type { PlatformId } from "@knoww/services/core";
import { createContext, type ReactNode, useContext } from "react";
import {
  type FeatureFlags,
  NO_FEATURE_FLAGS,
  type PlatformFlags,
} from "@/lib/feature-flags";

const FeatureFlagsContext = createContext<FeatureFlags>(NO_FEATURE_FLAGS);

/** Delivers the server-evaluated flags to the client tree. */
export function FeatureFlagsProvider({
  flags,
  children,
}: {
  flags: FeatureFlags;
  children: ReactNode;
}) {
  return (
    <FeatureFlagsContext.Provider value={flags}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

export function useFeatureFlags(): FeatureFlags {
  return useContext(FeatureFlagsContext);
}

/** The flags for one platform, `undefined` when it is not enabled. */
export function usePlatformFlags(
  platform: PlatformId
): PlatformFlags | undefined {
  return useFeatureFlags().platforms[platform];
}

export interface TradingCapability {
  regionTrading: PlatformFlags["regionTrading"];
  canOpenPositions: boolean;
  canClosePositions: boolean;
}

/** What the visitor may do on a platform's order form. Disabled platforms allow nothing. */
export function useTradingCapability(platform: PlatformId): TradingCapability {
  const flags = usePlatformFlags(platform);
  return {
    regionTrading: flags?.regionTrading ?? "unknown",
    canOpenPositions: flags?.canOpenPositions ?? false,
    canClosePositions: flags?.canClosePositions ?? false,
  };
}
