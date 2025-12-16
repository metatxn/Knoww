"use client";

import { motion } from "framer-motion";
import { AlertCircle, Flame, Sparkles, TrendingUp, Zap } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface EventCardProps {
  event: {
    id: string;
    slug?: string;
    title: string;
    description?: string;
    image?: string;
    volume?: string;
    volume24hr?: number | string;
    volume1wk?: number | string;
    active?: boolean;
    closed?: boolean;
    negRisk?: boolean;
    markets?: Array<{ id: string; question: string }>;
  };
  index?: number;
}

export function EventCard({ event, index = 0 }: EventCardProps) {
  const formatVolume = (vol?: string) => {
    if (!vol) return "N/A";
    const num = parseFloat(vol);
    if (num >= 1000000) {
      return `$${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `$${(num / 1000).toFixed(0)}K`;
    }
    return `$${num.toFixed(0)}`;
  };

  // Prefer slug for SEO-friendly URLs, fallback to ID
  const href = event.slug
    ? `/events/detail/${event.slug}`
    : event.id
    ? `/events/detail/${event.id}`
    : "#";
  const marketCount = event.markets?.length || 0;
  const isActive = event.active !== false && !event.closed;

  // Parse volume values
  const volume24hr =
    typeof event.volume24hr === "string"
      ? Number.parseFloat(event.volume24hr)
      : event.volume24hr || 0;
  const volume1wk =
    typeof event.volume1wk === "string"
      ? Number.parseFloat(event.volume1wk)
      : event.volume1wk || 0;

  // Badge calculations based on volume thresholds:
  // - Lightning bolt (⚡): 24hr volume > $1M (high activity)
  // - HOT badge: weekly volume > $5M (trending market)
  const isHighVolume = volume24hr > 1_000_000; // > $1M 24hr shows lightning
  const isHot = volume1wk > 5_000_000; // > $5M weekly shows HOT badge

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.5,
        delay: Math.min(index * 0.04, 0.4),
        ease: [0.23, 1, 0.32, 1],
      }}
      whileHover={{ y: -10, scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      className="h-full"
    >
      <Link
        href={href}
        className="group relative block h-full w-full text-left cursor-pointer"
      >
        {/* Outer glow on hover */}
        <div className="absolute -inset-px rounded-[1.75rem] bg-linear-to-br from-purple-500/0 via-blue-500/0 to-emerald-500/0 group-hover:from-purple-500/30 group-hover:via-blue-500/30 group-hover:to-emerald-500/30 dark:group-hover:from-purple-500/50 dark:group-hover:via-blue-500/50 dark:group-hover:to-emerald-500/50 opacity-0 group-hover:opacity-100 transition-all duration-500 blur-xl" />

        {/* Card Container */}
        <div className="relative h-full rounded-3xl bg-white/80 dark:bg-card/50 backdrop-blur-xl border border-gray-200/80 dark:border-white/5 overflow-hidden transition-all duration-500 group-hover:border-purple-300/50 dark:group-hover:border-white/20 group-hover:bg-white dark:group-hover:bg-card/80 group-hover:shadow-2xl group-hover:shadow-purple-500/20 dark:group-hover:shadow-purple-500/10">
          {/* Rainbow border effect on hover */}
          <div className="absolute inset-0 rounded-3xl p-px bg-linear-to-br from-purple-500/0 via-transparent to-blue-500/0 group-hover:from-purple-400/20 group-hover:via-pink-400/15 group-hover:to-blue-400/20 dark:group-hover:from-purple-500/30 dark:group-hover:via-pink-500/20 dark:group-hover:to-blue-500/30 transition-all duration-500 pointer-events-none" />

          {/* Image Section with Overlay */}
          <div className="relative aspect-16/10 w-full overflow-hidden">
            {event.image ? (
              <Image
                src={event.image}
                alt={event.title}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 20vw"
                className="object-cover transition-all duration-700 ease-out group-hover:scale-110 group-hover:brightness-110"
              />
            ) : (
              <div className="w-full h-full bg-linear-to-br from-purple-500/30 via-blue-500/20 to-emerald-500/30 flex items-center justify-center relative overflow-hidden">
                {/* Animated background pattern */}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-size-[20px_20px] opacity-50" />
                <span className="relative text-5xl opacity-90 group-hover:scale-125 transition-transform duration-300">
                  📊
                </span>
              </div>
            )}

            {/* Gradient Overlay - More dramatic */}
            <div className="absolute inset-0 bg-linear-to-t from-white dark:from-background via-white/60 dark:via-background/40 to-transparent opacity-95 group-hover:opacity-85 transition-opacity duration-300" />

            {/* Top Left Badges */}
            <div className="absolute top-3 left-3 flex items-center gap-2">
              {isActive ? (
                <span className="relative px-2.5 py-1 text-[10px] font-black uppercase tracking-wider bg-emerald-500 text-white rounded-lg shadow-lg shadow-emerald-500/30 border border-emerald-400/30 flex items-center gap-1">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
                  </span>
                  Live
                </span>
              ) : (
                <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-zinc-600/80 text-white rounded-lg backdrop-blur-md border border-white/10">
                  Closed
                </span>
              )}
              {event.negRisk && (
                <TooltipProvider delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider bg-rose-500/90 text-white rounded-lg shadow-lg shadow-rose-500/30 border border-rose-400/30 flex items-center gap-1 cursor-help">
                        <AlertCircle className="w-3 h-3" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent
                      side="bottom"
                      sideOffset={8}
                      className="bg-rose-500 text-white border-rose-400 font-bold text-xs px-2.5 py-1.5 rounded-lg [&>svg]:hidden"
                    >
                      Negative Risk Market
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>

            {/* Hot Badge & Market Count - Top Right */}
            <div className="absolute top-3 right-3 flex items-center gap-2">
              {isHot && (
                <span className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider bg-linear-to-r from-orange-500 to-red-500 text-white rounded-lg shadow-lg shadow-orange-500/30 border border-orange-400/30 flex items-center gap-1 animate-pulse">
                  <Flame className="w-3 h-3" />
                  HOT
                </span>
              )}
              {marketCount > 0 && (
                <TooltipProvider delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-gray-900/70 dark:bg-black/60 text-white rounded-lg backdrop-blur-xl border border-gray-700/30 dark:border-white/10 cursor-help">
                        {marketCount}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent
                      side="bottom"
                      sideOffset={8}
                      className="bg-gray-900 dark:bg-black/90 text-white border-gray-700/50 dark:border-white/20 font-bold text-xs px-2.5 py-1.5 rounded-lg [&>svg]:hidden"
                    >
                      {marketCount} Market{marketCount !== 1 ? "s" : ""}{" "}
                      Available
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>

            {/* Volume Badge - Floating Pill with Glow */}
            {event.volume && (
              <div className="absolute bottom-3 left-3">
                <div className="relative group/volume">
                  {/* Glow effect */}
                  <div className="absolute inset-0 bg-emerald-500/30 rounded-full blur-md opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/90 dark:bg-black/70 backdrop-blur-xl rounded-full border border-emerald-500/30 dark:border-white/10 shadow-lg group-hover/volume:border-emerald-400/50 transition-all">
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-100 dark:text-emerald-400" />
                    <span className="text-xs font-black text-white tracking-wide">
                      {formatVolume(event.volume)}
                    </span>
                    {isHighVolume && (
                      <Zap className="h-3 w-3 text-yellow-300 dark:text-yellow-400 animate-pulse" />
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Content Section */}
          <div className="p-5 space-y-3 relative">
            {/* Subtle gradient glow on hover */}
            <div className="absolute inset-0 bg-linear-to-t from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

            <h3 className="relative font-black text-base sm:text-lg leading-tight line-clamp-2 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-linear-to-r group-hover:from-foreground group-hover:to-primary transition-all duration-300 wrap-break-word tracking-tight">
              {event.title || "Untitled Event"}
            </h3>
            {event.description && (
              <p className="relative text-xs font-medium text-muted-foreground line-clamp-2 leading-relaxed wrap-break-word opacity-70 group-hover:opacity-100 transition-opacity">
                {event.description}
              </p>
            )}
          </div>

          {/* Bottom Animated Border */}
          <div className="absolute bottom-0 left-0 right-0 h-1 overflow-hidden">
            <div className="h-full w-full bg-linear-to-r from-purple-500 via-blue-500 to-emerald-500 transform -translate-x-full group-hover:translate-x-0 transition-transform duration-700 ease-out" />
          </div>

          {/* Corner Sparkle on Hover - Bottom Right to avoid overlap */}
          <div className="absolute bottom-16 right-4 opacity-0 group-hover:opacity-100 transition-all duration-500 group-hover:rotate-12">
            <Sparkles className="h-4 w-4 text-yellow-400/60" />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
