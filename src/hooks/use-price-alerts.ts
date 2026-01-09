"use client";

import { useCallback, useEffect, useRef } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import { useOrderBookStore } from "./use-orderbook-store";

// ============================================
// Types
// ============================================

export type AlertType =
  | "DIP"
  | "SPIKE"
  | "WHALE_ENTRY"
  | "WHALE_EXIT"
  | "ARB_OPPORTUNITY"
  | "SPREAD_WARNING";

export interface PriceAlert {
  id: string;
  type: AlertType;
  assetId: string;
  marketTitle: string;
  /** Magnitude of the change (percentage for DIP/SPIKE, absolute for others) */
  magnitude: number;
  currentPrice: number;
  previousPrice: number;
  timestamp: number;
  seen: boolean;
  metadata?: {
    whaleAddress?: string;
    whaleName?: string;
    tradeSize?: number;
    upPrice?: number;
    downPrice?: number;
  };
}

export interface AlertConfig {
  /** Minimum price drop to trigger DIP alert (default: 0.10 = 10%) */
  dipThreshold: number;
  /** Minimum price spike to trigger SPIKE alert (default: 0.10 = 10%) */
  spikeThreshold: number;
  /** Time window for measuring change in ms (default: 5000 = 5s) */
  windowMs: number;
  /** Minimum whale trade size in USDC (default: 1000) */
  minWhaleTradeSize: number;
  /** Maximum UP+DOWN sum for arb alert (default: 0.98) */
  arbThreshold: number;
  /** Enable sound notifications */
  soundEnabled: boolean;
  /** Enable browser notifications */
  browserNotificationsEnabled: boolean;
  /** Cooldown between alerts for same asset in ms (default: 30000 = 30s) */
  alertCooldownMs: number;
}

const DEFAULT_CONFIG: AlertConfig = {
  dipThreshold: 0.1, // 10% drop
  spikeThreshold: 0.1, // 10% spike
  windowMs: 5000, // 5 second window
  minWhaleTradeSize: 1000, // $1000 minimum
  arbThreshold: 0.98, // UP + DOWN < $0.98
  soundEnabled: true,
  browserNotificationsEnabled: true,
  alertCooldownMs: 30000, // 30 second cooldown per asset
};

// ============================================
// Alert Store
// ============================================

interface AlertStoreState {
  alerts: PriceAlert[];
  config: AlertConfig;
  /** Track last alert time per asset to implement cooldown */
  lastAlertTime: Map<string, number>;
  /** Assets being monitored for alerts */
  monitoredAssets: Set<string>;

  // Actions
  addAlert: (alert: Omit<PriceAlert, "id" | "seen">) => void;
  markSeen: (alertId: string) => void;
  markAllSeen: () => void;
  clearAlerts: () => void;
  updateConfig: (config: Partial<AlertConfig>) => void;
  addMonitoredAsset: (assetId: string) => void;
  removeMonitoredAsset: (assetId: string) => void;
  clearMonitoredAssets: () => void;

  // Selectors
  getUnseenCount: () => number;
  getRecentAlerts: (limit?: number) => PriceAlert[];
  canAlertForAsset: (assetId: string) => boolean;
}

export const useAlertStore = create<AlertStoreState>()(
  persist(
    (set, get) => ({
      alerts: [],
      config: DEFAULT_CONFIG,
      lastAlertTime: new Map<string, number>(),
      monitoredAssets: new Set<string>(),

      addAlert: (alertData) => {
        const state = get();

        // Check cooldown
        const lastTime = state.lastAlertTime.get(alertData.assetId);
        const now = Date.now();
        if (lastTime && now - lastTime < state.config.alertCooldownMs) {
          return; // Skip - still in cooldown
        }

        const alert: PriceAlert = {
          ...alertData,
          id: `${alertData.type}-${alertData.assetId}-${now}`,
          seen: false,
        };

        const newLastAlertTime = new Map(state.lastAlertTime);
        newLastAlertTime.set(alertData.assetId, now);

        set({
          alerts: [alert, ...state.alerts].slice(0, 100), // Keep last 100 alerts
          lastAlertTime: newLastAlertTime,
        });

        // Trigger notifications
        if (state.config.soundEnabled) {
          playAlertSound(alert.type);
        }
        if (state.config.browserNotificationsEnabled) {
          showBrowserNotification(alert);
        }
      },

      markSeen: (alertId) => {
        set((state) => ({
          alerts: state.alerts.map((a) =>
            a.id === alertId ? { ...a, seen: true } : a
          ),
        }));
      },

      markAllSeen: () => {
        set((state) => ({
          alerts: state.alerts.map((a) => ({ ...a, seen: true })),
        }));
      },

      clearAlerts: () => set({ alerts: [] }),

      updateConfig: (newConfig) => {
        set((state) => ({
          config: { ...state.config, ...newConfig },
        }));
      },

      addMonitoredAsset: (assetId) => {
        set((state) => {
          const newSet = new Set(state.monitoredAssets);
          newSet.add(assetId);
          return { monitoredAssets: newSet };
        });
      },

      removeMonitoredAsset: (assetId) => {
        set((state) => {
          const newSet = new Set(state.monitoredAssets);
          newSet.delete(assetId);
          return { monitoredAssets: newSet };
        });
      },

      clearMonitoredAssets: () => {
        set({ monitoredAssets: new Set<string>() });
      },

      getUnseenCount: () => {
        return get().alerts.filter((a) => !a.seen).length;
      },

      getRecentAlerts: (limit = 10) => {
        return get().alerts.slice(0, limit);
      },

      canAlertForAsset: (assetId: string) => {
        const state = get();
        const lastTime = state.lastAlertTime.get(assetId);
        if (!lastTime) return true;
        return Date.now() - lastTime >= state.config.alertCooldownMs;
      },
    }),
    {
      name: "price-alerts-storage",
      partialize: (state) => ({
        config: state.config,
        // Don't persist alerts or monitored assets - they're session-specific
      }),
    }
  )
);

// ============================================
// Notification Helpers
// ============================================

// Singleton AudioContext to avoid accumulation (browsers limit to ~6 contexts)
let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined" || !window.AudioContext) return null;
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

function playAlertSound(type: AlertType) {
  // Use Web Audio API for a simple beep sound
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    // Resume if suspended (autoplay policy)
    if (ctx.state === "suspended") {
      ctx.resume();
    }

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Different frequencies for different alert types
    const frequencies: Record<AlertType, number> = {
      DIP: 400, // Lower tone for dip
      SPIKE: 800, // Higher tone for spike
      WHALE_ENTRY: 600, // Medium tone for whale
      WHALE_EXIT: 500,
      ARB_OPPORTUNITY: 1000, // High tone for opportunity
      SPREAD_WARNING: 300, // Low tone for warning
    };

    oscillator.frequency.value = frequencies[type];
    oscillator.type = "sine";

    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.3);
  } catch {
    // Ignore audio errors
  }
}

function showBrowserNotification(alert: PriceAlert) {
  if (typeof window === "undefined") return;
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const titleMap: Record<AlertType, string> = {
    DIP: "📉 Price Dip Detected!",
    SPIKE: "📈 Price Spike Detected!",
    WHALE_ENTRY: "🐋 Whale Entry!",
    WHALE_EXIT: "🐋 Whale Exit!",
    ARB_OPPORTUNITY: "💰 Arbitrage Opportunity!",
    SPREAD_WARNING: "⚠️ Spread Warning",
  };

  const body = `${alert.marketTitle}\n${(alert.magnitude * 100).toFixed(1)}% change`;

  try {
    new Notification(titleMap[alert.type], {
      body,
      icon: "/logo-256x256.png",
      tag: alert.id, // Prevents duplicate notifications
    });
  } catch {
    // Ignore notification errors
  }
}

// ============================================
// Request Notification Permission
// ============================================

export function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined") return Promise.resolve("denied");
  if (!("Notification" in window)) return Promise.resolve("denied");
  return Notification.requestPermission();
}

// ============================================
// Main Alert Detection Hook
// ============================================

/**
 * Hook that monitors price changes and triggers alerts
 * @param assetIds - Array of asset IDs to monitor
 */
export function usePriceAlertDetection(assetIds: string[]) {
  const { config, addAlert, canAlertForAsset } = useAlertStore();

  // Subscribe only to relevant assets using useShallow for shallow comparison
  // This prevents re-renders when other assets update (performance optimization)
  const relevantData = useOrderBookStore(
    useShallow((state) =>
      assetIds.map((id) => ({
        assetId: id,
        velocity: state.priceVelocity.get(id),
        orderBook: state.orderBooks.get(id),
      }))
    )
  );

  // Track last known prices to calculate changes
  const lastPricesRef = useRef<Map<string, number>>(new Map());

  // Check for alerts on each price update
  useEffect(() => {
    for (const { assetId, velocity, orderBook } of relevantData) {
      if (!velocity || !orderBook) continue;

      // Check cooldown
      if (!canAlertForAsset(assetId)) continue;

      const currentPrice = orderBook.midpoint ?? 0;
      const lastPrice = lastPricesRef.current.get(assetId) ?? currentPrice;

      // Check for DIP (negative change exceeds threshold)
      if (velocity.change5s <= -config.dipThreshold) {
        addAlert({
          type: "DIP",
          assetId,
          marketTitle: orderBook.market || `Asset ${assetId.slice(0, 8)}...`,
          magnitude: Math.abs(velocity.change5s),
          currentPrice,
          previousPrice: lastPrice,
          timestamp: Date.now(),
        });
      }

      // Check for SPIKE (positive change exceeds threshold)
      if (velocity.change5s >= config.spikeThreshold) {
        addAlert({
          type: "SPIKE",
          assetId,
          marketTitle: orderBook.market || `Asset ${assetId.slice(0, 8)}...`,
          magnitude: velocity.change5s,
          currentPrice,
          previousPrice: lastPrice,
          timestamp: Date.now(),
        });
      }

      // Update last known price
      lastPricesRef.current.set(assetId, currentPrice);
    }
  }, [relevantData, config, addAlert, canAlertForAsset]);
}

// ============================================
// Consumer Hooks
// ============================================

/**
 * Hook to get alerts and actions
 */
export function usePriceAlerts() {
  const alerts = useAlertStore((state) => state.alerts);
  const config = useAlertStore((state) => state.config);
  const markSeen = useAlertStore((state) => state.markSeen);
  const markAllSeen = useAlertStore((state) => state.markAllSeen);
  const clearAlerts = useAlertStore((state) => state.clearAlerts);
  const updateConfig = useAlertStore((state) => state.updateConfig);
  const getUnseenCount = useAlertStore((state) => state.getUnseenCount);

  return {
    alerts,
    config,
    unseenCount: getUnseenCount(),
    markSeen,
    markAllSeen,
    clearAlerts,
    updateConfig,
  };
}

/**
 * Hook to get just the unseen count (optimized for badge display)
 */
export function useUnseenAlertCount() {
  return useAlertStore((state) => state.alerts.filter((a) => !a.seen).length);
}

/**
 * Hook to manage monitored assets
 */
export function useMonitoredAssets() {
  const monitoredAssets = useAlertStore((state) => state.monitoredAssets);
  const addMonitoredAsset = useAlertStore((state) => state.addMonitoredAsset);
  const removeMonitoredAsset = useAlertStore(
    (state) => state.removeMonitoredAsset
  );
  const clearMonitoredAssets = useAlertStore(
    (state) => state.clearMonitoredAssets
  );

  const toggleMonitoredAsset = useCallback(
    (assetId: string) => {
      if (monitoredAssets.has(assetId)) {
        removeMonitoredAsset(assetId);
      } else {
        addMonitoredAsset(assetId);
      }
    },
    [monitoredAssets, addMonitoredAsset, removeMonitoredAsset]
  );

  return {
    monitoredAssets: Array.from(monitoredAssets),
    isMonitored: (assetId: string) => monitoredAssets.has(assetId),
    addMonitoredAsset,
    removeMonitoredAsset,
    toggleMonitoredAsset,
    clearMonitoredAssets,
  };
}

/**
 * Hook to get alert config with update function
 */
export function useAlertConfig() {
  return useAlertStore(
    useShallow((state) => ({
      config: state.config,
      updateConfig: state.updateConfig,
    }))
  );
}
