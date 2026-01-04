"use client";

import { Home, Search, Wallet, Zap } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useConnection } from "wagmi";
import { useProxyWallet } from "@/hooks/use-proxy-wallet";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: typeof Home;
  requiresAuth?: boolean;
  showBalance?: boolean;
  /** Match this view param on home page */
  viewParam?: string;
}

const navItems: NavItem[] = [
  { label: "Home", href: "/", icon: Home },
  { label: "Search", href: "/search", icon: Search },
  {
    label: "Breaking",
    href: "/?view=breaking",
    icon: Zap,
    viewParam: "breaking",
  },
  {
    label: "Portfolio",
    href: "/portfolio",
    icon: Wallet,
    requiresAuth: true,
    showBalance: true,
  },
];

/**
 * Bottom navigation bar for mobile screens
 * Shows key navigation items with the portfolio balance
 */
export function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const viewParam = searchParams.get("view");
  const { isConnected } = useConnection();
  const { usdcBalance, isDeployed: hasProxyWallet } = useProxyWallet();

  const handleNavigation = (item: NavItem) => {
    router.push(item.href);
  };

  // Filter items based on auth state
  const visibleItems = navItems.filter(
    (item) => !item.requiresAuth || isConnected
  );

  // Check if item is active
  const isItemActive = (item: NavItem) => {
    // Special handling for Breaking - active when on home with view=breaking
    if (item.viewParam) {
      return pathname === "/" && viewParam === item.viewParam;
    }
    // Home is active when on "/" without a view param
    if (item.href === "/") {
      return pathname === "/" && !viewParam;
    }
    // Other items - standard path matching
    return (
      pathname === item.href ||
      (item.href !== "/" && pathname.startsWith(item.href))
    );
  };

  return (
    <nav className="xl:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-lg border-t border-border/50 safe-area-pb">
      <div className="flex items-center justify-around h-16 px-2">
        {visibleItems.map((item) => {
          const isActive = isItemActive(item);
          const Icon = item.icon;

          return (
            <button
              key={item.href}
              type="button"
              onClick={() => handleNavigation(item)}
              className={cn(
                "flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-xl transition-all min-w-[64px]",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div className="relative">
                <Icon className={cn("h-5 w-5", isActive && "scale-110")} />
              </div>
              {/* Show balance for portfolio, label for others */}
              {item.showBalance && isConnected && hasProxyWallet ? (
                <span
                  className={cn(
                    "text-[10px] font-bold tabular-nums",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  $
                  {usdcBalance.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              ) : (
                <span
                  className={cn(
                    "text-[10px] font-medium",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {item.label}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
