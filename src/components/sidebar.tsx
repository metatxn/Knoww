"use client";

import { useAppKit } from "@reown/appkit/react";
import {
  BarChart3,
  Bitcoin,
  Briefcase,
  Building2,
  ChevronDown,
  Copy,
  DollarSign,
  ExternalLink,
  Globe,
  Landmark,
  LayoutGrid,
  LogOut,
  MessageSquare,
  Newspaper,
  Rocket,
  Settings,
  Trophy,
  User,
  Vote,
  Wallet,
  Zap,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAccount, useDisconnect } from "wagmi";
import { ThemeToggle } from "@/components/theme-toggle";
import { TradingOnboarding } from "@/components/trading-onboarding";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useClobCredentials } from "@/hooks/use-clob-credentials";
import { useProxyWallet } from "@/hooks/use-proxy-wallet";
import { useRelayerClient } from "@/hooks/use-relayer-client";

// Categories with icons
const categories = [
  { label: "Politics", href: "/events/politics", icon: Landmark },
  { label: "Sports", href: "/events/sports", icon: Trophy },
  { label: "Crypto", href: "/events/crypto", icon: Bitcoin },
  { label: "Finance", href: "/events/finance", icon: Briefcase },
  { label: "Geopolitics", href: "/events/geopolitics", icon: Globe },
  { label: "Earnings", href: "/events/earnings", icon: DollarSign },
  { label: "Tech", href: "/events/tech", icon: Zap },
  { label: "Culture", href: "/events/pop-culture", icon: Newspaper },
  { label: "World", href: "/events/world", icon: Globe },
  { label: "Economy", href: "/events/economy", icon: Building2 },
  { label: "Elections", href: "/events/elections", icon: Vote },
  { label: "Mentions", href: "/events/mention-markets", icon: MessageSquare },
];

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { open } = useAppKit();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [copied, setCopied] = useState(false);

  const {
    proxyAddress: proxyWalletAddress,
    isDeployed: hasProxyWalletFromHook,
    usdcBalance: proxyUsdcBalance,
    isLoading: isProxyLoading,
  } = useProxyWallet();

  const {
    proxyAddress: relayerProxyAddress,
    hasDeployedSafe: hasDeployedSafeFromRelayer,
    isLoading: isRelayerLoading,
  } = useRelayerClient();

  const { hasCredentials, isLoading: isCredentialsLoading } =
    useClobCredentials();

  const proxyAddress = relayerProxyAddress || proxyWalletAddress;
  const hasProxyWallet = hasDeployedSafeFromRelayer || hasProxyWalletFromHook;
  const isFullySetUp = hasCredentials && hasProxyWallet;
  const isStillLoading =
    isCredentialsLoading || isProxyLoading || isRelayerLoading;
  const needsTradingSetup = isConnected && !isStillLoading && !isFullySetUp;

  const formatAddress = (addr: string) =>
    `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <aside className="hidden lg:flex fixed left-0 top-0 z-40 h-screen w-56 flex-col border-r border-border/50 bg-background">
      {/* Logo */}
      <div className="flex h-14 items-center px-4 border-b border-border/50">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="flex items-center gap-2 font-bold text-lg hover:opacity-80 transition-opacity"
        >
          <span className="text-xl">📊</span>
          <span>Polycaster</span>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {/* Main Nav */}
        <ul className="space-y-0.5">
          <li>
            <button
              type="button"
              onClick={() => router.push("/")}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                pathname === "/"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
              <span>All Markets</span>
            </button>
          </li>

          {/* Portfolio - only show when connected */}
          {isConnected && (
            <li>
              <button
                type="button"
                onClick={() => router.push("/portfolio")}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  pathname === "/portfolio"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <BarChart3 className="h-4 w-4" />
                <span>Portfolio</span>
              </button>
            </li>
          )}
        </ul>

        {/* Separator */}
        <div className="my-4 mx-3 border-t border-border/50" />

        {/* Categories */}
        <div>
          <p className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Categories
          </p>
          <ul className="space-y-0.5">
            {categories.map((cat) => {
              const Icon = cat.icon;
              const isActive = pathname === cat.href;
              return (
                <li key={cat.href}>
                  <button
                    type="button"
                    onClick={() => router.push(cat.href)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-colors ${
                      isActive
                        ? "text-foreground font-medium bg-muted"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{cat.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      {/* Bottom Section */}
      <div className="border-t border-border/50 p-3 space-y-3">
        {/* Trading Wallet Card - Compact */}
        {isConnected && hasProxyWallet && proxyAddress && (
          <div className="p-3 rounded-xl bg-linear-to-br from-violet-500/10 to-purple-500/5 border border-violet-500/20">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-violet-400 uppercase tracking-wider">
                Trading Balance
              </span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a
                      href={`https://polygonscan.com/address/${proxyAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent>View on Polygonscan</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className="text-xl font-bold text-violet-400">
              ${proxyUsdcBalance.toFixed(2)}
            </p>
            <div className="flex items-center gap-1 mt-1">
              <code className="text-[10px] text-muted-foreground font-mono">
                {formatAddress(proxyAddress)}
              </code>
              <button
                type="button"
                onClick={() => handleCopy(proxyAddress)}
                className="text-muted-foreground hover:text-foreground"
              >
                {copied ? (
                  <span className="text-[10px] text-green-500">✓</span>
                ) : (
                  <Copy className="h-2.5 w-2.5" />
                )}
              </button>
            </div>
          </div>
        )}

        {/* Setup CTA */}
        {needsTradingSetup && (
          <Button
            onClick={() => setShowOnboarding(true)}
            size="sm"
            className="w-full bg-linear-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-xs h-9"
          >
            <Rocket className="mr-1.5 h-3.5 w-3.5" />
            Setup Trading
          </Button>
        )}

        {/* Account Section */}
        {isConnected ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-between h-9"
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-linear-to-br from-violet-500 to-purple-500 flex items-center justify-center">
                    <User className="h-3 w-3 text-white" />
                  </div>
                  <span className="text-xs font-mono">
                    {formatAddress(address || "")}
                  </span>
                </div>
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => open()}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => disconnect()}
                className="text-red-500 focus:text-red-500"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Disconnect
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button onClick={() => open()} size="sm" className="w-full h-9">
            <Wallet className="mr-2 h-3.5 w-3.5" />
            Connect
          </Button>
        )}

        {/* Theme Toggle */}
        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-muted-foreground">Theme</span>
          <ThemeToggle />
        </div>
      </div>

      {/* Onboarding Dialog */}
      <Dialog open={showOnboarding} onOpenChange={setShowOnboarding}>
        <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>Setup Trading Account</DialogTitle>
          </DialogHeader>
          <TradingOnboarding
            onComplete={() => setShowOnboarding(false)}
            onSkip={() => setShowOnboarding(false)}
          />
        </DialogContent>
      </Dialog>
    </aside>
  );
}
