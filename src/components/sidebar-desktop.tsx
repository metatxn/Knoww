"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Dynamic import for code-splitting: The Sidebar component (with all its hooks
 * and dependencies like useTrendingEvents, useBreakingEvents, etc.) is only
 * loaded on desktop screens. Mobile users get zero sidebar JS.
 *
 * React 19 / Next.js 15 optimization: This proper dynamic import creates a
 * separate chunk that's only downloaded when needed, reducing initial bundle
 * size for mobile users.
 */
const SidebarDesktop = dynamic(() => import("./sidebar-desktop-inner"), {
  ssr: false,
  loading: () => (
    // Minimal skeleton to prevent layout shift
    <div className="hidden xl:block w-[280px] shrink-0">
      <div className="p-4 space-y-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  ),
});

// Export for use in layout
export { SidebarDesktop };
// Backwards-compatible alias (both exports are SSR-disabled via dynamic import)
export { SidebarDesktop as SidebarDesktopNoSSR };
