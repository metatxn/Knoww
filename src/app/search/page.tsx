"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Search, Sparkles, Tag, TrendingUp, X } from "lucide-react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Navbar } from "@/components/navbar";
import { PageBackground } from "@/components/page-background";
import { Input } from "@/components/ui/input";
import { useSearch } from "@/hooks/use-search";
import { formatVolume } from "@/lib/formatters";

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

// Recent searches stored in localStorage
const RECENT_SEARCHES_KEY = "knoww-recent-searches";
const MAX_RECENT_SEARCHES = 5;

function getRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function addRecentSearch(query: string) {
  if (typeof window === "undefined" || !query.trim()) return;
  try {
    const recent = getRecentSearches();
    const filtered = recent.filter(
      (s) => s.toLowerCase() !== query.toLowerCase()
    );
    const updated = [query, ...filtered].slice(0, MAX_RECENT_SEARCHES);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  } catch {
    // Ignore localStorage errors
  }
}

function removeRecentSearch(query: string) {
  if (typeof window === "undefined") return;
  try {
    const recent = getRecentSearches();
    const updated = recent.filter(
      (s) => s.toLowerCase() !== query.toLowerCase()
    );
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  } catch {
    // Ignore localStorage errors
  }
}

function SearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";

  const [query, setQuery] = useState(initialQuery);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load recent searches on mount
  useEffect(() => {
    setRecentSearches(getRecentSearches());
  }, []);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounce the search query by 300ms
  const debouncedQuery = useDebouncedValue(query, 300);

  // Use debounced query for API calls
  const { data, isLoading } = useSearch(debouncedQuery, 20);

  // Show loading state while typing (before debounce completes)
  const isTyping = query !== debouncedQuery && query.length >= 2;

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(e.target.value);
    },
    []
  );

  const handleClear = useCallback(() => {
    setQuery("");
    inputRef.current?.focus();
  }, []);

  const handleEventClick = useCallback(
    (slug: string) => {
      if (query.trim()) {
        addRecentSearch(query.trim());
      }
      router.push(`/events/detail/${slug}`);
    },
    [router, query]
  );

  const handleTagClick = useCallback(
    (slug: string) => {
      if (query.trim()) {
        addRecentSearch(query.trim());
      }
      router.push(`/events/${slug}`);
    },
    [router, query]
  );

  const handleRecentSearchClick = useCallback((searchQuery: string) => {
    setQuery(searchQuery);
  }, []);

  const handleRemoveRecentSearch = useCallback((searchQuery: string) => {
    removeRecentSearch(searchQuery);
    setRecentSearches(getRecentSearches());
  }, []);

  const hasResults =
    (data?.events && data.events.length > 0) ||
    (data?.tags && data.tags.length > 0);

  const showResults = query.length >= 2;
  const showRecentSearches = !showResults && recentSearches.length > 0;

  return (
    <div className="min-h-screen bg-linear-to-b from-slate-50 via-white to-slate-50 dark:from-background dark:via-background dark:to-background relative overflow-x-hidden selection:bg-purple-500/30">
      <PageBackground />

      <Navbar />

      <main className="relative z-10 px-3 sm:px-4 md:px-6 lg:px-8 pt-6 pb-24">
        {/* Search Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="max-w-2xl mx-auto mb-8"
        >
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4 text-center">
            Search Markets
          </h1>

          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              ref={inputRef}
              type="text"
              placeholder="Search for markets, events, or categories..."
              value={query}
              onChange={handleInputChange}
              className="pl-12 pr-10 w-full h-14 text-lg bg-background border-border/50 rounded-2xl shadow-sm"
            />
            {query && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 hover:bg-muted rounded-lg transition-colors"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
        </motion.div>

        {/* Recent Searches */}
        <AnimatePresence mode="wait">
          {showRecentSearches && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-2xl mx-auto"
            >
              <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Recent Searches
              </h2>
              <div className="flex flex-wrap gap-2">
                {recentSearches.map((search) => (
                  <div
                    key={search}
                    className="flex items-center gap-1 px-3 py-2 rounded-xl bg-muted/50 border border-border/50 group"
                  >
                    <button
                      type="button"
                      onClick={() => handleRecentSearchClick(search)}
                      className="text-sm font-medium hover:text-primary transition-colors"
                    >
                      {search}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveRecentSearch(search)}
                      className="p-0.5 rounded hover:bg-muted-foreground/20 opacity-50 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Search Results */}
        <AnimatePresence mode="wait">
          {showResults && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-4xl mx-auto"
            >
              {/* Loading State */}
              {(isLoading || isTyping) && (
                <div className="flex flex-col items-center justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">Searching...</p>
                </div>
              )}

              {/* No Results */}
              {!isLoading && !isTyping && !hasResults && (
                <div className="text-center py-16">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-muted/50 mb-4">
                    <Search className="h-8 w-8 text-muted-foreground/50" />
                  </div>
                  <h3 className="text-lg font-bold mb-2">No results found</h3>
                  <p className="text-sm text-muted-foreground">
                    No markets found for "{query}". Try a different search term.
                  </p>
                </div>
              )}

              {/* Results */}
              {!isLoading && !isTyping && hasResults && (
                <div className="space-y-8">
                  {/* Tags Section */}
                  {data?.tags && data.tags.length > 0 && (
                    <div>
                      <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                        <Tag className="h-4 w-4" />
                        Categories ({data.tags.length})
                      </h2>
                      <div className="flex flex-wrap gap-2">
                        {data.tags.map((tag) => (
                          <button
                            type="button"
                            key={tag.id}
                            onClick={() => handleTagClick(tag.slug)}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-muted/50 hover:bg-muted border border-border/50 text-sm font-medium transition-colors"
                          >
                            <Tag className="h-4 w-4 text-primary" />
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

                  {/* Events Section */}
                  {data?.events && data.events.length > 0 && (
                    <div>
                      <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        Markets ({data.events.length})
                      </h2>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {data.events.map((event, index) => (
                          <motion.button
                            key={event.id}
                            type="button"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.03 }}
                            onClick={() =>
                              handleEventClick(event.slug || event.id)
                            }
                            className="flex items-start gap-4 p-4 rounded-2xl bg-card/50 hover:bg-card border border-border/50 hover:border-border transition-all text-left group"
                          >
                            {/* Event Image */}
                            {event.image ? (
                              <div className="relative w-16 h-16 rounded-xl overflow-hidden shrink-0 bg-muted">
                                <Image
                                  src={event.image}
                                  alt={event.title}
                                  fill
                                  sizes="64px"
                                  className="object-cover group-hover:scale-105 transition-transform"
                                />
                              </div>
                            ) : (
                              <div className="w-16 h-16 rounded-xl bg-muted flex items-center justify-center shrink-0">
                                <TrendingUp className="h-6 w-6 text-muted-foreground" />
                              </div>
                            )}

                            {/* Event Details */}
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm line-clamp-2 leading-snug mb-2 group-hover:text-primary transition-colors">
                                {event.title}
                              </p>
                              <div className="flex items-center gap-2 flex-wrap">
                                {event.volume24hr && (
                                  <span className="text-[10px] px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold">
                                    {formatVolume(event.volume24hr)} 24h
                                  </span>
                                )}
                                {event.live && (
                                  <span className="text-[10px] px-2 py-1 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold">
                                    LIVE
                                  </span>
                                )}
                              </div>
                            </div>
                          </motion.button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Results Summary */}
                  {data?.pagination && (
                    <div className="text-center pt-4 border-t border-border/50">
                      <p className="text-xs text-muted-foreground">
                        Showing {data.events?.length || 0} markets
                        {data.pagination.totalResults >
                          (data.events?.length || 0) &&
                          ` of ${data.pagination.totalResults} total`}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty State - No query */}
        {!showResults && !showRecentSearches && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-16 max-w-md mx-auto"
          >
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-muted/50 mb-6">
              <Search className="h-10 w-10 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-bold mb-2">Find prediction markets</h3>
            <p className="text-sm text-muted-foreground">
              Search for markets by topic, event name, or category. Start typing
              to see results.
            </p>
          </motion.div>
        )}
      </main>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <SearchContent />
    </Suspense>
  );
}
