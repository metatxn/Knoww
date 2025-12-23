"use client";

import { AnimatePresence } from "framer-motion";
import { ArrowLeft, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { erc20Abi, parseUnits } from "viem";
import { polygon } from "viem/chains";
import { useConnection } from "wagmi";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { type SupportedAsset, useBridge } from "@/hooks/use-bridge";
import { useProxyWallet } from "@/hooks/use-proxy-wallet";
import { type TokenBalance, useWalletTokens } from "@/hooks/use-wallet-tokens";
import { AmountInput } from "./deposit/amount-input";
import { BridgeSelection } from "./deposit/bridge-selection";
import { Confirmation } from "./deposit/confirmation";
import { MethodSelection } from "./deposit/method-selection";
import { TokenSelection } from "./deposit/token-selection";
import type { DepositMethod, DepositStep } from "./deposit/types";

interface DepositModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CHAIN_CONFIG: Record<string, { icon: string; gradient: string }> = {
  "137": { icon: "⬡", gradient: "from-purple-500 to-violet-600" },
  "1": { icon: "⟠", gradient: "from-blue-500 to-indigo-600" },
  "42161": { icon: "🔷", gradient: "from-sky-400 to-blue-600" },
  "8453": { icon: "🔵", gradient: "from-blue-500 to-blue-700" },
  "10": { icon: "🔴", gradient: "from-red-500 to-rose-600" },
  "43114": { icon: "🔺", gradient: "from-red-500 to-red-700" },
  "56": { icon: "⛓️", gradient: "from-yellow-400 to-amber-600" },
};

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

  const [isPending, setIsPending] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [txError, setTxError] = useState<Error | null>(null);

  const [step, setStep] = useState<DepositStep>("method");
  const [selectedMethod, setSelectedMethod] = useState<DepositMethod | null>(
    null
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

  useEffect(() => {
    if (isConfirmed) {
      setIsProcessing(false);
      refreshTokens();
      setTimeout(() => onOpenChange(false), 1500);
    }
  }, [isConfirmed, refreshTokens, onOpenChange]);

  useEffect(() => {
    if (txError) {
      setDepositError(txError?.message || "Transaction failed");
      setIsProcessing(false);
    }
  }, [txError]);

  useEffect(() => {
    if (
      open &&
      (step === "bridge-select" || step === "token") &&
      supportedAssets.length === 0
    ) {
      getSupportedAssets();
    }
  }, [open, step, supportedAssets.length, getSupportedAssets]);

  const getMinDepositForToken = useCallback(
    (tokenSymbol: string): number => {
      const matchingAssets = supportedAssets.filter(
        (asset) =>
          asset.token.symbol.toUpperCase() === tokenSymbol.toUpperCase() ||
          (tokenSymbol.toUpperCase() === "USDC.E" &&
            asset.token.symbol.toUpperCase() === "USDC") ||
          (tokenSymbol.toUpperCase() === "USDC" &&
            asset.token.symbol.toUpperCase() === "USDC")
      );
      if (matchingAssets.length === 0) return 45;
      return Math.min(...matchingAssets.map((a) => a.minCheckoutUsd));
    },
    [supportedAssets]
  );

  const defaultMinDeposit = useMemo(() => {
    if (supportedAssets.length === 0) return 45;
    return Math.min(...supportedAssets.map((a) => a.minCheckoutUsd));
  }, [supportedAssets]);

  const filteredBridgeAssets = useMemo(() => {
    if (!searchQuery.trim()) return supportedAssets;
    const query = searchQuery.toLowerCase();
    return supportedAssets.filter(
      (asset) =>
        asset.token.symbol.toLowerCase().includes(query) ||
        asset.token.name.toLowerCase().includes(query) ||
        asset.chainName.toLowerCase().includes(query)
    );
  }, [supportedAssets, searchQuery]);

  const handleSelectMethod = useCallback(
    (method: DepositMethod, e?: React.MouseEvent) => {
      e?.preventDefault();
      e?.stopPropagation();
      setSelectedMethod(method);
      if (method === "wallet") setStep("token");
      else if (method === "bridge") setStep("bridge-select");
    },
    []
  );

  const handleSelectToken = useCallback(
    async (token: TokenBalance) => {
      setSelectedToken(token);
      setIsProcessing(true);
      setDepositError(null);
      setBridgeAddress("");
      let resolvedDepositAddress = "";

      try {
        const addresses = await createDepositAddresses();
        if (addresses && addresses.length > 0) {
          const matching = addresses.find(
            (addr) =>
              addr.chainId === "137" &&
              addr.tokenSymbol.toUpperCase() === token.symbol.toUpperCase()
          );
          if (matching) resolvedDepositAddress = matching.depositAddress;
          else {
            const polygonUsdc = addresses.find(
              (addr) =>
                addr.chainId === "137" &&
                addr.tokenSymbol.toUpperCase() === "USDC"
            );
            if (polygonUsdc)
              resolvedDepositAddress = polygonUsdc.depositAddress;
            else {
              const polygonAddr = addresses.find(
                (addr) => addr.chainId === "137"
              );
              if (polygonAddr)
                resolvedDepositAddress = polygonAddr.depositAddress;
              else setDepositError("No deposit address available for Polygon.");
            }
          }
        } else setDepositError("Failed to get deposit addresses.");
      } catch (err) {
        setDepositError(
          err instanceof Error ? err.message : "Failed to get deposit address."
        );
      } finally {
        setIsProcessing(false);
      }

      if (!resolvedDepositAddress) return;
      setBridgeAddress(resolvedDepositAddress);
      setStep("amount");
    },
    [createDepositAddresses]
  );

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
                addr.tokenSymbol === asset.token.symbol
            ) || addresses.find((addr) => addr.chainId === asset.chainId);
          if (matching) setBridgeAddress(matching.depositAddress);
        }
      } catch (err) {
        console.error("Failed to get bridge address:", err);
      } finally {
        setIsProcessing(false);
        setStep("confirm");
      }
    },
    [createDepositAddresses]
  );

  const handlePercentage = useCallback(
    (percent: number) => {
      if (!selectedToken) return;
      const value = (selectedToken.balance * percent) / 100;
      setAmount(
        value.toFixed(selectedToken.decimals > 6 ? 6 : selectedToken.decimals)
      );
    },
    [selectedToken]
  );

  const handleCopy = useCallback(() => {
    if (bridgeAddress) {
      navigator.clipboard.writeText(bridgeAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [bridgeAddress]);

  const handleDeposit = useCallback(async () => {
    if (!selectedToken || !amount || !bridgeAddress) return;
    if (typeof window === "undefined" || !window.ethereum) return;

    setDepositError(null);
    setIsProcessing(true);
    setIsPending(true);
    setTxError(null);
    setIsConfirmed(false);

    try {
      const { createWalletClient, createPublicClient, custom, http } =
        await import("viem");
      const amountInWei = parseUnits(amount, selectedToken.decimals);
      const walletClient = createWalletClient({
        chain: polygon,
        transport: custom(window.ethereum as any),
      });
      const [account] = await walletClient.requestAddresses();
      const isNativeToken =
        selectedToken.symbol === "POL" ||
        selectedToken.symbol === "MATIC" ||
        selectedToken.address ===
          "0x0000000000000000000000000000000000000000" ||
        selectedToken.address === "native";

      let hash: `0x${string}`;
      if (isNativeToken) {
        hash = await walletClient.sendTransaction({
          account,
          to: bridgeAddress as `0x${string}`,
          value: amountInWei,
          chain: polygon,
        });
      } else {
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
      const publicClient = createPublicClient({
        chain: polygon,
        transport: http(),
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === "success") setIsConfirmed(true);
      else throw new Error("Transaction failed on-chain");
    } catch (err) {
      setTxError(err instanceof Error ? err : new Error("Transaction failed"));
      setIsProcessing(false);
    } finally {
      setIsPending(false);
      setIsConfirming(false);
    }
  }, [selectedToken, amount, bridgeAddress]);

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
      } else setStep("amount");
    }
  }, [step, selectedMethod]);

  const receiveAmount = useMemo(() => {
    if (!amount || !selectedToken) return "0";
    const numAmount = Number.parseFloat(amount);
    if (Number.isNaN(numAmount)) return "0";
    if (["USDC", "USDC.e", "DAI", "USDT"].includes(selectedToken.symbol))
      return numAmount.toFixed(2);
    const ratio = selectedToken.usdValue / selectedToken.balance;
    return (numAmount * ratio).toFixed(2);
  }, [amount, selectedToken]);

  const enteredAmountUsd = useMemo(() => {
    if (!amount || !selectedToken) return 0;
    const numAmount = Number.parseFloat(amount);
    if (Number.isNaN(numAmount)) return 0;
    if (["USDC", "USDC.e", "DAI", "USDT"].includes(selectedToken.symbol))
      return numAmount;
    const ratio = selectedToken.usdValue / selectedToken.balance;
    return numAmount * ratio;
  }, [amount, selectedToken]);

  const selectedTokenMinDeposit = useMemo(() => {
    if (!selectedToken) return defaultMinDeposit;
    return getMinDepositForToken(selectedToken.symbol);
  }, [selectedToken, defaultMinDeposit, getMinDepositForToken]);

  const isBelowMinimum = useMemo(() => {
    if (!amount || enteredAmountUsd === 0) return false;
    return enteredAmountUsd < selectedTokenMinDeposit;
  }, [amount, enteredAmountUsd, selectedTokenMinDeposit]);

  const isValidAmount = useMemo(() => {
    if (!amount || !selectedToken) return false;
    const numAmount = Number.parseFloat(amount);
    if (Number.isNaN(numAmount) || numAmount <= 0) return false;
    if (numAmount > selectedToken.balance) return false;
    if (isBelowMinimum) return false;
    return true;
  }, [amount, selectedToken, isBelowMinimum]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-[420px] p-0 gap-0 overflow-hidden bg-background border-border"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <div className="relative h-[68px] border-b border-border flex items-center justify-between px-4 shrink-0">
          <div className="w-8 flex items-center justify-start">
            {step !== "method" && (
              <button
                type="button"
                onClick={handleBack}
                className="p-1.5 -ml-1.5 rounded-full hover:bg-secondary/80 transition-colors"
                aria-label="Go back"
              >
                <ArrowLeft className="h-5 w-5 text-foreground" />
              </button>
            )}
          </div>
          <div className="flex flex-col items-center justify-center flex-1 min-w-0">
            <DialogTitle className="text-[17px] font-semibold text-foreground tracking-tight">
              Deposit
            </DialogTitle>
            <DialogDescription className="text-[11px] text-muted-foreground font-medium mt-0.5">
              Balance: ${polymarketBalance?.toFixed(2) || "0.00"}
            </DialogDescription>
          </div>
          <div className="w-8 flex items-center justify-end">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="p-1.5 -mr-1.5 rounded-full hover:bg-secondary/80 transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="p-4 max-h-[calc(100vh-120px)] overflow-y-auto">
          <AnimatePresence mode="wait">
            {step === "method" && (
              <MethodSelection
                isConnected={isConnected}
                address={address}
                walletTokens={walletTokens}
                onSelectMethod={handleSelectMethod}
              />
            )}
            {step === "token" && (
              <TokenSelection
                isLoading={loadingTokens}
                walletTokens={walletTokens}
                defaultMinDeposit={defaultMinDeposit}
                onRefresh={refreshTokens}
                onSelectToken={handleSelectToken}
                getMinDepositForToken={getMinDepositForToken}
              />
            )}
            {step === "bridge-select" && (
              <BridgeSelection
                isLoading={loadingBridge}
                searchQuery={searchQuery}
                filteredBridgeAssets={filteredBridgeAssets}
                isProcessing={isProcessing}
                onSearchChange={setSearchQuery}
                onSelectAsset={handleSelectBridgeAsset}
                getChainConfig={(chainId) =>
                  CHAIN_CONFIG[chainId] || {
                    icon: "🔗",
                    gradient: "from-gray-400 to-gray-600",
                  }
                }
              />
            )}
            {step === "amount" && selectedToken && (
              <AmountInput
                amount={amount}
                selectedToken={selectedToken}
                isBelowMinimum={isBelowMinimum}
                selectedTokenMinDeposit={selectedTokenMinDeposit}
                enteredAmountUsd={enteredAmountUsd}
                isValidAmount={isValidAmount}
                onAmountChange={setAmount}
                onPercentage={handlePercentage}
                onContinue={() => setStep("confirm")}
              />
            )}
            {step === "confirm" && (
              <Confirmation
                selectedMethod={selectedMethod}
                selectedBridgeAsset={selectedBridgeAsset}
                selectedToken={selectedToken}
                isProcessing={isProcessing}
                bridgeAddress={bridgeAddress}
                amount={amount}
                address={address}
                receiveAmount={receiveAmount}
                depositError={depositError}
                isPending={isPending}
                isConfirming={isConfirming}
                isConfirmed={isConfirmed}
                copied={copied}
                onCopy={handleCopy}
                onDeposit={handleDeposit}
              />
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}
