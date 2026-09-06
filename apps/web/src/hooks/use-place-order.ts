"use client";

import { useCallback, useState } from "react";
import { useConnection } from "wagmi";
import type { ClobOperationStep } from "@/polymarket/clob/shared";
import {
  type CreateOrderParams,
  OrderType,
  POLYMARKET_PLATFORM,
  Side,
  toCanonicalOrderIntent,
} from "@/polymarket/order-bridge";
import {
  type PreparedOrder,
  usePolymarketOrderPreflight,
} from "@/polymarket/order-preflight";
import { useTradingAdapter } from "./use-trading-adapter";

export type { CreateOrderParams };
export { OrderType, Side };
export type PlaceOrderStep = ClobOperationStep;

/**
 * Places the ticket's order through the trading adapter.
 *
 * The adapter owns the conversation with the venue: market and book reads,
 * fee and collateral maths, the balance refresh, signing and posting. This
 * hook keeps the ticket's state (busy, step, last error) and hands the
 * on-chain work between draft and placement to the platform's preflight.
 *
 * The ticket trades Polymarket only today, so this binds to that adapter
 * and to `usePolymarketOrderPreflight`. A second platform brings its own
 * preflight behind the same shape, and the binding moves to the market's
 * platform.
 */
export function usePlaceOrder() {
  const { address } = useConnection();
  const { identity, getAdapter } = useTradingAdapter(POLYMARKET_PLATFORM);
  const { canTrade, hasCredentials, prepare, resolveFailure } =
    usePolymarketOrderPreflight();

  const [isLoading, setIsLoading] = useState(false);
  const [operationStep, setOperationStep] = useState<ClobOperationStep>("idle");
  const [error, setError] = useState<Error | null>(null);

  const createOrder = useCallback(
    async (params: CreateOrderParams) => {
      if (!address) throw new Error("Wallet not connected");
      if (!canTrade) throw new Error("Trading setup incomplete");
      if (!identity) throw new Error("Trading wallet not found");

      setIsLoading(true);
      let activeStep: ClobOperationStep = "checking";
      const setStep = (step: ClobOperationStep) => {
        activeStep = step;
        setOperationStep(step);
      };
      setStep("checking");
      setError(null);
      let prepared: PreparedOrder | null = null;
      let didPostOrder = false;

      try {
        const adapter = await getAdapter();
        const draft = await adapter.previewOrder(
          toCanonicalOrderIntent(params, identity)
        );
        prepared = await prepare(params, draft, setStep);

        setStep("placing");

        // From here the adapter refreshes the CLOB's balance cache, signs and
        // posts in one call, so a rejection past this point may follow a fill.
        didPostOrder = true;
        const result = await adapter.placeOrder({
          draftId: draft.draftId,
          idempotencyKey: crypto.randomUUID(),
        });
        return { success: true, order: result };
      } catch (err) {
        const failure = await resolveFailure(err, {
          params,
          prepared,
          didPostOrder,
          activeStep,
        });
        if (failure.kind === "matched") {
          setError(null);
          return { success: true, order: failure.order };
        }
        setError(failure.error);
        throw failure.error;
      } finally {
        setIsLoading(false);
        setOperationStep("idle");
      }
    },
    [address, canTrade, identity, getAdapter, prepare, resolveFailure]
  );

  return {
    createOrder,
    isLoading,
    operationStep,
    error,
    canTrade,
    hasCredentials,
  };
}
