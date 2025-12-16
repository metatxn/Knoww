"use client";

import { useAppKit } from "@reown/appkit/react";
import {
  ArrowDownToLine,
  Bitcoin,
  Briefcase,
  Building2,
  ChevronDown,
  Copy,
  DollarSign,
  ExternalLink,
  FolderOpen,
  Globe,
  Landmark,
  LogOut,
  MessageSquare,
  Newspaper,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Rocket,
  Settings,
  Sparkles,
  Target,
  Trophy,
  User,
  Vote,
  Wallet,
  Zap,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useConnection, useDisconnect } from "wagmi";
import { DepositModal } from "@/components/deposit-modal";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
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
import { useOnboarding } from "@/context/onboarding-context";
import { useSidebar } from "@/context/sidebar-context";
import { useProxyWallet } from "@/hooks/use-proxy-wallet";
import { useRelayerClient } from "@/hooks/use-relayer-client";
import { cn } from "@/lib/utils";

// Categories with Lucide icons
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
  const { address, isConnected } = useConnection();
  const disconnect = useDisconnect();
  const { open } = useAppKit();
  const [copied, setCopied] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);

  // Use global contexts
  const { isCollapsed, setIsCollapsed } = useSidebar();
  const { setShowOnboarding, needsTradingSetup } = useOnboarding();

  const {
    proxyAddress: proxyWalletAddress,
    isDeployed: hasProxyWalletFromHook,
    usdcBalance: proxyUsdcBalance,
  } = useProxyWallet();

  const {
    proxyAddress: relayerProxyAddress,
    hasDeployedSafe: hasDeployedSafeFromRelayer,
  } = useRelayerClient();

  const proxyAddress = relayerProxyAddress || proxyWalletAddress;
  const hasProxyWallet = hasDeployedSafeFromRelayer || hasProxyWalletFromHook;

  const formatAddress = (addr: string) =>
    `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "hidden lg:flex fixed left-0 top-0 z-40 h-screen flex-col border-r border-gray-200 dark:border-border/40 bg-linear-to-b from-white via-slate-50/50 to-slate-100/50 dark:from-background dark:via-background dark:to-muted/10 transition-all duration-300",
          isCollapsed ? "w-16" : "w-56",
        )}
      >
        {/* Subtle gradient overlay */}
        <div className="absolute inset-0 bg-linear-to-br from-violet-500/3 via-transparent to-blue-500/3 pointer-events-none" />

        {/* Animated gradient accent */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-32 -left-32 w-64 h-64 bg-violet-400/4 dark:bg-purple-500/6 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-0 w-48 h-48 bg-sky-400/3 dark:bg-blue-500/5 rounded-full blur-3xl" />
        </div>

        {/* Logo */}
        <div
          className={cn(
            "relative flex h-14 items-center border-b border-border/40",
            isCollapsed ? "justify-center px-2" : "px-4",
          )}
        >
          <button
            type="button"
            onClick={() => router.push("/")}
            className="group flex items-center gap-2 font-black text-lg hover:opacity-80 transition-all"
          >
            <span className="text-xl group-hover:animate-bounce">📊</span>
            {!isCollapsed && (
              <span className="bg-clip-text text-transparent bg-linear-to-r from-gray-900 via-gray-800 to-gray-600 dark:from-foreground dark:via-foreground dark:to-foreground/70 group-hover:from-violet-600 group-hover:to-blue-600 dark:group-hover:from-purple-400 dark:group-hover:to-blue-400 transition-all duration-300">
                Polycaster
              </span>
            )}
          </button>
        </div>

        {/* Navigation */}
        <nav
          className={cn(
            "relative flex-1 overflow-y-auto py-4 scrollbar-hide",
            isCollapsed ? "px-1.5" : "px-2",
          )}
        >
          {/* Main Nav */}
          <ul className="space-y-1">
            <li>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => router.push("/")}
                    className={cn(
                      "group w-full flex items-center gap-3 py-2.5 text-sm font-bold rounded-xl transition-all duration-300",
                      isCollapsed ? "justify-center px-2" : "px-3",
                      pathname === "/"
                        ? "bg-linear-to-r from-violet-500 to-purple-500 text-white shadow-lg shadow-violet-500/20"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/60 dark:hover:bg-muted/40",
                    )}
                  >
                    <Target
                      className={cn(
                        "transition-transform duration-200 shrink-0",
                        isCollapsed
                          ? "h-5 w-5 group-hover:scale-110"
                          : "h-4 w-4 group-hover:scale-110",
                        pathname === "/" ? "text-white" : "",
                      )}
                    />
                    {!isCollapsed && (
                      <>
                        <span className="flex-1 text-left">All Markets</span>
                        {pathname === "/" && (
                          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                        )}
                      </>
                    )}
                  </button>
                </TooltipTrigger>
                {isCollapsed && (
                  <TooltipContent side="right" sideOffset={10}>
                    All Markets
                  </TooltipContent>
                )}
              </Tooltip>
            </li>

            {/* Portfolio */}
            {isConnected && (
              <li>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => router.push("/portfolio")}
                      className={cn(
                        "group w-full flex items-center gap-3 py-2.5 text-sm font-bold rounded-xl transition-all duration-300",
                        isCollapsed ? "justify-center px-2" : "px-3",
                        pathname === "/portfolio"
                          ? "bg-linear-to-r from-violet-500 to-purple-500 text-white shadow-lg shadow-violet-500/20"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/60 dark:hover:bg-muted/40",
                      )}
                    >
                      <FolderOpen
                        className={cn(
                          "transition-transform duration-200 shrink-0",
                          isCollapsed
                            ? "h-5 w-5 group-hover:scale-110"
                            : "h-4 w-4 group-hover:scale-110",
                          pathname === "/portfolio" ? "text-white" : "",
                        )}
                      />
                      {!isCollapsed && (
                        <>
                          <span className="flex-1 text-left">Portfolio</span>
                          {pathname === "/portfolio" && (
                            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                          )}
                        </>
                      )}
                    </button>
                  </TooltipTrigger>
                  {isCollapsed && (
                    <TooltipContent side="right" sideOffset={10}>
                      Portfolio
                    </TooltipContent>
                  )}
                </Tooltip>
              </li>
            )}
          </ul>

          {/* Separator */}
          <div className={cn("my-4", isCollapsed ? "mx-1" : "mx-2")}>
            {isCollapsed ? (
              <div className="h-px bg-border/50" />
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-linear-to-r from-transparent via-border to-transparent" />
                <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">
                  Browse
                </span>
                <div className="flex-1 h-px bg-linear-to-r from-transparent via-border to-transparent" />
              </div>
            )}
          </div>

          {/* Categories */}
          <div className="space-y-0.5">
            {categories.map((cat) => {
              const isActive = pathname === cat.href;
              return (
                <Tooltip key={cat.href}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => router.push(cat.href)}
                      className={cn(
                        "group w-full flex items-center gap-2.5 py-2 text-sm rounded-xl transition-all duration-200",
                        isCollapsed ? "justify-center px-2" : "px-3",
                        isActive
                          ? "bg-linear-to-r from-violet-500 to-purple-500 text-white font-semibold shadow-lg shadow-violet-500/20"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/40 dark:hover:bg-muted/30",
                      )}
                    >
                      <cat.icon
                        className={cn(
                          "transition-transform duration-200 shrink-0",
                          isCollapsed
                            ? "h-5 w-5 group-hover:scale-110"
                            : "h-4 w-4 group-hover:scale-110",
                          isActive ? "text-white" : "",
                        )}
                      />
                      {!isCollapsed && (
                        <>
                          <span className="flex-1 text-left truncate">
                            {cat.label}
                          </span>
                          {isActive && (
                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                          )}
                        </>
                      )}
                    </button>
                  </TooltipTrigger>
                  {isCollapsed && (
                    <TooltipContent side="right" sideOffset={10}>
                      {cat.label}
                    </TooltipContent>
                  )}
                </Tooltip>
              );
            })}
          </div>
        </nav>

        {/* Collapse Toggle */}
        <div
          className={cn(
            "relative border-t border-border/40 p-2",
            isCollapsed ? "flex justify-center" : "",
          )}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setIsCollapsed(!isCollapsed)}
                className={cn(
                  "flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all",
                  isCollapsed ? "w-10 h-10" : "w-full h-8 gap-2",
                )}
              >
                {isCollapsed ? (
                  <PanelLeftOpen className="h-4 w-4" />
                ) : (
                  <>
                    <PanelLeftClose className="h-4 w-4" />
                    <span className="text-xs font-medium">Collapse</span>
                  </>
                )}
              </button>
            </TooltipTrigger>
            {isCollapsed && (
              <TooltipContent side="right" sideOffset={10}>
                Expand Sidebar
              </TooltipContent>
            )}
          </Tooltip>
        </div>

        {/* Bottom Section - Only show when expanded */}
        {!isCollapsed && (
          <div className="relative border-t border-border/40 p-3 space-y-3 bg-linear-to-t from-muted/30 to-transparent dark:from-muted/20">
            {/* Trading Wallet Card */}
            {isConnected && hasProxyWallet && proxyAddress && (
              <div className="relative overflow-hidden p-3 rounded-2xl bg-linear-to-br from-violet-100 via-purple-50 to-fuchsia-100 dark:from-violet-500/15 dark:via-purple-500/10 dark:to-fuchsia-500/15 border border-violet-200/60 dark:border-violet-500/20 shadow-sm">
                {/* Animated shimmer */}
                <div className="absolute inset-0 -translate-x-full animate-[shimmer_3s_infinite] bg-linear-to-r from-transparent via-white/30 dark:via-white/5 to-transparent" />

                <div className="relative">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-violet-600 dark:text-violet-400/80 uppercase tracking-wider flex items-center gap-1">
                      <span>💎</span> Trading Balance
                    </span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <a
                          href={`https://polygonscan.com/address/${proxyAddress}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-violet-500/60 hover:text-violet-600 dark:text-muted-foreground dark:hover:text-foreground transition-colors"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </TooltipTrigger>
                      <TooltipContent>View on Polygonscan</TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="text-2xl font-black text-transparent bg-clip-text bg-linear-to-r from-violet-600 to-fuchsia-600 dark:from-violet-400 dark:to-fuchsia-400">
                    ${proxyUsdcBalance.toFixed(2)}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-1">
                      <code className="text-[10px] text-violet-700/70 dark:text-muted-foreground font-mono bg-violet-200/50 dark:bg-black/20 px-1.5 py-0.5 rounded">
                        {formatAddress(proxyAddress)}
                      </code>
                      <button
                        type="button"
                        onClick={() => handleCopy(proxyAddress)}
                        className="text-violet-500/60 hover:text-violet-700 dark:text-muted-foreground dark:hover:text-foreground transition-colors"
                      >
                        {copied ? (
                          <span className="text-[10px] text-emerald-500">
                            ✓
                          </span>
                        ) : (
                          <Copy className="h-2.5 w-2.5" />
                        )}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowDepositModal(true)}
                      className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded-lg bg-linear-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white transition-all shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:scale-105"
                    >
                      <Plus className="h-3 w-3" />
                      Add
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Deposit CTA */}
            {isConnected &&
              hasProxyWallet &&
              proxyAddress &&
              proxyUsdcBalance < 10 && (
                <button
                  type="button"
                  onClick={() => setShowDepositModal(true)}
                  className="group relative w-full overflow-hidden rounded-2xl p-3 transition-all duration-300 hover:scale-[1.02]"
                >
                  <div className="absolute inset-0 bg-linear-to-r from-emerald-500 via-teal-500 to-cyan-500 opacity-90" />
                  <div className="absolute inset-0 bg-linear-to-r from-emerald-400 via-teal-400 to-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-linear-to-r from-transparent via-white/20 to-transparent" />
                  <div className="relative flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
                        <ArrowDownToLine className="h-4 w-4 text-white" />
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-black text-white">
                          Deposit Funds
                        </p>
                        <p className="text-[10px] text-white/80 font-medium">
                          Start trading now →
                        </p>
                      </div>
                    </div>
                    <Sparkles className="h-5 w-5 text-white/80 group-hover:text-white group-hover:rotate-12 transition-all" />
                  </div>
                </button>
              )}

            {/* Setup CTA */}
            {needsTradingSetup && (
              <Button
                onClick={() => setShowOnboarding(true)}
                size="sm"
                className="w-full bg-linear-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-xs h-10 font-bold shadow-lg shadow-violet-500/25 rounded-xl"
              >
                <Rocket className="mr-1.5 h-4 w-4" />
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
                    className="w-full justify-between h-10 rounded-xl hover:bg-muted/60 dark:hover:bg-muted/40"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-xl bg-linear-to-br from-violet-500 to-purple-500 flex items-center justify-center shadow-md shadow-violet-500/20">
                        <User className="h-3.5 w-3.5 text-white" />
                      </div>
                      <span className="text-xs font-mono font-bold">
                        {formatAddress(address || "")}
                      </span>
                    </div>
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 rounded-xl">
                  <DropdownMenuItem
                    onClick={() => open()}
                    className="rounded-lg"
                  >
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => disconnect.mutate({})}
                    className="text-red-500 focus:text-red-500 rounded-lg"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Disconnect
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                onClick={() => open()}
                size="sm"
                className="w-full h-10 font-bold rounded-xl bg-linear-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white shadow-lg shadow-violet-500/20"
              >
                <Wallet className="mr-2 h-4 w-4" />
                Connect Wallet
              </Button>
            )}

            {/* Theme Toggle */}
            <div className="flex items-center justify-between px-2 py-1.5 rounded-xl bg-muted/40 dark:bg-muted/20 border border-border/30">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Theme
              </span>
              <ThemeToggle />
            </div>
          </div>
        )}

        {/* Collapsed Bottom Actions */}
        {isCollapsed && (
          <div className="relative border-t border-border/40 p-2 space-y-2">
            {/* Deposit Button */}
            {isConnected && hasProxyWallet && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setShowDepositModal(true)}
                    className="w-full h-10 flex items-center justify-center rounded-xl bg-linear-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={10}>
                  Deposit Funds
                </TooltipContent>
              </Tooltip>
            )}

            {/* Account/Connect */}
            {isConnected ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => open()}
                    className="w-full h-10 flex items-center justify-center rounded-xl bg-linear-to-br from-violet-500 to-purple-500 text-white shadow-md shadow-violet-500/20"
                  >
                    <User className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={10}>
                  {formatAddress(address || "")}
                </TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => open()}
                    className="w-full h-10 flex items-center justify-center rounded-xl bg-linear-to-br from-violet-500 to-purple-500 text-white shadow-md shadow-violet-500/20"
                  >
                    <Wallet className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={10}>
                  Connect Wallet
                </TooltipContent>
              </Tooltip>
            )}

            {/* Theme Toggle */}
            <div className="flex justify-center">
              <ThemeToggle />
            </div>
          </div>
        )}

        {/* Deposit Modal */}
        <DepositModal
          open={showDepositModal}
          onOpenChange={setShowDepositModal}
        />
      </aside>
    </TooltipProvider>
  );
}
