"use client";

import { useAppKit } from "@reown/appkit/react";
import {
  ArrowUpRight,
  BarChart2,
  Bitcoin,
  CircleDollarSign,
  Copy,
  Cpu,
  FolderOpen,
  Globe,
  Grid3X3,
  Landmark,
  Menu,
  MessageSquare,
  Plus,
  Settings,
  TrendingUp,
  Trophy,
  Users,
  Vote,
  Wallet,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useConnection } from "wagmi";
import { DepositModal } from "@/components/deposit-modal";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useProxyWallet } from "@/hooks/use-proxy-wallet";
import { useRelayerClient } from "@/hooks/use-relayer-client";
import { cn } from "@/lib/utils";

// Categories with Lucide icons
const categories = [
  { label: "Politics", href: "/events/politics", icon: Landmark },
  { label: "Sports", href: "/events/sports", icon: Trophy },
  { label: "Crypto", href: "/events/crypto", icon: Bitcoin },
  { label: "Finance", href: "/events/finance", icon: CircleDollarSign },
  { label: "Geopolitics", href: "/events/geopolitics", icon: Globe },
  { label: "Earnings", href: "/events/earnings", icon: BarChart2 },
  { label: "Tech", href: "/events/tech", icon: Cpu },
  { label: "Culture", href: "/events/pop-culture", icon: Users },
  { label: "World", href: "/events/world", icon: Globe },
  { label: "Economy", href: "/events/economy", icon: TrendingUp },
  { label: "Elections", href: "/events/elections", icon: Vote },
  { label: "Mentions", href: "/events/mention-markets", icon: MessageSquare },
];

export function SidebarMobile() {
  const router = useRouter();
  const pathname = usePathname();
  const { address, isConnected } = useConnection();
  const { open } = useAppKit();
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);

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

  const handleNavigation = (href: string) => {
    router.push(href);
    setIsOpen(false);
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="lg:hidden">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Open menu</span>
          </Button>
        </SheetTrigger>

        <SheetContent side="left" className="w-72 p-0 flex flex-col">
          {/* Header */}
          <div className="flex items-center gap-2 px-4 h-14 border-b">
            <span className="text-xl">📊</span>
            <SheetTitle className="font-bold text-lg">Polycaster</SheetTitle>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-4 px-3">
            {/* Main Navigation */}
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => handleNavigation("/")}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors",
                  pathname === "/"
                    ? "bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                <Grid3X3 className="h-5 w-5" />
                All Markets
              </button>

              {isConnected && (
                <button
                  type="button"
                  onClick={() => handleNavigation("/portfolio")}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors",
                    pathname === "/portfolio"
                      ? "bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted",
                  )}
                >
                  <FolderOpen className="h-5 w-5" />
                  Portfolio
                </button>
              )}
            </div>

            {/* Browse Section */}
            <div className="mt-6">
              <h3 className="px-3 mb-2 text-xs font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-wider">
                Browse
              </h3>
              <div className="space-y-0.5">
                {categories.map((cat) => {
                  const isActive = pathname === cat.href;
                  return (
                    <button
                      type="button"
                      key={cat.href}
                      onClick={() => handleNavigation(cat.href)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors",
                        isActive
                          ? "bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300 font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted",
                      )}
                    >
                      <cat.icon className="h-4 w-4" />
                      {cat.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </nav>

          {/* Bottom Section */}
          <div className="border-t p-3 space-y-3 bg-muted/30">
            {/* Balance Card */}
            {isConnected && hasProxyWallet && proxyAddress && (
              <div className="p-3 rounded-xl bg-white dark:bg-card border">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-violet-600 dark:text-violet-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                    BALANCE
                  </span>
                  <a
                    href={`https://polygonscan.com/address/${proxyAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                </div>
                <p className="text-2xl font-bold">
                  ${proxyUsdcBalance.toFixed(2)}
                </p>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-1">
                    <code className="text-[11px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
                      {formatAddress(proxyAddress)}
                    </code>
                    <button
                      type="button"
                      onClick={() => handleCopy(proxyAddress)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {copied ? (
                        <span className="text-[10px] text-emerald-500">✓</span>
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDepositModal(true);
                      setIsOpen(false);
                    }}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-md bg-emerald-500 hover:bg-emerald-600 text-white transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    Add
                  </button>
                </div>
              </div>
            )}

            {/* Deposit Funds Button */}
            {isConnected && hasProxyWallet && (
              <Button
                onClick={() => {
                  setShowDepositModal(true);
                  setIsOpen(false);
                }}
                className="w-full bg-violet-600 hover:bg-violet-700 text-white font-semibold"
              >
                Deposit Funds
              </Button>
            )}

            {/* Account Section */}
            {isConnected ? (
              <div className="flex items-center justify-between px-2 py-2 rounded-lg bg-white dark:bg-card border">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-orange-500 flex items-center justify-center text-white text-xs font-bold">
                    0x
                  </div>
                  <span className="text-sm font-mono">
                    {formatAddress(address || "")}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    open();
                    setIsOpen(false);
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Settings className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <Button
                onClick={() => {
                  open();
                  setIsOpen(false);
                }}
                className="w-full"
              >
                <Wallet className="mr-2 h-4 w-4" />
                Connect Wallet
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Deposit Modal */}
      <DepositModal
        open={showDepositModal}
        onOpenChange={setShowDepositModal}
      />
    </>
  );
}
