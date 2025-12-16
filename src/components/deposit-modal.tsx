"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Clock,
  Copy,
  CreditCard,
  Info,
  Loader2,
  RefreshCw,
  Search,
  Zap,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { erc20Abi, parseUnits } from "viem";
import { polygon } from "viem/chains";
import { useConnection } from "wagmi";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type SupportedAsset, useBridge } from "@/hooks/use-bridge";
import { useProxyWallet } from "@/hooks/use-proxy-wallet";
import { type TokenBalance, useWalletTokens } from "@/hooks/use-wallet-tokens";

interface DepositModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type DepositStep = "method" | "token" | "amount" | "confirm" | "bridge-select";
type DepositMethod = "wallet" | "bridge" | "card" | "exchange" | "paypal";

/**
 * Chain config for bridge tokens
 */
const CHAIN_CONFIG: Record<string, { icon: string; gradient: string }> = {
  "137": { icon: "⬡", gradient: "from-purple-500 to-violet-600" },
  "1": { icon: "⟠", gradient: "from-blue-500 to-indigo-600" },
  "42161": { icon: "🔷", gradient: "from-sky-400 to-blue-600" },
  "8453": { icon: "🔵", gradient: "from-blue-500 to-blue-700" },
  "10": { icon: "🔴", gradient: "from-red-500 to-rose-600" },
  "43114": { icon: "🔺", gradient: "from-red-500 to-red-700" },
  "56": { icon: "⛓️", gradient: "from-yellow-400 to-amber-600" },
};

const getChainConfig = (chainId: string) =>
  CHAIN_CONFIG[chainId] || {
    icon: "🔗",
    gradient: "from-gray-400 to-gray-600",
  };

/**
 * Format address for display
 */
const formatAddress = (addr: string) =>
  `${addr.slice(0, 4)}...${addr.slice(-4)}`;

/**
 * Deposit Modal - Polymarket Style
 *
 * Flow:
 * 1. Select deposit method (Wallet, Bridge, Card, Exchange, PayPal)
 * 2. Select token from wallet (or bridge chain)
 * 3. Enter amount
 * 4. Confirm transaction
 */
export function DepositModal({ open, onOpenChange }: DepositModalProps) {
  const { address, isConnected } = useConnection();
  const { proxyAddress, usdcBalance: polymarketBalance } = useProxyWallet();
  const {
    tokens: walletTokens,
    isLoading: loadingTokens,
    refresh: refreshTokens,
  } = useWalletTokens({ enabled: open });
  const {
    supportedAssets,
    isLoading: loadingBridge,
    getSupportedAssets,
    createDepositAddresses,
  } = useBridge();

  // Transaction state (using viem directly instead of deprecated wagmi hooks)
  const [isPending, setIsPending] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [txError, setTxError] = useState<Error | null>(null);

  // Modal state
  const [step, setStep] = useState<DepositStep>("method");
  const [selectedMethod, setSelectedMethod] = useState<DepositMethod | null>(
    null,
  );
  const [selectedToken, setSelectedToken] = useState<TokenBalance | null>(null);
  const [selectedBridgeAsset, setSelectedBridgeAsset] =
    useState<SupportedAsset | null>(null);
  const [amount, setAmount] = useState<string>("");
  const [bridgeAddress, setBridgeAddress] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [depositError, setDepositError] = useState<string | null>(null);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setStep("method");
      setSelectedMethod(null);
      setSelectedToken(null);
      setSelectedBridgeAsset(null);
      setAmount("");
      setBridgeAddress("");
      setCopied(false);
      setSearchQuery("");
      setIsProcessing(false);
      setDepositError(null);
      setIsPending(false);
      setIsConfirming(false);
      setIsConfirmed(false);
      setTxError(null);
    }
  }, [open]);

  // Handle transaction completion
  useEffect(() => {
    if (isConfirmed) {
      console.log("[DepositModal] Transaction confirmed!");
      setIsProcessing(false);
      // Refresh wallet tokens after successful deposit
      refreshTokens();
      // Close modal after a short delay
      setTimeout(() => {
        onOpenChange(false);
      }, 1500);
    }
  }, [isConfirmed, refreshTokens, onOpenChange]);

  // Handle transaction errors
  useEffect(() => {
    if (txError) {
      console.error("[DepositModal] Transaction error:", txError);
      setDepositError(txError?.message || "Transaction failed");
      setIsProcessing(false);
    }
  }, [txError]);

  // Load bridge assets when needed (for both bridge-select and wallet token steps)
  useEffect(() => {
    if (
      open &&
      (step === "bridge-select" || step === "token") &&
      supportedAssets.length === 0
    ) {
      getSupportedAssets();
    }
  }, [open, step, supportedAssets.length, getSupportedAssets]);

  /**
   * Get minimum deposit amount for a token symbol from supported assets
   * Returns the lowest minCheckoutUsd across all chains for that token
   */
  const getMinDepositForToken = useCallback(
    (tokenSymbol: string): number => {
      // Find all supported assets matching this token symbol
      const matchingAssets = supportedAssets.filter(
        (asset) =>
          asset.token.symbol.toUpperCase() === tokenSymbol.toUpperCase() ||
          // Handle USDC.e matching USDC
          (tokenSymbol.toUpperCase() === "USDC.E" &&
            asset.token.symbol.toUpperCase() === "USDC") ||
          (tokenSymbol.toUpperCase() === "USDC" &&
            asset.token.symbol.toUpperCase() === "USDC"),
      );

      if (matchingAssets.length === 0) {
        // Default minimum if token not found in supported assets
        // This means the token might need to be swapped first
        return 45; // Default Polymarket minimum
      }

      // Return the lowest minimum across all chains
      return Math.min(...matchingAssets.map((a) => a.minCheckoutUsd));
    },
    [supportedAssets],
  );

  /**
   * Get the default/fallback minimum deposit (lowest across all assets)
   */
  const defaultMinDeposit = useMemo(() => {
    if (supportedAssets.length === 0) return 45;
    return Math.min(...supportedAssets.map((a) => a.minCheckoutUsd));
  }, [supportedAssets]);

  // Filtered bridge assets
  const filteredBridgeAssets = useMemo(() => {
    if (!searchQuery.trim()) return supportedAssets;
    const query = searchQuery.toLowerCase();
    return supportedAssets.filter(
      (asset) =>
        asset.token.symbol.toLowerCase().includes(query) ||
        asset.token.name.toLowerCase().includes(query) ||
        asset.chainName.toLowerCase().includes(query),
    );
  }, [supportedAssets, searchQuery]);

  // Handle method selection
  const handleSelectMethod = useCallback(
    (method: DepositMethod, e?: React.MouseEvent) => {
      e?.preventDefault();
      e?.stopPropagation();
      setSelectedMethod(method);
      if (method === "wallet") {
        setStep("token");
      } else if (method === "bridge") {
        setStep("bridge-select");
      }
      // Card, Exchange, PayPal show "Coming Soon" - no navigation
    },
    [],
  );

  // Handle token selection - also fetch deposit address for this token
  const handleSelectToken = useCallback(
    async (token: TokenBalance) => {
      setSelectedToken(token);
      setIsProcessing(true);
      setDepositError(null);
      setBridgeAddress(""); // Reset bridge address
      let resolvedDepositAddress = "";

      try {
        console.log(
          "[DepositModal] Fetching deposit addresses for proxy:",
          proxyAddress,
        );

        // Get deposit addresses from Polymarket Bridge API
        const addresses = await createDepositAddresses();

        console.log("[DepositModal] Received addresses:", addresses);

        if (addresses && addresses.length > 0) {
          // Log all available addresses for debugging
          console.log(
            "[DepositModal] Available deposit addresses:",
            addresses.map((a) => ({
              chainId: a.chainId,
              symbol: a.tokenSymbol,
              address: a.depositAddress,
            })),
          );

          // Find the deposit address for Polygon (chainId 137) and the selected token
          const matching = addresses.find(
            (addr) =>
              addr.chainId === "137" &&
              addr.tokenSymbol.toUpperCase() === token.symbol.toUpperCase(),
          );

          if (matching) {
            resolvedDepositAddress = matching.depositAddress;
            console.log("[DepositModal] Found exact match for token:", {
              token: token.symbol,
              depositAddress: resolvedDepositAddress,
            });
          } else {
            // If no exact match, try to find any Polygon deposit address (for USDC)
            const polygonUsdc = addresses.find(
              (addr) =>
                addr.chainId === "137" &&
                addr.tokenSymbol.toUpperCase() === "USDC",
            );
            if (polygonUsdc) {
              resolvedDepositAddress = polygonUsdc.depositAddress;
              console.log(
                "[DepositModal] Using Polygon USDC deposit address:",
                resolvedDepositAddress,
              );
            } else {
              // Last resort: any Polygon address
              const polygonAddr = addresses.find(
                (addr) => addr.chainId === "137",
              );
              if (polygonAddr) {
                resolvedDepositAddress = polygonAddr.depositAddress;
                console.log(
                  "[DepositModal] Using any Polygon deposit address:",
                  resolvedDepositAddress,
                );
              } else {
                console.error(
                  "[DepositModal] No Polygon deposit address found!",
                );
                setDepositError(
                  "No deposit address available for Polygon. Please try Transfer Crypto option.",
                );
              }
            }
          }
        } else {
          console.error(
            "[DepositModal] No deposit addresses returned from API",
          );
          setDepositError("Failed to get deposit addresses. Please try again.");
        }
      } catch (err) {
        console.error("[DepositModal] Failed to get deposit address:", err);
        setDepositError(
          err instanceof Error
            ? `Failed to get deposit address: ${err.message}`
            : "Failed to get deposit address. Please try again.",
        );
      } finally {
        setIsProcessing(false);
      }

      // Only advance if we successfully resolved a deposit address.
      // Otherwise we keep the user on token selection (broken flow if we proceed without it).
      if (!resolvedDepositAddress) return;

      setBridgeAddress(resolvedDepositAddress);
      setStep("amount");
    },
    [createDepositAddresses, proxyAddress],
  );

  // Handle bridge asset selection
  const handleSelectBridgeAsset = useCallback(
    async (asset: SupportedAsset) => {
      setSelectedBridgeAsset(asset);
      setIsProcessing(true);

      try {
        const addresses = await createDepositAddresses();
        if (addresses && addresses.length > 0) {
          const matching =
            addresses.find(
              (addr) =>
                addr.chainId === asset.chainId &&
                addr.tokenSymbol === asset.token.symbol,
            ) || addresses.find((addr) => addr.chainId === asset.chainId);

          if (matching) {
            setBridgeAddress(matching.depositAddress);
          }
        }
      } catch (err) {
        console.error("Failed to get bridge address:", err);
      } finally {
        setIsProcessing(false);
        setStep("confirm");
      }
    },
    [createDepositAddresses],
  );

  // Handle amount percentage buttons
  const handlePercentage = useCallback(
    (percent: number) => {
      if (!selectedToken) return;
      const value = (selectedToken.balance * percent) / 100;
      setAmount(
        value.toFixed(selectedToken.decimals > 6 ? 6 : selectedToken.decimals),
      );
    },
    [selectedToken],
  );

  // Handle copy bridge address
  const handleCopy = useCallback(() => {
    if (bridgeAddress) {
      navigator.clipboard.writeText(bridgeAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [bridgeAddress]);

  // Handle deposit transaction using viem directly
  const handleDeposit = useCallback(async () => {
    if (!selectedToken || !amount || !bridgeAddress) {
      setDepositError(
        "Missing required information. Please go back and try again.",
      );
      return;
    }

    if (typeof window === "undefined" || !window.ethereum) {
      setDepositError("No wallet detected. Please connect your wallet.");
      return;
    }

    setDepositError(null);
    setIsProcessing(true);
    setIsPending(true);
    setTxError(null);
    setIsConfirmed(false);

    try {
      const { createWalletClient, createPublicClient, custom, http } =
        await import("viem");

      const amountInWei = parseUnits(amount, selectedToken.decimals);

      // Create wallet client for sending transactions
      const walletClient = createWalletClient({
        chain: polygon,
        // biome-ignore lint/suspicious/noExplicitAny: window.ethereum type is not strictly typed
        transport: custom(window.ethereum as any),
      });

      // Request account access
      const [account] = await walletClient.requestAddresses();

      // Check if it's native token (POL/MATIC) or ERC20
      const isNativeToken =
        selectedToken.symbol === "POL" ||
        selectedToken.symbol === "MATIC" ||
        selectedToken.address ===
          "0x0000000000000000000000000000000000000000" ||
        selectedToken.address === "native";

      let hash: `0x${string}`;

      // Send to Polymarket's bridge deposit address (NOT directly to proxy wallet)
      // The bridge will automatically convert to USDC.e and credit the proxy wallet
      if (isNativeToken) {
        // Native token transfer to bridge address
        console.log(
          "[DepositModal] Sending native token to Polymarket Bridge:",
          {
            to: bridgeAddress,
            value: amountInWei.toString(),
            chainId: polygon.id,
          },
        );

        hash = await walletClient.sendTransaction({
          account,
          to: bridgeAddress as `0x${string}`,
          value: amountInWei,
          chain: polygon,
        });
      } else {
        // ERC20 token transfer to bridge address
        console.log(
          "[DepositModal] Sending ERC20 token to Polymarket Bridge:",
          {
            token: selectedToken.address,
            to: bridgeAddress,
            amount: amountInWei.toString(),
            chainId: polygon.id,
          },
        );

        hash = await walletClient.writeContract({
          account,
          address: selectedToken.address as `0x${string}`,
          abi: erc20Abi,
          functionName: "transfer",
          args: [bridgeAddress as `0x${string}`, amountInWei],
          chain: polygon,
        });
      }

      setIsPending(false);
      setIsConfirming(true);

      // Wait for transaction confirmation
      const publicClient = createPublicClient({
        chain: polygon,
        transport: http(),
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status === "success") {
        setIsConfirmed(true);
        setIsConfirming(false);
        console.log("[DepositModal] Transaction confirmed:", hash);
      } else {
        throw new Error("Transaction failed on-chain");
      }
    } catch (err) {
      console.error("[DepositModal] Deposit error:", err);
      setTxError(err instanceof Error ? err : new Error("Transaction failed"));
      setDepositError(
        err instanceof Error ? err.message : "Transaction failed",
      );
      setIsPending(false);
      setIsConfirming(false);
      setIsProcessing(false);
    }
  }, [selectedToken, amount, bridgeAddress]);

  // Handle back navigation
  const handleBack = useCallback(() => {
    if (step === "token" || step === "bridge-select") {
      setStep("method");
      setSelectedMethod(null);
      setSearchQuery("");
    } else if (step === "amount") {
      setStep("token");
      setSelectedToken(null);
      setAmount("");
    } else if (step === "confirm") {
      if (selectedMethod === "bridge") {
        setStep("bridge-select");
        setSelectedBridgeAsset(null);
        setBridgeAddress("");
      } else {
        setStep("amount");
      }
    }
  }, [step, selectedMethod]);

  // Calculate receive amount (simplified - assumes 1:1 for stablecoins)
  const receiveAmount = useMemo(() => {
    if (!amount || !selectedToken) return "0";
    const numAmount = Number.parseFloat(amount);
    if (Number.isNaN(numAmount)) return "0";

    // For stablecoins, 1:1. For others, use USD value
    if (["USDC", "USDC.e", "DAI", "USDT"].includes(selectedToken.symbol)) {
      return numAmount.toFixed(2);
    }
    // For other tokens, estimate based on USD value ratio
    const ratio = selectedToken.usdValue / selectedToken.balance;
    return (numAmount * ratio).toFixed(2);
  }, [amount, selectedToken]);

  // Validate amount
  const isValidAmount = useMemo(() => {
    if (!amount || !selectedToken) return false;
    const numAmount = Number.parseFloat(amount);
    return (
      !Number.isNaN(numAmount) &&
      numAmount > 0 &&
      numAmount <= selectedToken.balance
    );
  }, [amount, selectedToken]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md p-0 gap-0 overflow-hidden bg-background border-border"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* Header */}
        <DialogHeader className="p-4 pb-2 border-b border-border">
          <div className="flex items-center">
            {/* Back button - always takes space for alignment */}
            <div className="w-8">
              {step !== "method" && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-accent transition-colors"
                >
                  <ArrowLeft className="h-5 w-5 text-muted-foreground" />
                </button>
              )}
            </div>
            {/* Title - always centered */}
            <div className="flex-1 text-center">
              <DialogTitle className="text-lg font-semibold text-foreground">
                Deposit
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Polymarket Balance: ${polymarketBalance?.toFixed(2) || "0.00"}
              </DialogDescription>
            </div>
            {/* Spacer for symmetry */}
            <div className="w-8" />
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="p-4">
          <AnimatePresence mode="wait">
            {/* Step 1: Method Selection */}
            {step === "method" && (
              <motion.div
                key="method"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-2"
              >
                {/* Wallet Option */}
                <button
                  type="button"
                  onClick={(e) => handleSelectMethod("wallet", e)}
                  disabled={!isConnected}
                  className="w-full p-4 rounded-xl bg-gray-100 dark:bg-card hover:bg-gray-200 dark:hover:bg-accent border border-gray-200 dark:border-border transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center">
                        <span className="text-xl">🦊</span>
                      </div>
                      <div className="text-left">
                        <p className="font-medium text-foreground">
                          Wallet (
                          {address ? formatAddress(address) : "Not connected"})
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {walletTokens.length > 0
                            ? `$${walletTokens
                                .reduce((s, t) => s + t.usdValue, 0)
                                .toFixed(2)}`
                            : "Connect wallet"}{" "}
                          • Instant
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </div>
                </button>

                {/* Divider */}
                <div className="flex items-center gap-3 py-2">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground/70">more</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                {/* Transfer Crypto (Bridge) */}
                <button
                  type="button"
                  onClick={(e) => handleSelectMethod("bridge", e)}
                  className="w-full p-4 rounded-xl bg-gray-100 dark:bg-card hover:bg-gray-200 dark:hover:bg-accent border border-gray-200 dark:border-border transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                        <Zap className="h-5 w-5 text-blue-400" />
                      </div>
                      <div className="text-left">
                        <p className="font-medium text-foreground">
                          Transfer Crypto
                        </p>
                        <p className="text-sm text-muted-foreground">
                          No limit • Instant
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex -space-x-1">
                        {["⟠", "⬡", "🔷", "🔵"].map((icon, i) => (
                          <span
                            key={i}
                            className="w-5 h-5 rounded-full bg-gray-200 dark:bg-muted flex items-center justify-center text-xs border border-gray-300 dark:border-border"
                          >
                            {icon}
                          </span>
                        ))}
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </div>
                  </div>
                </button>

                {/* Card - Coming Soon */}
                <button
                  type="button"
                  disabled
                  className="w-full p-4 rounded-xl bg-gray-100 dark:bg-card border border-gray-200 dark:border-border opacity-60 cursor-not-allowed"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gray-200 dark:bg-muted/50 flex items-center justify-center">
                        <CreditCard className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="text-left">
                        <p className="font-medium text-foreground">
                          Deposit with Card
                        </p>
                        <p className="text-sm text-muted-foreground">
                          $50,000 • 5 min
                        </p>
                      </div>
                    </div>
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-200 dark:bg-muted text-muted-foreground">
                      Coming Soon
                    </span>
                  </div>
                </button>

                {/* Exchange - Coming Soon */}
                <button
                  type="button"
                  disabled
                  className="w-full p-4 rounded-xl bg-gray-100 dark:bg-card border border-gray-200 dark:border-border opacity-60 cursor-not-allowed"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gray-200 dark:bg-muted/50 flex items-center justify-center">
                        <RefreshCw className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="text-left">
                        <p className="font-medium text-foreground">
                          Connect Exchange
                        </p>
                        <p className="text-sm text-muted-foreground">
                          No limit • 2 min
                        </p>
                      </div>
                    </div>
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-200 dark:bg-muted text-muted-foreground">
                      Coming Soon
                    </span>
                  </div>
                </button>

                {/* PayPal - Coming Soon */}
                <button
                  type="button"
                  disabled
                  className="w-full p-4 rounded-xl bg-gray-100 dark:bg-card border border-gray-200 dark:border-border opacity-60 cursor-not-allowed"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center">
                        <span className="text-lg font-bold text-blue-400">
                          P
                        </span>
                      </div>
                      <div className="text-left">
                        <p className="font-medium text-foreground">
                          Deposit with PayPal
                        </p>
                        <p className="text-sm text-muted-foreground">
                          $10,000 • 5 min
                        </p>
                      </div>
                    </div>
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-200 dark:bg-muted text-muted-foreground">
                      Coming Soon
                    </span>
                  </div>
                </button>
              </motion.div>
            )}

            {/* Step 2a: Token Selection (Wallet) */}
            {step === "token" && (
              <motion.div
                key="token"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-3"
              >
                {loadingTokens ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                  </div>
                ) : walletTokens.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground mb-2">
                      No tokens found
                    </p>
                    <p className="text-sm text-muted-foreground/70">
                      Your wallet doesn't have any supported tokens on Polygon
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={refreshTokens}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Refresh
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* Minimum deposit info */}
                    <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-3">
                      <div className="flex items-center gap-2">
                        <Info className="h-3.5 w-3.5 text-amber-400" />
                        <p className="text-xs text-muted-foreground">
                          Minimum deposit varies by token (typically{" "}
                          <span className="text-amber-400 font-medium">
                            ${defaultMinDeposit}+
                          </span>
                          )
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {walletTokens.map((token) => {
                        // Get dynamic minimum from supported assets API
                        const minDeposit = getMinDepositForToken(token.symbol);
                        const isBelowMinimum = token.usdValue < minDeposit;
                        return (
                          <button
                            key={token.address}
                            type="button"
                            onClick={() =>
                              !isBelowMinimum && handleSelectToken(token)
                            }
                            disabled={isBelowMinimum}
                            className={`w-full p-3 rounded-xl border transition-all ${
                              isBelowMinimum
                                ? "bg-gray-100 dark:bg-card border-gray-200 dark:border-border opacity-50 cursor-not-allowed"
                                : "bg-gray-100 dark:bg-card border-blue-500/30 hover:border-blue-500/50 cursor-pointer"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-muted flex items-center justify-center overflow-hidden">
                                  {token.logoUrl ? (
                                    <Image
                                      src={token.logoUrl}
                                      alt={token.symbol}
                                      width={36}
                                      height={36}
                                      className="w-full h-full object-cover"
                                      unoptimized
                                    />
                                  ) : (
                                    <span className="text-sm font-medium">
                                      {token.symbol.slice(0, 2)}
                                    </span>
                                  )}
                                </div>
                                <div className="text-left">
                                  <p className="font-medium text-foreground">
                                    {token.symbol}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {token.balance.toFixed(5)} {token.symbol}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right flex items-center gap-2">
                                {isBelowMinimum && (
                                  <span className="text-xs text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded">
                                    Min ${minDeposit}
                                  </span>
                                )}
                                <span
                                  className={`font-medium ${
                                    isBelowMinimum
                                      ? "text-muted-foreground"
                                      : "text-foreground"
                                  }`}
                                >
                                  ${token.usdValue.toFixed(2)}
                                </span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </motion.div>
            )}

            {/* Step 2b: Bridge Asset Selection */}
            {step === "bridge-select" && (
              <motion.div
                key="bridge-select"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-3"
              >
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
                  <input
                    type="text"
                    placeholder="Search chain or token..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full h-10 pl-10 pr-4 rounded-xl bg-gray-100 dark:bg-card border border-gray-200 dark:border-border focus:border-blue-500/50 focus:outline-none text-sm text-foreground placeholder:text-muted-foreground/70"
                  />
                </div>

                {/* Info */}
                <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <div className="flex items-center gap-2">
                    <Info className="h-3.5 w-3.5 text-blue-400" />
                    <p className="text-xs text-muted-foreground">
                      All deposits convert to{" "}
                      <span className="text-blue-400">USDC.e on Polygon</span>
                    </p>
                  </div>
                </div>

                {/* Assets List */}
                {loadingBridge ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                    {filteredBridgeAssets.map((asset) => {
                      const config = getChainConfig(asset.chainId);
                      return (
                        <button
                          key={`${asset.chainId}-${asset.token.symbol}-${asset.token.address}`}
                          type="button"
                          onClick={() => handleSelectBridgeAsset(asset)}
                          disabled={isProcessing}
                          className="w-full p-3 rounded-xl bg-gray-100 dark:bg-card border border-gray-200 dark:border-border hover:border-blue-500/30 transition-all group"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-9 h-9 rounded-lg bg-linear-to-br ${config.gradient} flex items-center justify-center text-lg`}
                              >
                                {config.icon}
                              </div>
                              <div className="text-left">
                                <p className="font-medium text-foreground">
                                  {asset.token.symbol}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {asset.chainName}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground/70">
                                Min ${asset.minCheckoutUsd}
                              </span>
                              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}

            {/* Step 3: Amount Input */}
            {step === "amount" && selectedToken && (
              <motion.div
                key="amount"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                {/* Amount Display */}
                <div className="text-center py-8">
                  <div className="flex items-center justify-center gap-1">
                    <span className="text-4xl font-bold text-primary">$</span>
                    <input
                      type="text"
                      value={amount}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9.]/g, "");
                        setAmount(val);
                      }}
                      placeholder="0.00"
                      className="text-5xl font-bold text-primary bg-transparent border-none outline-none w-48 text-center placeholder:text-muted-foreground/50"
                    />
                  </div>
                </div>

                {/* Percentage Buttons */}
                <div className="flex justify-center gap-2">
                  {[25, 50, 75, 100].map((percent) => (
                    <button
                      key={percent}
                      type="button"
                      onClick={() => handlePercentage(percent)}
                      className="px-4 py-2 rounded-full bg-gray-100 dark:bg-card hover:bg-gray-200 dark:hover:bg-accent text-sm font-medium text-foreground border border-gray-200 dark:border-border transition-colors"
                    >
                      {percent === 100 ? "Max" : `${percent}%`}
                    </button>
                  ))}
                </div>

                {/* Token Info */}
                <div className="flex items-center justify-center gap-2 p-3 rounded-xl bg-gray-100 dark:bg-card border border-gray-200 dark:border-border">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-muted flex items-center justify-center overflow-hidden">
                      {selectedToken.logoUrl ? (
                        <Image
                          src={selectedToken.logoUrl}
                          alt={selectedToken.symbol}
                          width={24}
                          height={24}
                          className="w-full h-full object-cover"
                          unoptimized
                        />
                      ) : (
                        <span className="text-xs">
                          {selectedToken.symbol.slice(0, 2)}
                        </span>
                      )}
                    </div>
                    <span className="text-sm text-muted-foreground">
                      You send
                    </span>
                    <span className="font-medium text-foreground">
                      {selectedToken.symbol}
                    </span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground/70" />
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center">
                      <span className="text-xs">$</span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      You receive
                    </span>
                    <span className="font-medium text-foreground">USDC</span>
                  </div>
                </div>

                {/* Continue Button */}
                <Button
                  onClick={() => setStep("confirm")}
                  disabled={!isValidAmount}
                  className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue
                </Button>
              </motion.div>
            )}

            {/* Step 4: Confirmation */}
            {step === "confirm" && (
              <motion.div
                key="confirm"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                {selectedMethod === "bridge" && selectedBridgeAsset ? (
                  // Bridge confirmation - show deposit address
                  <>
                    <div className="text-center py-4">
                      <p className="text-3xl font-bold text-primary">
                        Deposit {selectedBridgeAsset.token.symbol}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        on {selectedBridgeAsset.chainName}
                      </p>
                    </div>

                    {isProcessing ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      </div>
                    ) : bridgeAddress ? (
                      <>
                        {/* Deposit Address */}
                        <div className="p-4 rounded-xl bg-gray-100 dark:bg-card border border-gray-200 dark:border-border">
                          <p className="text-xs text-muted-foreground mb-2">
                            Send {selectedBridgeAsset.token.symbol} to this
                            address
                          </p>
                          <div className="flex items-center gap-2">
                            <code className="flex-1 text-sm font-mono break-all text-foreground">
                              {bridgeAddress}
                            </code>
                            <button
                              type="button"
                              onClick={handleCopy}
                              className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-accent transition-colors"
                            >
                              {copied ? (
                                <Check className="h-4 w-4 text-green-500" />
                              ) : (
                                <Copy className="h-4 w-4 text-muted-foreground" />
                              )}
                            </button>
                          </div>
                        </div>

                        <Button
                          onClick={handleCopy}
                          className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-xl"
                        >
                          {copied ? "Address Copied!" : "Copy Deposit Address"}
                        </Button>

                        {/* Info */}
                        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                          <div className="flex items-start gap-2">
                            <Info className="h-4 w-4 text-amber-400 mt-0.5" />
                            <div className="text-xs text-muted-foreground">
                              <p className="font-medium text-amber-400">
                                Minimum: ${selectedBridgeAsset.minCheckoutUsd}
                              </p>
                              <p>
                                Assets will be converted to USDC.e on Polygon.
                              </p>
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        Failed to get deposit address. Please try again.
                      </div>
                    )}
                  </>
                ) : selectedToken ? (
                  // Wallet confirmation - using Polymarket Bridge
                  <>
                    {/* Amount */}
                    <div className="text-center py-4">
                      <p className="text-4xl font-bold text-primary">
                        ${Number.parseFloat(amount || "0").toFixed(2)}
                      </p>
                    </div>

                    {/* Bridge Info Banner */}
                    <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                      <div className="flex items-start gap-2">
                        <Zap className="h-4 w-4 text-blue-400 mt-0.5" />
                        <div className="text-xs text-muted-foreground">
                          <p className="font-medium text-blue-400">
                            Auto-conversion to USDC.e
                          </p>
                          <p>
                            Your {selectedToken.symbol} will be automatically
                            converted to USDC.e on Polygon via Polymarket
                            Bridge.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Details */}
                    <div className="space-y-3 p-4 rounded-xl bg-gray-100 dark:bg-card border border-gray-200 dark:border-border">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Source</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xl">🦊</span>
                          <span className="text-foreground">
                            Wallet ({address ? formatAddress(address) : ""})
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Via</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xl">🌉</span>
                          <span className="text-foreground">
                            Polymarket Bridge
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">
                          Destination
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xl">📊</span>
                          <span className="text-foreground">
                            Polymarket Wallet
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">
                          Estimated time
                        </span>
                        <div className="flex items-center gap-1">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span className="text-foreground">&lt; 2 min</span>
                        </div>
                      </div>
                    </div>

                    {/* Transaction Breakdown */}
                    <div className="space-y-2 p-4 rounded-xl bg-gray-100 dark:bg-card border border-gray-200 dark:border-border">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">You send</span>
                        <span className="text-foreground">
                          {amount} {selectedToken.symbol}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">
                          You receive (approx)
                        </span>
                        <span className="text-foreground">
                          ~{receiveAmount} USDC.e
                        </span>
                      </div>
                      <div className="border-t border-border pt-2 mt-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground/70">
                            Network cost
                          </span>
                          <span className="text-muted-foreground">~$0.01</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground/70">
                            Bridge fee
                          </span>
                          <span className="text-muted-foreground">~0.1%</span>
                        </div>
                      </div>
                    </div>

                    {/* Error Message */}
                    {depositError && (
                      <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                        <p className="text-sm text-red-500">{depositError}</p>
                      </div>
                    )}

                    {/* No Bridge Address Warning */}
                    {!bridgeAddress && !isProcessing && (
                      <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                        <div className="flex items-center gap-2">
                          <Info className="h-4 w-4 text-amber-400" />
                          <p className="text-sm text-amber-400">
                            Failed to get bridge address. Please go back and try
                            again.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Success Message */}
                    {isConfirmed && (
                      <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                        <div className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-green-500" />
                          <div className="text-sm text-green-500">
                            <p className="font-medium">
                              Transaction confirmed!
                            </p>
                            <p className="text-xs text-green-400">
                              USDC.e will be credited to your Polymarket wallet
                              shortly.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Terms */}
                    <p className="text-xs text-muted-foreground/70 text-center">
                      By clicking Confirm Order, you agree to our{" "}
                      <span className="text-primary cursor-pointer hover:underline">
                        terms
                      </span>
                      .
                    </p>

                    {/* Confirm Button */}
                    <Button
                      onClick={handleDeposit}
                      disabled={
                        !bridgeAddress ||
                        isProcessing ||
                        isPending ||
                        isConfirming ||
                        isConfirmed
                      }
                      className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-xl disabled:opacity-50"
                    >
                      {isPending ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Confirm in Wallet...
                        </span>
                      ) : isConfirming ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Confirming...
                        </span>
                      ) : isConfirmed ? (
                        <span className="flex items-center gap-2">
                          <Check className="h-4 w-4" />
                          Deposit Complete!
                        </span>
                      ) : !bridgeAddress ? (
                        "Loading Bridge..."
                      ) : (
                        "Confirm Order"
                      )}
                    </Button>
                  </>
                ) : null}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}
