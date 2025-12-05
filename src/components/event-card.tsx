"use client";

import { motion } from "framer-motion";
import { AlertCircle, TrendingUp } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";

interface EventCardProps {
  event: {
    id: string;
    slug?: string;
    title: string;
    description?: string;
    image?: string;
    volume?: string;
    active?: boolean;
    closed?: boolean;
    negRisk?: boolean;
    markets?: Array<{ id: string; question: string }>;
  };
  index?: number;
}

export function EventCard({ event, index = 0 }: EventCardProps) {
  const router = useRouter();

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

  const handleViewEvent = () => {
    if (event.id) {
      router.push(`/events/detail/${event.id}`);
    }
  };

  const marketCount = event.markets?.length || 0;
  const isActive = event.active !== false && !event.closed;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.03, 0.3) }}
      whileHover={{ y: -6, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="h-full"
    >
      <button
        type="button"
        className="group relative h-full w-full text-left cursor-pointer rounded-2xl bg-card border border-border/50 overflow-hidden transition-all duration-300 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5"
        onClick={handleViewEvent}
      >
        {/* Image Section with Overlay */}
        <div className="relative aspect-[16/10] w-full overflow-hidden">
          {event.image ? (
            <Image
              src={event.image}
              alt={event.title}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 20vw"
              className="object-cover transition-transform duration-500 group-hover:scale-110"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
              <span className="text-3xl sm:text-4xl opacity-50">📊</span>
            </div>
          )}

          {/* Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent" />

          {/* Top Left Badges */}
          <div className="absolute top-2 sm:top-3 left-2 sm:left-3 flex items-center gap-1.5 sm:gap-2">
            {isActive ? (
              <span className="px-2 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-xs font-medium bg-emerald-500/90 text-white rounded-full backdrop-blur-sm shadow-lg">
                Active
              </span>
            ) : (
              <span className="px-2 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-xs font-medium bg-zinc-500/90 text-white rounded-full backdrop-blur-sm">
                Closed
              </span>
            )}
            {event.negRisk && (
              <span className="px-2 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-xs font-medium bg-rose-500/90 text-white rounded-full backdrop-blur-sm flex items-center gap-0.5 sm:gap-1 shadow-lg">
                Neg Risk
                <AlertCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
              </span>
            )}
          </div>

          {/* Market Count Badge - Top Right */}
          {marketCount > 0 && (
            <div className="absolute top-2 sm:top-3 right-2 sm:right-3">
              <span className="px-2 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-xs font-medium bg-background/80 text-foreground rounded-full backdrop-blur-sm border border-border/50 shadow-lg">
                {marketCount} market{marketCount !== 1 ? "s" : ""}
              </span>
            </div>
          )}

          {/* Volume Badge - Bottom of Image */}
          {event.volume && (
            <div className="absolute bottom-2 sm:bottom-3 left-2 sm:left-3">
              <div className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 bg-background/80 backdrop-blur-sm rounded-full border border-border/50 shadow-lg">
                <TrendingUp className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-emerald-500" />
                <span className="text-xs sm:text-sm font-semibold">
                  {formatVolume(event.volume)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Content Section */}
        <div className="p-3 sm:p-4 space-y-1.5 sm:space-y-2">
          <h3 className="font-semibold text-sm sm:text-base leading-tight line-clamp-2 group-hover:text-primary transition-colors">
            {event.title || "Untitled Event"}
          </h3>
          {event.description && (
            <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 leading-relaxed">
              {event.description}
            </p>
          )}
        </div>

        {/* Hover Indicator */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/0 via-primary to-primary/0 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300" />
      </button>
    </motion.div>
  );
}
