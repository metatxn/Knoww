"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Loader2,
  Shield,
  Wallet,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useAppKit } from "@reown/appkit/react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useRelayerClient } from "@/hooks/use-relayer-client";
import { useClobCredentials } from "@/hooks/use-clob-credentials";
import { useProxyWallet } from "@/hooks/use-proxy-wallet";

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  status: "pending" | "in_progress" | "completed" | "error";
  errorMessage?: string;
}

interface TradingOnboardingProps {
  onComplete?: () => void;
  onSkip?: () => void;
}

export function TradingOnboarding({
  onComplete,
  onSkip,
}: TradingOnboardingProps) {
  const { isConnected } = useAccount();
  const { open } = useAppKit();
  const {
    deploySafe,
    approveUsdcForTrading,
    isLoading: isRelayerLoading,
    proxyAddress: relayerProxyAddress,
    hasDeployedSafe,
  } = useRelayerClient();
  const {
    deriveCredentials,
    hasCredentials,
    isLoading: isClobLoading,
  } = useClobCredentials();
  const {
    isDeployed: hasProxyWalletFromHook,
    refresh: refreshProxyWallet,
    proxyAddress: computedProxyAddress,
  } = useProxyWallet();

  // Use relayer state as primary source (most reliable after deployment)
  const hasProxyWallet = hasDeployedSafe || hasProxyWalletFromHook;
  const proxyAddress = relayerProxyAddress || computedProxyAddress;

  const [currentStep, setCurrentStep] = useState(0);
  const [steps, setSteps] = useState<OnboardingStep[]>([
    {
      id: "connect",
      title: "Connect Wallet",
      description: "Connect your wallet to get started",
      icon: <Wallet className="h-5 w-5" />,
      status: "pending",
    },
    {
      id: "deploy",
      title: "Create Trading Wallet",
      description: "Create a secure Polymarket Safe wallet (gasless, no fees)",
      icon: <Shield className="h-5 w-5" />,
      status: "pending",
    },
    {
      id: "approve",
      title: "Enable USDC Trading",
      description: "Allow Polymarket to use your USDC.e for trades (gasless)",
      icon: <Zap className="h-5 w-5" />,
      status: "pending",
    },
    {
      id: "credentials",
      title: "Setup API Access",
      description: "Sign a message to generate your trading credentials",
      icon: <CheckCircle2 className="h-5 w-5" />,
      status: "pending",
    },
  ]);

  const updateStepStatus = useCallback(
    (
      stepId: string,
      status: OnboardingStep["status"],
      errorMessage?: string
    ) => {
      setSteps((prev) =>
        prev.map((step) =>
          step.id === stepId ? { ...step, status, errorMessage } : step
        )
      );
    },
    []
  );

  const handleConnectWallet = useCallback(async () => {
    updateStepStatus("connect", "in_progress");
    try {
      await open();
      // The wallet connection is handled by the modal
      // We'll check isConnected in the next render
    } catch {
      updateStepStatus("connect", "error", "Failed to connect wallet");
    }
  }, [open, updateStepStatus]);

  const handleDeploySafe = useCallback(async () => {
    updateStepStatus("deploy", "in_progress");
    try {
      const result = await deploySafe();
      if (result.success) {
        updateStepStatus("deploy", "completed");
        setCurrentStep(2);
        // Refresh proxy wallet state to pick up the new address
        await refreshProxyWallet();
      } else {
        updateStepStatus("deploy", "error", result.error);
      }
    } catch (err) {
      updateStepStatus(
        "deploy",
        "error",
        err instanceof Error ? err.message : "Failed to deploy wallet"
      );
    }
  }, [deploySafe, updateStepStatus, refreshProxyWallet]);

  const handleApproveUsdc = useCallback(async () => {
    updateStepStatus("approve", "in_progress");
    try {
      const result = await approveUsdcForTrading();
      if (result.success) {
        updateStepStatus("approve", "completed");
        setCurrentStep(3);
      } else {
        updateStepStatus("approve", "error", result.error);
      }
    } catch (err) {
      updateStepStatus(
        "approve",
        "error",
        err instanceof Error ? err.message : "Failed to approve USDC"
      );
    }
  }, [approveUsdcForTrading, updateStepStatus]);

  const handleDeriveCredentials = useCallback(async () => {
    updateStepStatus("credentials", "in_progress");
    try {
      await deriveCredentials();
      updateStepStatus("credentials", "completed");
      onComplete?.();
    } catch (err) {
      updateStepStatus(
        "credentials",
        "error",
        err instanceof Error ? err.message : "Failed to setup credentials"
      );
    }
  }, [deriveCredentials, updateStepStatus, onComplete]);

  // Update connect step when wallet connects
  useEffect(() => {
    if (isConnected && steps[0].status !== "completed") {
      updateStepStatus("connect", "completed");
      setCurrentStep(1);
    }
  }, [isConnected, steps, updateStepStatus]);

  // Update deploy and approve steps if proxy wallet is already deployed
  useEffect(() => {
    if (hasProxyWallet) {
      if (steps[1].status !== "completed") {
        updateStepStatus("deploy", "completed");
      }
      if (steps[2].status !== "completed") {
        updateStepStatus("approve", "completed");
      }
      // Move to credentials step if we're still on earlier steps
      if (currentStep < 3) {
        setCurrentStep(3);
      }
    }
  }, [hasProxyWallet, steps, currentStep, updateStepStatus]);

  // Update credentials step if already has credentials (but DON'T auto-close)
  useEffect(() => {
    if (hasCredentials && steps[3].status !== "completed") {
      updateStepStatus("credentials", "completed");
      // Don't auto-close - let user see the completed state or continue with other steps
    }
  }, [hasCredentials, steps, updateStepStatus]);

  // Check if all steps are complete
  const allStepsComplete = steps.every((s) => s.status === "completed");

  const isLoading = isRelayerLoading || isClobLoading;
  const completedSteps = steps.filter((s) => s.status === "completed").length;
  const progress = (completedSteps / steps.length) * 100;

  const getStepAction = (step: OnboardingStep, index: number) => {
    if (step.status === "completed") {
      return (
        <CheckCircle2 className="h-5 w-5 text-green-500 dark:text-green-400" />
      );
    }

    if (step.status === "in_progress") {
      return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
    }

    if (step.status === "error") {
      return <AlertCircle className="h-5 w-5 text-destructive" />;
    }

    if (index !== currentStep) {
      return <ChevronRight className="h-5 w-5 text-muted-foreground" />;
    }

    // Current step actions
    switch (step.id) {
      case "connect":
        return (
          <Button size="sm" onClick={handleConnectWallet} disabled={isLoading}>
            Connect
          </Button>
        );
      case "deploy":
        return (
          <Button size="sm" onClick={handleDeploySafe} disabled={isLoading}>
            Deploy
          </Button>
        );
      case "approve":
        return (
          <Button size="sm" onClick={handleApproveUsdc} disabled={isLoading}>
            Approve
          </Button>
        );
      case "credentials":
        return (
          <Button
            size="sm"
            onClick={handleDeriveCredentials}
            disabled={isLoading}
          >
            Setup
          </Button>
        );
      default:
        return null;
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="space-y-1">
        <CardTitle className="text-xl">Setup Trading</CardTitle>
        <CardDescription>
          Complete these steps to start trading on Polymarket
        </CardDescription>
        <Progress value={progress} className="h-2 mt-2" />
      </CardHeader>

      <CardContent className="space-y-4">
        <AnimatePresence>
          {steps.map((step, index) => (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ delay: index * 0.1 }}
              className={`flex items-center gap-4 p-3 rounded-lg border transition-colors ${
                index === currentStep
                  ? "border-primary bg-primary/5"
                  : step.status === "completed"
                  ? "border-green-500/30 bg-green-500/5"
                  : step.status === "error"
                  ? "border-destructive/30 bg-destructive/5"
                  : "border-border"
              }`}
            >
              {/* Step Icon */}
              <div
                className={`flex items-center justify-center w-10 h-10 rounded-full ${
                  step.status === "completed"
                    ? "bg-green-500/20 text-green-600 dark:text-green-400"
                    : step.status === "error"
                    ? "bg-destructive/20 text-destructive"
                    : index === currentStep
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {step.icon}
              </div>

              {/* Step Info */}
              <div className="flex-1 min-w-0">
                <p
                  className={`font-medium text-sm ${
                    step.status === "completed"
                      ? "text-green-600 dark:text-green-400"
                      : step.status === "error"
                      ? "text-destructive"
                      : ""
                  }`}
                >
                  {step.title}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {step.errorMessage || step.description}
                </p>
              </div>

              {/* Step Action */}
              <div className="shrink-0">{getStepAction(step, index)}</div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Proxy Address Display */}
        {proxyAddress && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20"
          >
            <p className="text-xs text-muted-foreground mb-1">
              Your Polymarket Wallet
            </p>
            <a
              href={`https://polygonscan.com/address/${proxyAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-mono text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1"
            >
              {proxyAddress.slice(0, 10)}...{proxyAddress.slice(-8)}
              <ExternalLink className="h-3 w-3" />
            </a>
          </motion.div>
        )}

        {/* Info Box */}
        <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <p className="text-xs text-blue-600 dark:text-blue-400">
            <strong>💡 Gasless Setup:</strong> All setup transactions are free!
            Polymarket covers the gas fees through their relayer.
          </p>
        </div>

        {/* Done Button - show when all steps complete */}
        {allStepsComplete && (
          <Button
            className="w-full bg-green-600 hover:bg-green-700"
            onClick={onComplete}
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Done - Start Trading!
          </Button>
        )}

        {/* Skip Option - only show if not all complete */}
        {onSkip && !allStepsComplete && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground"
            onClick={onSkip}
          >
            Skip for now
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
