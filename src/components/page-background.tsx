"use client";

import { motion } from "framer-motion";

interface PageBackgroundProps {
  /** Whether to show animated orbs (set false for simpler pages) */
  showOrbs?: boolean;
  /** Whether to show film grain overlay */
  showGrain?: boolean;
}

export function PageBackground({
  showOrbs = true,
  showGrain = true,
}: PageBackgroundProps) {
  return (
    <>
      {/* Subtle Grid Pattern - More visible in light mode */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgb(0_0_0/0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgb(0_0_0/0.04)_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,hsl(var(--border)/0.3)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.3)_1px,transparent_1px)] bg-size-[60px_60px] mask-[radial-gradient(ellipse_80%_50%_at_50%_0%,black_70%,transparent_110%)]" />
      </div>

      {/* Animated Background Orbs - Theme Aware */}
      {showOrbs && (
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
          {/* Purple Orb - Top Left */}
          <motion.div
            animate={{
              x: [0, 30, 0],
              y: [0, -20, 0],
            }}
            transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
            className="absolute -top-[30%] -left-[15%] w-[60%] h-[60%] rounded-full blur-[150px] bg-violet-300/20 dark:bg-purple-500/8"
          />
          {/* Blue Orb - Right */}
          <motion.div
            animate={{
              x: [0, -40, 0],
              y: [0, 30, 0],
            }}
            transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
            className="absolute top-[30%] -right-[15%] w-[50%] h-[50%] rounded-full blur-[130px] bg-sky-300/15 dark:bg-blue-500/6"
          />
          {/* Teal Orb - Bottom */}
          <motion.div
            animate={{
              x: [0, 20, 0],
              y: [0, -40, 0],
            }}
            transition={{ duration: 30, repeat: Infinity, ease: "easeInOut" }}
            className="absolute -bottom-[20%] left-[10%] w-[70%] h-[70%] rounded-full blur-[180px] bg-emerald-300/10 dark:bg-emerald-500/4"
          />
          {/* Accent Orb - Center for Light Mode */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] rounded-full blur-[200px] bg-indigo-200/10 dark:bg-transparent" />
        </div>
      )}

      {/* Film Grain Overlay */}
      {showGrain && (
        <div className="fixed inset-0 z-1 pointer-events-none opacity-[0.015] dark:opacity-[0.04]">
          <div className="absolute inset-0 bg-noise" />
        </div>
      )}
    </>
  );
}
