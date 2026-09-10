"use client";

import { createLogger } from "@knoww/logger";
import type {
  AccountOrder,
  AccountReadInput,
  TradingAdapter,
} from "@knoww/services/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useConnection } from "wagmi";
import { captureTradingEvent } from "@/lib/order-analytics";
import { qk } from "@/lib/query-keys";
import {
  isExpectedClobReadFailure,
  isFreshAuthenticationRequired,
} from "@/polymarket/errors";
import {
  readPolymarketOrderScoring,
  toOpenOrder,
} from "@/polymarket/open-orders";
import { POLYMARKET_PLATFORM } from "@/polymarket/order-bridge";

const log = createLogger("open-orders");

import { useClobCredentials } from "./use-clob-credentials";
import { useProxyWallet } from "./use-proxy-wallet";
import { useTradingAdapter } from "./use-trading-adapter";

async function getAllOpenOrders(
  adapter: TradingAdapter,
  input: AccountReadInput
): Promise<AccountOrder[]> {
  const orders = new Map<string, AccountOrder>();
  const seenCursors = new Set<string>();
  let cursor = input.cursor;
  do {
    if (cursor) {
      if (seenCursors.has(cursor))
        throw new Error("Order pagination did not advance");
      seenCursors.add(cursor);
    }
    const page = await adapter.getAccountOrders({
      ...input,
      ...(cursor ? { cursor } : {}),
    });
    for (const order of page.items) orders.set(order.orderId, order);
    cursor = page.nextCursor;
  } while (cursor);
  return [...orders.values()];
}

/**
 * Open order data structure
 */
export interface OpenOrder {
  id: string;
  maker: string;
  tokenId: string;
  side: "BUY" | "SELL";
  price: number;
  size: number;
  filledSize: number;
  remainingSize: number;
  status: "LIVE" | "MATCHED" | "CANCELLED";
  createdAt: string;
  expiration: string;
  scoring?: boolean;
  market?: {
    question: string;
    slug: string;
    eventSlug: string;
    conditionId?: string;
    outcome: string;
    icon?: string;
  };
}

/**
 * Query options for fetching open orders
 */
export interface UseOpenOrdersOptions {
  /** Filter by market/token ID */
  market?: string;
  /** Enable/disable the query */
  enabled?: boolean;
  /** Override the user address (e.g., use proxy wallet) */
  userAddress?: string;
}

/**
 * API response type for market info
 */
interface MarketInfoResponse {
  success: boolean;
  market?: {
    question: string;
    slug: string;
    eventSlug: string;
    conditionId?: string;
    outcome: string;
    icon?: string;
  };
  error?: string;
}

/**
 * Fetch market info for a token ID
 */
async function fetchMarketInfo(tokenId: string): Promise<{
  question: string;
  slug: string;
  eventSlug: string;
  conditionId?: string;
  outcome: string;
  icon?: string;
} | null> {
  try {
    const response = await fetch(`/api/polymarket/markets/by-token/${tokenId}`);
    if (!response.ok) return null;

    const data: MarketInfoResponse = await response.json();
    if (data.success && data.market) {
      return {
        question: data.market.question,
        slug: data.market.slug,
        eventSlug: data.market.eventSlug,
        conditionId: data.market.conditionId,
        outcome: data.market.outcome,
        icon: data.market.icon,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * The wallet's open orders, read through the trading adapter.
 *
 * Needs stored API credentials and a deployed trading wallet. The read is
 * passive: rejected credentials clear the stored set instead of opening a
 * wallet prompt from a polling query.
 *
 * @param options - Query options
 * @returns Query result with open orders
 */
export function useOpenOrders(options: UseOpenOrdersOptions = {}) {
  const { address, isConnected } = useConnection();
  const { credentials, hasCredentials, clearCredentials } =
    useClobCredentials();
  const {
    proxyAddress,
    isDeployed: hasProxyWallet,
    isEoaMode,
  } = useProxyWallet();
  const { identity, isReady, getAdapter } =
    useTradingAdapter(POLYMARKET_PLATFORM);

  // Use provided address or fall back to connected wallet
  const userAddress = options.userAddress || address;

  return useQuery({
    queryKey: qk.orders.list(userAddress ?? "", options.market),
    queryFn: async () => {
      if (!userAddress) {
        return {
          success: false,
          userAddress: null,
          count: 0,
          orders: [],
          error: "Address not available",
        };
      }

      try {
        if (!identity) throw new Error("Trading wallet not found");
        const adapter = await getAdapter();
        const orders = await getAllOpenOrders(adapter, { identity });
        const transformedOrders: OpenOrder[] = orders.map((order) =>
          toOpenOrder(order, userAddress)
        );

        const readScoring = async (
          orderIds: string[]
        ): Promise<Record<string, boolean>> => {
          if (orderIds.length === 0) return {};
          if (!credentials || !address || !proxyAddress) return {};
          return readPolymarketOrderScoring(
            {
              signerAddress: address,
              walletAddress: isEoaMode ? address : proxyAddress,
              credentials,
            },
            orderIds
          );
        };

        // Fetch market info and scoring info in parallel
        const uniqueTokenIds = [
          ...new Set(transformedOrders.map((o) => o.tokenId)),
        ];
        const orderIds = transformedOrders.map((o) => o.id);

        const [marketInfos, scoringInfo] = await Promise.all([
          Promise.all(
            uniqueTokenIds.map(async (tokenId) => ({
              tokenId,
              info: await fetchMarketInfo(tokenId),
            }))
          ),
          readScoring(orderIds).catch((err) => {
            if (isFreshAuthenticationRequired(err)) {
              clearCredentials();
              log.debug("scoring.skipped", { reason: "credentials_invalid" });
            } else if (isExpectedClobReadFailure(err)) {
              log.debug("scoring.skipped");
            } else {
              log.error("scoring.fetch_failed", { error: err });
            }
            return {} as Record<string, boolean>;
          }),
        ]);

        const marketInfoMap = new Map<
          string,
          {
            question: string;
            slug: string;
            eventSlug: string;
            conditionId?: string;
            outcome: string;
            icon?: string;
          }
        >();

        for (const { tokenId, info } of marketInfos) {
          if (info) {
            marketInfoMap.set(tokenId, info);
          }
        }

        // Enrich orders with market info and scoring status
        const enrichedOrders = transformedOrders.map((order) => ({
          ...order,
          market: marketInfoMap.get(order.tokenId) || undefined,
          scoring: scoringInfo[order.id] || false,
        }));

        // Filter by market if specified
        const filteredOrders = options.market
          ? enrichedOrders.filter((o) => o.tokenId === options.market)
          : enrichedOrders;

        return {
          success: true,
          userAddress,
          count: filteredOrders.length,
          orders: filteredOrders,
        };
      } catch (err) {
        if (isFreshAuthenticationRequired(err)) {
          clearCredentials();
          log.debug("fetch.skipped", { reason: "credentials_invalid" });
        } else if (isExpectedClobReadFailure(err)) {
          log.debug("fetch.skipped", {
            reason: err instanceof Error ? err.message : String(err),
          });
        } else {
          log.error("fetch.failed", { error: err });
        }
        // Return empty result on error instead of throwing
        return {
          success: false,
          userAddress,
          count: 0,
          orders: [],
          error: err instanceof Error ? err.message : "Failed to fetch orders",
        };
      }
    },
    // Only enable when all prerequisites are met
    enabled:
      isConnected &&
      !!userAddress &&
      hasCredentials &&
      hasProxyWallet &&
      !!proxyAddress &&
      isReady &&
      options.enabled !== false,
    staleTime: 10 * 1000, // 10 seconds (orders can change quickly)
    refetchInterval: 15 * 1000, // Refetch every 15 seconds
  });
}

/**
 * Hook to cancel an order through the trading adapter
 *
 * Returns a mutation that can be used to cancel orders.
 * Uses optimistic updates for instant UI feedback.
 *
 * @returns Mutation for canceling orders
 */
export function useCancelOrder() {
  const { address } = useConnection();
  const { identity, getAdapter } = useTradingAdapter(POLYMARKET_PLATFORM);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderId: string) => {
      if (!address) throw new Error("Address not available");
      if (!identity) throw new Error("Trading wallet not found");
      captureTradingEvent("order_cancel_attempted", address, {
        order_id: orderId,
      });
      try {
        const adapter = await getAdapter();
        // A refused cancel throws and rolls back the optimistic removal.
        const order = await adapter.cancelOrder({
          identity,
          orderId,
          idempotencyKey: crypto.randomUUID(),
        });
        captureTradingEvent("order_cancelled", address, {
          order_id: orderId,
          $insert_id: `cancel:${address}:${orderId}`,
        });
        return { success: true, order };
      } catch (error) {
        captureTradingEvent("order_cancel_failed", address, {
          order_id: orderId,
        });
        throw error;
      }
    },
    onMutate: async (orderId: string) => {
      // Cancel any outgoing refetches to prevent overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: qk.orders.all() });

      // Snapshot previous values for all open orders queries
      const previousData = queryClient.getQueriesData({
        queryKey: qk.orders.all(),
      });

      // Optimistically remove the order from all cached queries
      queryClient.setQueriesData(
        { queryKey: qk.orders.all() },
        (old: { orders?: OpenOrder[]; count?: number } | undefined) => {
          if (!old?.orders) return old;
          const filteredOrders = old.orders.filter(
            (order) => order.id !== orderId
          );
          return {
            ...old,
            orders: filteredOrders,
            count: filteredOrders.length,
          };
        }
      );

      // Return context with previous data for rollback
      return { previousData };
    },
    onError: (_err, _orderId, context) => {
      // Rollback to previous data on error
      if (context?.previousData) {
        for (const [queryKey, data] of context.previousData) {
          queryClient.setQueryData(queryKey, data);
        }
      }
    },
    onSuccess: () => {},
    onSettled: () => {
      // Refetch to ensure server state is synced
      queryClient.invalidateQueries({ queryKey: qk.orders.all() });
    },
  });
}

/**
 * Hook to cancel all open orders
 *
 * Returns a mutation that cancels all open orders for the user.
 *
 * @returns Mutation for canceling all orders
 */
export function useCancelAllOrders() {
  const { address } = useConnection();
  const { proxyAddress } = useProxyWallet();
  const { identity, getAdapter } = useTradingAdapter(POLYMARKET_PLATFORM);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!address) throw new Error("Address not available");
      if (!identity) throw new Error("Trading wallet not found");
      const adapter = await getAdapter();

      // First fetch all open orders
      const orders = await getAllOpenOrders(adapter, { identity });

      // Cancel each order
      const results = await Promise.allSettled(
        orders.map((order) =>
          adapter.cancelOrder({
            identity,
            orderId: order.orderId,
            idempotencyKey: crypto.randomUUID(),
          })
        )
      );

      // Return successful cancellations count
      const successCount = results.filter(
        (r) => r.status === "fulfilled"
      ).length;
      return { cancelled: successCount, total: orders.length };
    },
    onSuccess: () => {
      // Invalidate all open orders queries
      queryClient.invalidateQueries({ queryKey: qk.orders.all() });

      if (address) {
        queryClient.invalidateQueries({ queryKey: qk.orders.list(address) });
      }
      if (proxyAddress) {
        queryClient.invalidateQueries({
          queryKey: qk.orders.list(proxyAddress),
        });
      }
    },
  });
}

/**
 * Hook to get open orders count (optimized for badges/indicators)
 *
 * @returns Query result with just the count
 */
export function useOpenOrdersCount() {
  const { data, isLoading, error } = useOpenOrders();

  return {
    count: data?.count || 0,
    isLoading,
    error,
  };
}
