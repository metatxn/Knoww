"use client";

import { motion } from "framer-motion";
import { TrendingUp } from "lucide-react";
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
      <div
        className="group relative h-full cursor-pointer rounded-2xl bg-card border border-border/50 overflow-hidden transition-all duration-300 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5"
        onClick={handleViewEvent}
      >
        {/* Image Section with Overlay */}
        <div className="relative aspect-[16/10] w-full overflow-hidden">
          {event.image ? (
            <img
              src={event.image}
              alt={event.title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
              <span className="text-4xl opacity-50">📊</span>
            </div>
          )}

          {/* Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent" />

          {/* Top Left Badges */}
          <div className="absolute top-3 left-3 flex items-center gap-2">
            {isActive ? (
              <span className="px-2.5 py-1 text-xs font-medium bg-emerald-500/90 text-white rounded-full backdrop-blur-sm shadow-lg">
                Active
              </span>
            ) : (
              <span className="px-2.5 py-1 text-xs font-medium bg-zinc-500/90 text-white rounded-full backdrop-blur-sm">
                Closed
              </span>
            )}
            {event.negRisk && (
              <span className="px-2.5 py-1 text-xs font-medium bg-rose-500/90 text-white rounded-full backdrop-blur-sm flex items-center gap-1 shadow-lg">
                Neg Risk
                <svg
                  className="w-3 h-3"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                    clipRule="evenodd"
                  />
                </svg>
              </span>
            )}
          </div>

          {/* Market Count Badge - Top Right */}
          {marketCount > 0 && (
            <div className="absolute top-3 right-3">
              <span className="px-2.5 py-1 text-xs font-medium bg-background/80 text-foreground rounded-full backdrop-blur-sm border border-border/50 shadow-lg">
                {marketCount} market{marketCount !== 1 ? "s" : ""}
              </span>
            </div>
          )}

          {/* Volume Badge - Bottom of Image */}
          {event.volume && (
            <div className="absolute bottom-3 left-3">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-background/80 backdrop-blur-sm rounded-full border border-border/50 shadow-lg">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-sm font-semibold">
                  {formatVolume(event.volume)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Content Section */}
        <div className="p-4 space-y-2">
          <h3 className="font-semibold text-base leading-tight line-clamp-2 group-hover:text-primary transition-colors">
            {event.title || "Untitled Event"}
          </h3>
          {event.description && (
            <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
              {event.description}
            </p>
          )}
        </div>

        {/* Hover Indicator */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/0 via-primary to-primary/0 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300" />
      </div>
    </motion.div>
  );
}

