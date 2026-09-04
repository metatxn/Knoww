"use client";

import type { ReactNode } from "react";
import type { State } from "wagmi";
import { MainContent } from "@/components/main-content";
import { ThemedToaster } from "@/components/themed-toaster";
import ContextProvider from "@/context";
import { FeatureFlagsProvider } from "@/context/feature-flags-context";
import type { FeatureFlags } from "@/lib/feature-flags";

export function AppRouteProviders({
  children,
  initialState,
  flags,
}: {
  children: ReactNode;
  initialState: State | undefined;
  flags: FeatureFlags;
}) {
  return (
    <FeatureFlagsProvider flags={flags}>
      <ContextProvider initialState={initialState}>
        <MainContent>{children}</MainContent>
        <ThemedToaster />
      </ContextProvider>
    </FeatureFlagsProvider>
  );
}
