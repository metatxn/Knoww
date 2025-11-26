"use client";

import { useAppKit } from "@reown/appkit/react";
import {
  BarChart3,
  Bitcoin,
  Briefcase,
  Building2,
  ChevronDown,
  DollarSign,
  Globe,
  Landmark,
  LogOut,
  MessageSquare,
  Newspaper,
  Trophy,
  User,
  Vote,
  Wallet,
  Zap,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useAccount, useBalance, useDisconnect } from "wagmi";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePolPrice } from "@/hooks/use-pol-price";

const navLinks = [
  { label: "Politics", href: "/events/politics", icon: Landmark },
  { label: "Sports", href: "/events/sports", icon: Trophy },
  { label: "Finance", href: "/events/finance", icon: Briefcase },
  { label: "Crypto", href: "/events/crypto", icon: Bitcoin },
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
  const { address, isConnected, chain } = useAccount();
  const { disconnect } = useDisconnect();
  const { data: balance } = useBalance({ address });
  const { open } = useAppKit();
  const { data: polPriceData, isLoading: isPriceLoading } = usePolPrice();

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const formatBalance = (bal?: string) => {
    if (!bal) return "0.00";
    return Number(bal).toFixed(2);
  };

  // Calculate USD value of POL balance
  const getUsdValue = (polBalance?: string) => {
    if (!polBalance || !polPriceData?.price) return null;
    const polAmount = Number(polBalance);
    const usdValue = polAmount * polPriceData.price;
    return usdValue.toFixed(2);
  };

  return (
    <aside className="hidden lg:flex fixed left-0 top-0 z-40 h-screen w-60 flex-col border-r bg-background">
      {/* Logo */}
      <div className="flex h-16 items-center px-6 border-b">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="flex items-center gap-2 font-bold text-xl hover:opacity-80 transition-opacity"
        >
          <span className="text-2xl">📊</span>
          <span>Polycaster</span>
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        <ul className="space-y-1">
          {/* Home / All Categories */}
          <li>
            <button
              type="button"
              onClick={() => router.push("/")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                pathname === "/"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <BarChart3 className="h-5 w-5" />
              <span>All Markets</span>
            </button>
          </li>

          {/* Divider */}
          <li className="pt-4 pb-2">
            <span className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Categories
            </span>
          </li>

          {/* Category Links */}
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive =
              pathname === link.href ||
              (link.href !== "/" && pathname?.startsWith(link.href));

            return (
              <li key={link.href}>
                <button
                  type="button"
                  onClick={() => router.push(link.href)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                    isActive
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span>{link.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Bottom Section: Theme, Portfolio & Wallet */}
      <div className="border-t px-3 py-4 space-y-3">
        {/* Theme Toggle Row */}
        <div className="flex items-center justify-between px-3">
          <span className="text-sm text-muted-foreground">Theme</span>
          <ThemeToggle />
        </div>

        {/* Portfolio & Wallet */}
        {isConnected ? (
          <div className="space-y-3">
            {/* Portfolio Value */}
            {balance && (
              <div className="px-3 py-2 rounded-lg bg-muted/50">
                <div className="text-xs text-muted-foreground">Portfolio</div>
                <div className="text-lg font-semibold">
                  {isPriceLoading ? (
                    <span className="animate-pulse">Loading...</span>
                  ) : getUsdValue(balance.formatted) ? (
                    `$${getUsdValue(balance.formatted)}`
                  ) : (
                    `${formatBalance(balance.formatted)} ${balance.symbol}`
                  )}
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <span>
                    {formatBalance(balance.formatted)} {balance.symbol}
                  </span>
                  {polPriceData?.price && (
                    <span className="text-muted-foreground/70">
                      @ ${polPriceData.price.toFixed(4)}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Account Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-between gap-2"
                >
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4" />
                    <span className="truncate">
                      {formatAddress(address || "")}
                    </span>
                  </div>
                  <ChevronDown className="h-3 w-3 shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
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
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Balance:</span>
                        <span className="font-medium text-xs">
                          {formatBalance(balance.formatted)} {balance.symbol}
                        </span>
                      </div>
                      {polPriceData?.price && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            USD Value:
                          </span>
                          <span className="font-medium text-xs text-green-600 dark:text-green-400">
                            ${getUsdValue(balance.formatted)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <DropdownMenuSeparator />

                <DropdownMenuItem onClick={() => open()}>
                  <User className="mr-2 h-4 w-4" />
                  <span>Account Settings</span>
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={() => disconnect()}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Disconnect</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <Button onClick={() => open()} className="w-full">
            <Wallet className="mr-2 h-4 w-4" />
            Connect Wallet
          </Button>
        )}

        {/* Footer */}
        <p className="text-xs text-muted-foreground text-center pt-2">
          Powered by Polymarket
        </p>
      </div>
    </aside>
  );
}
