"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount } from "wagmi";

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
  market?: {
    question: string;
    slug: string;
    outcome: string;
  };
}

/**
 * API response structure
 */
interface OpenOrdersResponse {
  success: boolean;
  userAddress: string;
  count: number;
  orders: OpenOrder[];
  error?: string;
}

/**
 * Cancel order response
 */
interface CancelOrderResponse {
  success: boolean;
  response?: unknown;
  message?: string;
  error?: string;
}

/**
 * Query options for fetching open orders
 */
export interface UseOpenOrdersOptions {
  /** Filter by market/token ID */
  market?: string;
  /** Enable/disable the query */
  enabled?: boolean;
}

/**
 * Fetch open orders from the API
 */
async function fetchOpenOrders(
  userAddress: string,
  options: UseOpenOrdersOptions,
): Promise<OpenOrdersResponse> {
  const params = new URLSearchParams({
    userAddress,
  });

  if (options.market) {
    params.set("market", options.market);
  }

  const response = await fetch(`/api/orders/list?${params.toString()}`);

  if (!response.ok) {
    const errorData = (await response.json()) as { error?: string };
    throw new Error(errorData.error || "Failed to fetch open orders");
  }

  return response.json() as Promise<OpenOrdersResponse>;
}

/**
 * Cancel an order via the API
 */
async function cancelOrderApi(
  userAddress: string,
  orderId: string,
): Promise<CancelOrderResponse> {
  const response = await fetch("/api/orders/cancel", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      userAddress,
      orderID: orderId,
      signature: "cancel", // Backend handles this
    }),
  });

  if (!response.ok) {
    const errorData = (await response.json()) as { error?: string };
    throw new Error(errorData.error || "Failed to cancel order");
  }

  return response.json() as Promise<CancelOrderResponse>;
}

/**
 * Hook to fetch user's open orders
 *
 * Automatically uses the connected wallet address.
 * Returns all open (unfilled) orders.
 *
 * @param options - Query options
 * @returns Query result with open orders
 *
 * @example
 * ```tsx
 * const { data, isLoading, error } = useOpenOrders();
 *
 * if (isLoading) return <Loading />;
 * if (error) return <Error message={error.message} />;
 *
 * return (
 *   <div>
 *     <p>Open Orders: {data.count}</p>
 *     {data.orders.map(order => (
 *       <OrderRow key={order.id} order={order} />
 *     ))}
 *   </div>
 * );
 * ```
 */
export function useOpenOrders(options: UseOpenOrdersOptions = {}) {
  const { address, isConnected } = useAccount();

  return useQuery<OpenOrdersResponse, Error>({
    queryKey: ["openOrders", address, options.market],
    queryFn: () => {
      if (!address) throw new Error("Address not available");
      return fetchOpenOrders(address, options);
    },
    enabled: isConnected && !!address && options.enabled !== false,
    staleTime: 10 * 1000, // 10 seconds (orders can change quickly)
    refetchInterval: 15 * 1000, // Refetch every 15 seconds
  });
}

/**
 * Hook to cancel an order
 *
 * Returns a mutation that can be used to cancel orders.
 * Automatically invalidates the open orders query on success.
 *
 * @returns Mutation for canceling orders
 *
 * @example
 * ```tsx
 * const { mutate: cancelOrder, isPending } = useCancelOrder();
 *
 * const handleCancel = (orderId: string) => {
 *   cancelOrder(orderId, {
 *     onSuccess: () => toast.success('Order cancelled'),
 *     onError: (error) => toast.error(error.message),
 *   });
 * };
 * ```
 */
export function useCancelOrder() {
  const { address } = useAccount();
  const queryClient = useQueryClient();

  return useMutation<CancelOrderResponse, Error, string>({
    mutationFn: (orderId: string) => {
      if (!address) throw new Error("Address not available");
      return cancelOrderApi(address, orderId);
    },
    onSuccess: () => {
      // Invalidate open orders query to refetch
      queryClient.invalidateQueries({ queryKey: ["openOrders", address] });
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
  const { address } = useAccount();
  const queryClient = useQueryClient();

  return useMutation<CancelOrderResponse[], Error, void>({
    mutationFn: async () => {
      if (!address) throw new Error("Address not available");

      // First fetch all open orders
      const ordersResponse = await fetchOpenOrders(address, {});
      const orders = ordersResponse.orders || [];

      // Cancel each order
      const results = await Promise.allSettled(
        orders.map((order) => cancelOrderApi(address, order.id)),
      );

      // Return successful cancellations
      return results
        .filter(
          (r): r is PromiseFulfilledResult<CancelOrderResponse> =>
            r.status === "fulfilled",
        )
        .map((r) => r.value);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["openOrders", address] });
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
