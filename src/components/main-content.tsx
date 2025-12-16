"use client";

import type { ReactNode } from "react";
import { useSidebar } from "@/context/sidebar-context";
import { cn } from "@/lib/utils";

interface MainContentProps {
  children: ReactNode;
}

export function MainContent({ children }: MainContentProps) {
  const { isCollapsed } = useSidebar();

  return (
    <div
      className={cn(
        "transition-all duration-300",
        isCollapsed ? "lg:ml-16" : "lg:ml-56",
      )}
    >
      {children}
    </div>
  );
}
