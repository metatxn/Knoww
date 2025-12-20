"use client";

import type { LucideIcon } from "lucide-react";
import { Clock, Share2, Trophy } from "lucide-react";
import Image from "next/image";
import { NegRiskBadge } from "@/components/neg-risk-badge";
import { cn } from "@/lib/utils";

interface HeaderSectionProps {
  event: {
    title: string;
    image?: string;
    volume?: number | string;
    endDate?: string;
    negRisk?: boolean;
  };
  isScrolled: boolean;
  formatVolume: (vol?: number | string) => string;
  totalMarketsCount: number;
  openMarkets: unknown[];
  closedMarkets: unknown[];
}

function StatItem({
  icon: Icon,
  label,
  value,
  compact = false,
  className,
}: {
  icon?: LucideIcon;
  label?: string;
  value: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 bg-muted/50 rounded-full shrink-0 transition-all duration-300",
        compact
          ? "px-1.5 py-0.5 text-[10px] sm:text-[11px] bg-muted/40 backdrop-blur-xs border border-border/20"
          : "px-2.5 py-1.5 text-sm",
        className
      )}
    >
      {Icon && (
        <Icon
          className={cn("shrink-0", compact ? "h-2.5 w-2.5" : "h-3.5 w-3.5")}
        />
      )}
      <span className="font-medium truncate">
        {value}
        {label && !compact && ` ${label}`}
      </span>
    </div>
  );
}

export function HeaderSection({
  event,
  isScrolled,
  formatVolume,
  totalMarketsCount,
  openMarkets,
  closedMarkets,
}: HeaderSectionProps) {
  return (
    <div
      className={cn(
        "sticky top-14 xl:top-0 z-30 -mx-4 px-4 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8 transition-all duration-300",
        isScrolled
          ? "bg-background/80 backdrop-blur-md border-b border-border/40 shadow-xs py-3 mb-4"
          : "bg-transparent py-4 mb-6"
      )}
    >
      <div className="space-y-3 sm:space-y-4">
        {/* Title Row with Image, Title, and Action Buttons */}
        <div className="flex items-start gap-3 md:gap-4">
          {event.image && (
            <div
              className={cn(
                "relative shrink-0 transition-all duration-300",
                isScrolled
                  ? "w-10 h-10 sm:w-12 sm:h-12"
                  : "w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20"
              )}
            >
              <Image
                src={event.image}
                alt={event.title}
                fill
                sizes="(max-width: 640px) 48px, 80px"
                className="rounded-xl object-cover"
              />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h1
                  className={cn(
                    "font-bold leading-tight transition-all duration-300",
                    isScrolled
                      ? "text-lg sm:text-xl md:text-2xl"
                      : "text-xl sm:text-2xl md:text-3xl"
                  )}
                >
                  {event.title}
                </h1>
                <div
                  className={cn(
                    "flex flex-wrap items-center gap-2 transition-all duration-300",
                    isScrolled ? "mt-1" : "mt-1.5"
                  )}
                >
                  {event.negRisk && <NegRiskBadge />}

                  {/* Compact Stats Row - visible only when scrolled */}
                  <div
                    className={cn(
                      "flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 transition-all duration-300",
                      isScrolled
                        ? "opacity-100 translate-x-0"
                        : "opacity-0 -translate-x-2 pointer-events-none w-0 h-0 overflow-hidden"
                    )}
                  >
                    <StatItem
                      icon={Trophy}
                      value={formatVolume(event.volume)}
                      compact
                    />
                    {event.endDate && (
                      <StatItem
                        icon={Clock}
                        value={new Date(event.endDate).toLocaleDateString(
                          "en-US",
                          {
                            month: "short",
                            day: "numeric",
                          }
                        )}
                        compact
                      />
                    )}
                    <StatItem value={`${totalMarketsCount} mkts`} compact />
                  </div>

                  {/* Full Stats Row - visible only when NOT scrolled, now inline with NegRisk label */}
                  <div
                    className={cn(
                      "flex flex-wrap items-center gap-1.5 sm:gap-2 text-muted-foreground transition-all duration-300",
                      isScrolled
                        ? "opacity-0 -translate-x-2 pointer-events-none w-0 h-0 overflow-hidden"
                        : "opacity-100 translate-x-0"
                    )}
                  >
                    <StatItem
                      icon={Trophy}
                      value={formatVolume(event.volume)}
                      label="Vol."
                    />
                    {event.endDate && (
                      <StatItem
                        icon={Clock}
                        value={new Date(event.endDate).toLocaleDateString(
                          "en-US",
                          {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          }
                        )}
                      />
                    )}
                    <StatItem
                      value={`${totalMarketsCount} market${
                        totalMarketsCount !== 1 ? "s" : ""
                      }`}
                    />
                    {closedMarkets.length > 0 && (
                      <StatItem
                        value={`${openMarkets.length} open • ${closedMarkets.length} closed`}
                      />
                    )}
                  </div>
                </div>
              </div>
              {/* Action Buttons - Icon only on mobile/tablet, with text on desktop */}
              <div
                className={cn(
                  "flex items-center gap-1.5 shrink-0 transition-all duration-300",
                  isScrolled ? "scale-90" : "scale-100"
                )}
              >
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
                    "h-8 w-8 lg:h-9 lg:w-auto lg:px-3 lg:gap-2"
                  )}
                  onClick={async () => {
                    if (typeof window !== "undefined" && navigator.share) {
                      try {
                        await navigator.share({
                          title: event.title,
                          url: window.location.href,
                        });
                      } catch (err) {
                        if ((err as Error).name !== "AbortError") {
                          console.error("Share failed:", err);
                        }
                      }
                    }
                  }}
                >
                  <Share2 className="h-4 w-4" />
                  <span className="hidden lg:inline">Share</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
