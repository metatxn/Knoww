"use client";

import { useAppKit } from "@reown/appkit/react";
import {
  ChevronDown,
  LogOut,
  Menu,
  Rocket,
  User,
  Wallet,
  X,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useConnection, useBalance, useDisconnect } from "wagmi";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOnboarding } from "@/context/onboarding-context";

const navLinks = [
  { label: "Politics", href: "/events/politics" },
  { label: "Sports", href: "/events/sports" },
  { label: "Finance", href: "/events/finance" },
  { label: "Crypto", href: "/events/crypto" },
  { label: "Geopolitics", href: "/events/geopolitics" },
  { label: "Earnings", href: "/events/earnings" },
  { label: "Tech", href: "/events/tech" },
  { label: "Culture", href: "/events/pop-culture" },
  { label: "World", href: "/events/world" },
  { label: "Economy", href: "/events/economy" },
  { label: "Elections", href: "/events/elections" },
  { label: "Mentions", href: "/events/mention-markets" },
];

export function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { address, isConnected, chain } = useConnection();
  const disconnect = useDisconnect();
  const { data: balance } = useBalance({ address });
  const { open } = useAppKit();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Use the global onboarding context
  const { setShowOnboarding, needsTradingSetup } = useOnboarding();

  // Close mobile menu when route changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname dependency is intentional to close menu on navigation
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const formatBalance = (value: bigint, decimals: number) => {
    const divisor = BigInt(10 ** decimals);
    const integerPart = value / divisor;
    const fractionalPart = value % divisor;
    const fractionalStr = fractionalPart
      .toString()
      .padStart(decimals, "0")
      .slice(0, 2);
    return `${integerPart}.${fractionalStr}`;
  };

  return (
    <nav className="lg:hidden sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
      {/* Main Navbar - Mobile Only */}
      <div className="flex h-16 items-center px-4 md:px-6">
        {/* Logo */}
        <div className="flex items-center gap-6 mr-6">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="flex items-center gap-2 font-bold text-xl hover:opacity-80 transition-opacity"
          >
            <span className="text-2xl">📊</span>
            <span className="hidden sm:inline">Polycaster</span>
          </button>
        </div>

        {/* Right Side - Theme Toggle, Wallet Info & Actions */}
        <div className="flex items-center gap-3 ml-auto">
          {/* Theme Toggle */}
          <ThemeToggle />

          {isConnected ? (
            <>
              {/* Setup Trading Account Button - Show when user hasn't completed setup */}
              {needsTradingSetup && (
                <Button
                  onClick={() => setShowOnboarding(true)}
                  size="sm"
                  className="bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                >
                  <Rocket className="mr-2 h-4 w-4" />
                  <span className="hidden sm:inline">Setup Trading</span>
                  <span className="sm:hidden">Setup</span>
                </Button>
              )}

              {/* Balance Badge */}
              {balance && (
                <Badge variant="secondary" className="hidden sm:inline-flex">
                  {formatBalance(balance.value, balance.decimals)}{" "}
                  {balance.symbol}
                </Badge>
              )}

              {/* Account Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Wallet className="h-4 w-4" />
                    <span className="hidden sm:inline">
                      {formatAddress(address || "")}
                    </span>
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel>Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />

                  <div className="px-2 py-2 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Address:</span>
                      <span className="font-mono text-xs">
                        {formatAddress(address || "")}
                      </span>
                    </div>

                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Network:</span>
                      <span className="font-medium text-xs">
                        {chain?.name || "Unknown"}
                      </span>
                    </div>

                    {balance && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Balance:</span>
                        <span className="font-medium text-xs">
                          {formatBalance(balance.value, balance.decimals)}{" "}
                          {balance.symbol}
                        </span>
                      </div>
                    )}
                  </div>

                  <DropdownMenuSeparator />

                  <DropdownMenuItem onClick={() => open()}>
                    <User className="mr-2 h-4 w-4" />
                    <span>Account Settings</span>
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={() => disconnect.mutate({})}
                    className="text-destructive focus:text-destructive"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Disconnect</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <Button onClick={() => open()} size="sm">
              <Wallet className="mr-2 h-4 w-4" />
              Connect Wallet
            </Button>
          )}

          {/* Mobile Menu Toggle */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 hover:bg-muted rounded-md"
          >
            {mobileMenuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="border-t bg-background">
          <div className="px-4 py-3 space-y-1 max-h-[calc(100vh-4rem)] overflow-y-auto">
            {/* Setup Trading Account - Mobile */}
            {needsTradingSetup && (
              <button
                type="button"
                onClick={() => {
                  setShowOnboarding(true);
                  setMobileMenuOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm font-medium rounded-md transition-colors bg-linear-to-r from-purple-600/10 to-blue-600/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
              >
                <Rocket className="inline mr-2 h-4 w-4" />
                Setup Trading Account
              </button>
            )}

            {/* Home link */}
            <button
              type="button"
              onClick={() => router.push("/")}
              className={`w-full text-left px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                pathname === "/"
                  ? "text-foreground bg-muted"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              All Markets
            </button>

            {/* Category links */}
            {navLinks.map((link) => {
              const isActive =
                pathname === link.href ||
                (link.href !== "/" && pathname?.startsWith(link.href));

              return (
                <button
                  type="button"
                  key={link.href}
                  onClick={() => router.push(link.href)}
                  className={`w-full text-left px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    isActive
                      ? "text-foreground bg-muted"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  {link.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

    </nav>
  );
}
