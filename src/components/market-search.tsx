"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Search, Tag, TrendingUp, X } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { useSearch } from "@/hooks/use-search";
import { cn } from "@/lib/utils";

// Custom hook for debouncing values
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

interface MarketSearchProps {
  className?: string;
  placeholder?: string;
}

export function MarketSearch({
  className,
  placeholder = "Search markets...",
}: MarketSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounce the search query by 300ms
  const debouncedQuery = useDebouncedValue(query, 300);

  // Use debounced query for API calls
  const { data, isLoading } = useSearch(debouncedQuery, 8);

  // Show loading state while typing (before debounce completes)
  const isTyping = query !== debouncedQuery && query.length >= 2;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(e.target.value);
      setIsOpen(e.target.value.length >= 2);
    },
    []
  );

  const handleClear = useCallback(() => {
    setQuery("");
    setIsOpen(false);
    inputRef.current?.focus();
  }, []);

  const handleEventClick = useCallback(
    (slug: string) => {
      setIsOpen(false);
      setQuery("");
      router.push(`/events/detail/${slug}`);
    },
    [router]
  );

  const handleTagClick = useCallback(
    (slug: string) => {
      setIsOpen(false);
      setQuery("");
      router.push(`/events/${slug}`);
    },
    [router]
  );

  const hasResults =
    (data?.events && data.events.length > 0) ||
    (data?.tags && data.tags.length > 0);

  const showDropdown = isOpen && query.length >= 2;

  // Format volume for display
  const formatVolume = (volume?: number) => {
    if (!volume) return null;
    if (volume >= 1000000) return `$${(volume / 1000000).toFixed(1)}M`;
    if (volume >= 1000) return `$${(volume / 1000).toFixed(0)}K`;
    return `$${volume.toFixed(0)}`;
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={handleInputChange}
          onFocus={() => query.length >= 2 && setIsOpen(true)}
          className="pl-9 pr-8 w-full h-9 bg-background border-border/50 rounded-lg"
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded"
          >
            <X className="h-3 w-3 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Results Dropdown */}
      <AnimatePresence>
        {showDropdown && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 right-0 mt-2 bg-popover border border-border rounded-xl shadow-xl z-50 overflow-hidden max-h-[70vh] overflow-y-auto"
          >
            {/* Loading State - show when typing or fetching */}
            {(isLoading || isTyping) && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* No Results */}
            {!isLoading && !isTyping && !hasResults && (
              <div className="text-center py-8 px-4">
                <Search className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  No markets found for "{query}"
                </p>
              </div>
            )}

            {/* Results */}
            {!isLoading && !isTyping && hasResults && (
              <div className="divide-y divide-border/50">
                {/* Events Section */}
                {data?.events && data.events.length > 0 && (
                  <div className="py-2">
                    <div className="px-3 py-1.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <TrendingUp className="h-3 w-3" />
                      Markets
                    </div>
                    {data.events.map((event) => (
                      <button
                        type="button"
                        key={event.id}
                        onClick={() => handleEventClick(event.slug || event.id)}
                        className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left"
                      >
                        {/* Event Image */}
                        {event.image ? (
                          <div className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-muted">
                            <Image
                              src={event.image}
                              alt={event.title}
                              fill
                              sizes="40px"
                              className="object-cover"
                            />
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                            <TrendingUp className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}

                        {/* Event Details */}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm line-clamp-2 leading-tight">
                            {event.title}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            {event.volume24hr && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
                                {formatVolume(event.volume24hr)} 24h
                              </span>
                            )}
                            {event.live && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium">
                                LIVE
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Tags Section */}
                {data?.tags && data.tags.length > 0 && (
                  <div className="py-2">
                    <div className="px-3 py-1.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <Tag className="h-3 w-3" />
                      Categories
                    </div>
                    <div className="px-3 py-1 flex flex-wrap gap-2">
                      {data.tags.slice(0, 5).map((tag) => (
                        <button
                          type="button"
                          key={tag.id}
                          onClick={() => handleTagClick(tag.slug)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-muted/50 hover:bg-muted text-xs font-medium transition-colors"
                        >
                          <Tag className="h-3 w-3" />
                          {tag.label}
                          {tag.event_count && (
                            <span className="text-muted-foreground">
                              ({tag.event_count})
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* View All Results */}
                {data?.pagination && data.pagination.totalResults > 8 && (
                  <div className="px-3 py-3 bg-muted/30">
                    <p className="text-xs text-center text-muted-foreground">
                      Showing top results of {data.pagination.totalResults}{" "}
                      total
                    </p>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
