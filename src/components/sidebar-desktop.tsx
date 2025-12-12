"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Sidebar } from "@/components/sidebar";

/**
 * Client-only wrapper that renders the Sidebar only on desktop (lg and up).
 * This prevents the sidebar from occupying space or duplicating nav on mobile.
 */
export function SidebarDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    // Only render sidebar on >= 1280px (desktop). iPad Pro (1024px) should hide it.
    const mql = window.matchMedia("(min-width: 1280px)");
    const handleChange = (event: MediaQueryListEvent | MediaQueryList) => {
      setIsDesktop(event.matches);
    };

    // Set initial value
    handleChange(mql);

    // Listen for changes
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  if (!isDesktop) return null;
  return <Sidebar />;
}

// Export a dynamic, ssr-disabled version for server components (like layout)
export const SidebarDesktopNoSSR = dynamic(
  () => Promise.resolve(SidebarDesktop),
  { ssr: false }
);
