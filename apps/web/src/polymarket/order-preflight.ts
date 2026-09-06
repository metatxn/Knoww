"use client";

import { createLogger } from "@knoww/logger";
import type { OrderDraft } from "@knoww/services/core";
import {
  buildClobOrderApprovalTransactions,
  buildFullTradingApprovalTransactions,
  type ClobOrderApprovalRequirement,
  isClobOrderApproved,
  readClobOrderPusdAllowance,
  readTradingApprovalStatus,
} from "@knoww/shared-types/approvals";
import {
  buildPusdAutoWrapTransactions,
  formatConditionalShares,
  parseApprovalAmountRaw,
  planPusdAutoWrap,
} from "@knoww/shared-types/trading";
import { isWalletRejectionError } from "@knoww/shared-types/trading-errors";
import { useCallback, useMemo } from "react";
import type { Address } from "viem";
import { useConnection, useWalletClient } from "wagmi";
import {
  PUSD_ADDRESS,
  PUSD_DECIMALS,
  USDC_E_ADDRESS,
  USDC_E_DECIMALS,
} from "@/constants/contracts";
import { useClobCredentials } from "@/hooks/use-clob-credentials";
import { useProxyWallet } from "@/hooks/use-proxy-wallet";
import { useRelayerClient } from "@/hooks/use-relayer-client";
import { checkAllApprovals } from "@/lib/approvals";
import {
  executeViaDepositWallet,
  executeViaRelayer,
} from "@/lib/relayer-client";
import { getRpcUrl } from "@/lib/rpc";
import {
  getViemWalletClient,
  hasViemWalletProvider,
} from "@/lib/viem-wallet-client";
import { readConditionalBalanceRaw } from "./clob/balances";
import {
  type ClobOperationStep,
  DEFAULT_TRADING_APPROVAL_RAW,
  isBalanceAllowanceError,
} from "./clob/shared";
import { errorChain } from "./errors";
import {
  type CreateOrderParams,
  polymarketDraftRequirements,
  Side,
} from "./order-bridge";

// Same logger name as the hook this came from, so log filters keep working.
const log = createLogger("clob-client");

/** What the pre-order checks learned that the failure path needs again. */
export interface PreparedOrder {
  /** The wallet's share balance before a SELL posts; null for a BUY. */
  sellBalanceBeforePostRaw: bigint | null;
  requiredConditionalRaw: bigint | null;
}

export interface OrderFailureContext {
  params: CreateOrderParams;
  prepared: PreparedOrder | null;
  /** True once the adapter was asked to place, so a rejection may follow a fill. */
  didPostOrder: boolean;
  activeStep: ClobOperationStep;
}

export type OrderFailure =
  | {
      kind: "matched";
      order: { status: "matched_with_stale_balance_error"; error: string };
    }
  | { kind: "error"; error: Error };

export interface UpdateAllowanceResult {
  success: true;
  hashes: (string | undefined)[];
  message: string;
}

/**
 * The on-chain side of a Polymarket order from the trading wallet: share
 * balances, operator approvals, pUSD sufficiency and the USDC.e wrap. The
 * adapter drafts and places; this runs between the two, sized from the
 * draft's platform details. Nothing here is a hook state: the caller owns
 * busy, step and error.
 */
export function usePolymarketOrderPreflight() {
  const { address, isConnected } = useConnection();
  const { data: walletClient } = useWalletClient();
  const { hasCredentials } = useClobCredentials();
  const {
    proxyAddress,
    isDeployed: hasProxyWallet,
    isEoaMode,
    walletMode,
  } = useProxyWallet();
  const { approveUsdcForTrading } = useRelayerClient();

  /**
   * All signing routes through the active wagmi wallet client so
   * WalletConnect sessions keep signing on mobile.
   */
  const canTrade = useMemo(() => {
    if (typeof window === "undefined") return false;
    return (
      isConnected &&
      hasCredentials &&
      hasProxyWallet &&
      !!proxyAddress &&
      hasViemWalletProvider(walletClient)
    );
  }, [isConnected, hasCredentials, hasProxyWallet, proxyAddress, walletClient]);

  /**
   * Ensure the proxy wallet has enough pUSD to cover a BUY order.
   *
   * Polymarket CLOB V2 settles BUY orders in pUSD (wrapped USDC.e). Most
   * users only hold USDC.e, so before posting a BUY we check the pUSD
   * balance and, if short, dispatch a gasless relayer batch that:
   *   1. approves USDC.e -> CollateralOnramp (the shortfall)
   *   2. calls CollateralOnramp.wrap(USDC.e, proxy, shortfall)
   *
   * The Onramp converts USDC.e -> pUSD 1:1 and credits the proxy, so when
   * the order is matched the CTF Exchange V2 can pull the pUSD directly.
   *
   * SELL orders receive pUSD and never need this, so callers should only
   * invoke this for BUY paths.
   *
   * @param requiredPusdRaw - Required pUSD amount in base units (6 decimals).
   */
  const ensurePusdSufficient = useCallback(
    async (
      requiredPusdRaw: bigint,
      reservedPusdRaw: bigint = BigInt(0),
      estimatedFeeRaw: bigint | null = null
    ) => {
      if (!proxyAddress) throw new Error("Proxy wallet not found");
      if (requiredPusdRaw <= BigInt(0)) return;

      const { createPublicClient, erc20Abi, formatUnits, http } = await import(
        "viem"
      );
      const { polygon } = await import("@/lib/chains");

      const publicClient = createPublicClient({
        chain: polygon,
        transport: http(getRpcUrl()),
      });

      const pusdBalanceOnChain = (await publicClient.readContract({
        address: PUSD_ADDRESS,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [proxyAddress as `0x${string}`],
      })) as bigint;

      const usdcBalance = (await publicClient.readContract({
        address: USDC_E_ADDRESS,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [proxyAddress as `0x${string}`],
      })) as bigint;

      const wrapPlan = planPusdAutoWrap({
        pusdBalanceRaw: pusdBalanceOnChain,
        usdcEBalanceRaw: usdcBalance,
        requiredPusdRaw,
        reservedPusdRaw,
        estimatedFeeRaw,
      });

      // Decision inputs/outputs only, raw units (the logger stringifies
      // bigints); formatted duplicates are derivable and this runs on every
      // BUY preflight.
      log.debug("buy_collateral.preflight", {
        proxyAddress,
        walletMode,
        pusdBalanceRaw: pusdBalanceOnChain,
        usdcEBalanceRaw: usdcBalance,
        requiredPusdRaw,
        reservedPusdRaw,
        estimatedFeeRaw,
        shortfallRaw: wrapPlan.shortfallRaw,
        wrapAmountRaw: wrapPlan.wrapAmountRaw,
        needsWrap: wrapPlan.needsWrap,
        hasEnoughBaseCollateral: wrapPlan.hasEnoughBaseCollateral,
      });

      if (!wrapPlan.hasEnoughBaseCollateral) {
        const needed = formatUnits(wrapPlan.baseShortfallRaw, PUSD_DECIMALS);
        const haveUsdc = formatUnits(usdcBalance, USDC_E_DECIMALS);
        const haveAvailable = formatUnits(
          wrapPlan.availablePusdRaw,
          PUSD_DECIMALS
        );
        const reservedHint =
          reservedPusdRaw > BigInt(0)
            ? ` (${formatUnits(reservedPusdRaw, PUSD_DECIMALS)} pUSD is reserved by your open orders — cancel them to free it up)`
            : "";
        throw new Error(
          `Insufficient collateral: need $${needed} more to place this order. ` +
            `Proxy has $${haveAvailable} pUSD available and $${haveUsdc} USDC.e${reservedHint} — ` +
            "please deposit more USDC.e or cancel open orders."
        );
      }

      if (!wrapPlan.needsWrap) return;

      const txns = buildPusdAutoWrapTransactions(
        proxyAddress as `0x${string}`,
        wrapPlan.wrapAmountRaw
      );

      if (!walletClient) throw new Error("Wallet not connected");
      if (!address) throw new Error("Wallet not connected");

      if (isEoaMode) {
        const { polygon } = await import("@/lib/chains");
        const { getPublicClient } = await import("@/lib/rpc");
        const publicClient = getPublicClient();

        for (const tx of txns) {
          const hash = await walletClient.sendTransaction({
            account: address as `0x${string}`,
            chain: polygon,
            to: tx.to,
            data: tx.data,
            value: BigInt(tx.value),
          });
          await publicClient.waitForTransactionReceipt({ hash });
        }
        return;
      }

      if (walletMode === "deposit") {
        await executeViaDepositWallet(
          walletClient,
          address as `0x${string}`,
          txns,
          proxyAddress as `0x${string}`
        );
        return;
      }

      await executeViaRelayer(walletClient, address as `0x${string}`, txns);
    },
    [proxyAddress, walletClient, address, isEoaMode, walletMode]
  );

  /**
   * Ensure the default app trading approvals are set on the Safe. If any are
   * missing, submit the approval batch via the relayer before the order call.
   *
   * This makes the trade flow self-healing: a user who skipped onboarding
   * or was onboarded pre-V2 can place an order and the app will submit the
   * one-time approval batch transparently rather than failing with a
   * cryptic "not enough balance / allowance" from the server.
   */
  const ensureV2Approvals = useCallback(
    async (
      required?: { requiredPusdRaw: bigint; negRisk?: boolean },
      onApprovalStart?: () => void
    ) => {
      if (!proxyAddress) throw new Error("Proxy wallet not found");
      const status = await checkAllApprovals(proxyAddress);

      let hasRequiredPusdAllowance = true;
      if (required) {
        const [{ createPublicClient, formatUnits, http }, { polygon }] =
          await Promise.all([import("viem"), import("@/lib/chains")]);
        const client = createPublicClient({
          chain: polygon,
          transport: http(getRpcUrl()),
        });
        const orderAllowance = await readClobOrderPusdAllowance(
          client,
          proxyAddress as Address,
          required.negRisk
        );
        hasRequiredPusdAllowance = orderAllowance >= required.requiredPusdRaw;

        const orderApproved = isClobOrderApproved(status, {
          side: "BUY",
          negRisk: required.negRisk,
        });

        if (!(orderApproved && hasRequiredPusdAllowance)) {
          onApprovalStart?.();
          const approvalAmountRaw =
            required.requiredPusdRaw > DEFAULT_TRADING_APPROVAL_RAW
              ? required.requiredPusdRaw
              : DEFAULT_TRADING_APPROVAL_RAW;
          const result = await approveUsdcForTrading(
            formatUnits(approvalAmountRaw, PUSD_DECIMALS)
          );
          if (!result.success) {
            throw new Error(
              result.error ||
                "Failed to update trading approvals for this order."
            );
          }
          return;
        }
      }

      if (status.allApproved) return;

      onApprovalStart?.();
      const result = await approveUsdcForTrading();
      if (!result.success) {
        throw new Error(
          result.error ||
            "Failed to grant trading approvals. Please open trading setup and try again."
        );
      }
    },
    [proxyAddress, approveUsdcForTrading]
  );

  /**
   * SELL orders require ERC-1155 operator approval from the CTF contract to
   * every operator that moves outcome tokens for the fill: the exchange,
   * plus the NegRiskAdapter for neg-risk markets. Gate on the shared
   * `isClobOrderApproved` model (the single owner of that operator-pair rule)
   * rather than a single-operator read, so a wallet with the exchange
   * approved but the adapter missing is repaired before CLOB returns its
   * generic "not enough balance / allowance" rejection.
   */
  const ensureSellCtfApproval = useCallback(
    async (negRisk?: boolean, onApprovalStart?: () => void) => {
      if (!proxyAddress) throw new Error("Proxy wallet not found");

      const approvalScope: ClobOrderApprovalRequirement = {
        side: "SELL",
        negRisk,
      };
      const status = await checkAllApprovals(proxyAddress);
      if (isClobOrderApproved(status, approvalScope)) return;

      onApprovalStart?.();
      const result = await approveUsdcForTrading(undefined, { approvalScope });
      if (!result.success) {
        throw new Error(
          result.error ||
            "Failed to approve outcome-token trading for this sell order."
        );
      }
    },
    [proxyAddress, approveUsdcForTrading]
  );

  /**
   * Everything that must hold on-chain before the draft is placed. Throws
   * with the message the ticket shows; `setStep` reports the approving and
   * preparing phases as they start.
   */
  const prepare = useCallback(
    async (
      params: CreateOrderParams,
      draft: OrderDraft,
      setStep: (step: ClobOperationStep) => void
    ): Promise<PreparedOrder> => {
      const needs = polymarketDraftRequirements(draft);
      const requiredConditionalRaw = needs.sell?.requiredConditionalRaw ?? null;
      let sellBalanceBeforePostRaw: bigint | null = null;

      if (params.side === Side.SELL && requiredConditionalRaw !== null) {
        if (!proxyAddress) throw new Error("Trading wallet not found");

        const onChainBalanceRaw = await readConditionalBalanceRaw(
          params.tokenId,
          proxyAddress
        );
        sellBalanceBeforePostRaw = onChainBalanceRaw;

        if (onChainBalanceRaw < requiredConditionalRaw) {
          throw new Error(
            `Insufficient shares: this wallet holds ${formatConditionalShares(
              onChainBalanceRaw
            )}, but this sell order needs ${formatConditionalShares(
              requiredConditionalRaw
            )}. Refresh your portfolio and try again.`
          );
        }
      }

      // Approvals pre-flight: if any V2 allowance is missing, or if a finite
      // pUSD allowance is below this BUY's notional, update it before posting.
      // SELL needs CTF.setApprovalForAll -> exchanges to transfer outcome
      // tokens; BUY needs sufficient pUSD -> exchange allowance for settlement.
      if (params.side === Side.SELL) {
        await ensureSellCtfApproval(params.negRisk, () => setStep("approving"));
      }

      if (needs.buy) {
        await ensureV2Approvals(
          {
            requiredPusdRaw: needs.buy.requiredCollateralRaw,
            negRisk: params.negRisk,
          },
          () => setStep("approving")
        );
      }

      // Wrap-on-trade pre-flight (BUY only). SELL receives pUSD and does
      // not need collateral wrapped beforehand.
      if (params.side === Side.BUY) {
        if (!needs.buy) {
          throw new Error("Failed to determine required pUSD amount");
        }
        setStep("preparing");
        await ensurePusdSufficient(
          needs.buy.requiredNotionalRaw,
          needs.buy.reservedCollateralRaw,
          needs.buy.estimatedFeeRaw
        );
      }

      return { sellBalanceBeforePostRaw, requiredConditionalRaw };
    },
    [
      proxyAddress,
      ensureSellCtfApproval,
      ensureV2Approvals,
      ensurePusdSufficient,
    ]
  );

  /**
   * Reads a placement failure. A SELL the CLOB rejected for balance after
   * it had already filled is reported as matched, with the venue's message;
   * everything else becomes the error the ticket shows.
   */
  const resolveFailure = useCallback(
    async (
      err: unknown,
      context: OrderFailureContext
    ): Promise<OrderFailure> => {
      const { params, prepared } = context;
      const errors = errorChain(err);
      if (
        context.didPostOrder &&
        params.side === Side.SELL &&
        proxyAddress &&
        prepared &&
        prepared.sellBalanceBeforePostRaw !== null &&
        prepared.requiredConditionalRaw !== null &&
        errors.some(isBalanceAllowanceError)
      ) {
        try {
          const sellBalanceAfterPostRaw = await readConditionalBalanceRaw(
            params.tokenId,
            proxyAddress
          );

          if (sellBalanceAfterPostRaw < prepared.sellBalanceBeforePostRaw) {
            log.warn("sell.post_order_error_after_fill", {
              tokenId: params.tokenId,
              before: prepared.sellBalanceBeforePostRaw.toString(),
              after: sellBalanceAfterPostRaw.toString(),
              requested: prepared.requiredConditionalRaw.toString(),
              error: err instanceof Error ? err.message : String(err),
            });
            return {
              kind: "matched",
              order: {
                status: "matched_with_stale_balance_error",
                error: err instanceof Error ? err.message : String(err),
              },
            };
          }
        } catch (balanceReadError) {
          log.warn("sell.post_error_balance_check_failed", {
            tokenId: params.tokenId,
            error:
              balanceReadError instanceof Error
                ? balanceReadError.message
                : String(balanceReadError),
          });
        }
      }

      const error =
        errors.some(isWalletRejectionError) &&
        context.activeStep !== "approving"
          ? new Error("Wallet request was rejected. No order was placed.")
          : err instanceof Error
            ? err
            : new Error("Failed to create order");
      return { kind: "error", error };
    },
    [proxyAddress]
  );

  /**
   * Grants the app's trading approvals ahead of an order: through the
   * relayer for a contract wallet, or as signed transactions from the EOA.
   * `approvalScope` narrows the batch to what one order needs.
   */
  const updateAllowance = useCallback(
    async (
      approvalAmount?: string,
      approvalScope?: ClobOrderApprovalRequirement
    ): Promise<UpdateAllowanceResult> => {
      if (!address) throw new Error("Wallet not connected");

      try {
        if (!isEoaMode) {
          const result = approvalScope
            ? await approveUsdcForTrading(approvalAmount, { approvalScope })
            : await approveUsdcForTrading(approvalAmount);
          if (!result.success) {
            throw new Error(
              result.error ||
                "Failed to grant trading approvals. Please try again."
            );
          }
          return {
            success: true,
            hashes: result.transactionHashes ?? [result.transactionHash],
            message:
              result.message ||
              "Approved app trading pUSD, USDC.e Onramp, and outcome-token operators",
          };
        }

        const [{ createPublicClient, http }, { polygon }] = await Promise.all([
          import("viem"),
          import("@/lib/chains"),
        ]);
        const approvalAmountRaw = parseApprovalAmountRaw(approvalAmount);

        const approveWalletClient = await getViemWalletClient(
          walletClient,
          address as `0x${string}`
        );

        const publicClient = createPublicClient({
          chain: polygon,
          transport: http(getRpcUrl()),
        });

        const approvalTxs = approvalScope
          ? buildClobOrderApprovalTransactions(
              await readTradingApprovalStatus(
                publicClient,
                address as Address,
                {
                  approvalAmountRaw,
                }
              ),
              approvalScope
            )
          : buildFullTradingApprovalTransactions(approvalAmountRaw);
        if (approvalTxs.length === 0) {
          return {
            success: true,
            hashes: [],
            message: "All approvals already set",
          };
        }
        const hashes: `0x${string}`[] = [];
        for (const tx of approvalTxs) {
          const hash = await approveWalletClient.sendTransaction({
            account: address as `0x${string}`,
            chain: polygon,
            to: tx.to,
            data: tx.data,
            value: BigInt(tx.value),
          });
          const receipt = await publicClient.waitForTransactionReceipt({
            hash,
            pollingInterval: 5_000,
            timeout: 120_000,
            confirmations: 1,
          });
          if (receipt.status !== "success") {
            throw new Error(`Approval failed for ${tx.to}`);
          }
          hashes.push(hash);
        }

        return {
          success: true,
          hashes,
          message:
            "Approved app trading pUSD, USDC.e Onramp, and outcome-token operators",
        };
      } catch (err) {
        throw isWalletRejectionError(err)
          ? new Error("Approval was rejected. No order was placed.")
          : err instanceof Error
            ? err
            : new Error("Failed to approve");
      }
    },
    [address, walletClient, isEoaMode, approveUsdcForTrading]
  );

  return {
    canTrade,
    hasCredentials,
    prepare,
    resolveFailure,
    updateAllowance,
  };
}
