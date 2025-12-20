"use client";

import {
  Activity,
  ChevronDown,
  Clock,
  Droplets,
  RefreshCw,
  SlidersHorizontal,
  Tag,
} from "lucide-react";
import { useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LIQUIDITY_PRESETS,
  STATUS_OPTIONS,
  useEventFilters,
  VOLUME_WINDOW_OPTIONS,
  type VolumeWindow,
} from "@/context/event-filter-context";
import { useTags } from "@/hooks/use-tags";
import { cn } from "@/lib/utils";

export function EventFilterBar() {
  const {
    filters,
    setVolumeWindow,
    setLiquidity,
    toggleStatus,
    setTagSlugs,
    setDateRange,
    clearAllFilters,
    hasActiveFilters,
  } = useEventFilters();

  const { data: tags } = useTags();

  // Get current filter display values
  const liquidityLabel =
    LIQUIDITY_PRESETS.find((p) => p.value === filters.liquidity)?.label ||
    "Any";
  const volumeWindowLabel =
    VOLUME_WINDOW_OPTIONS.find((o) => o.value === filters.volumeWindow)
      ?.label || "24h";

  // Status display
  const statusLabel =
    filters.status.length === STATUS_OPTIONS.length
      ? "All"
      : filters.status.length === 0
        ? "None"
        : filters.status.length === 1
          ? STATUS_OPTIONS.find((s) => s.value === filters.status[0])?.label
          : `${filters.status.length} selected`;

  // Tags display
  const tagsLabel =
    filters.tagSlugs.length === 0
      ? "All"
      : filters.tagSlugs.length === 1
        ? tags?.find((t) => t.slug === filters.tagSlugs[0])?.label ||
          filters.tagSlugs[0]
        : `${filters.tagSlugs.length} tags`;

  // Date range display
  // "All time" = no date range set (both null)
  // "24h", "7 days", "30 days" = both start and end are set
  // "Custom" = only one of start/end is set (partial range)
  const dateRangeLabel = useMemo(() => {
    const { start, end } = filters.dateRange;
    // No dates set = All time
    if (!start && !end) return "All time";
    // Both dates set - check which preset it matches
    if (start && end) {
      const now = Date.now();
      const diffMs = now - start.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      // Check for approximate matches (within a few hours tolerance)
      if (diffDays <= 1.1) return "24h";
      if (diffDays <= 7.5 && diffDays >= 6.5) return "7 days";
      if (diffDays <= 31 && diffDays >= 28) return "30 days";
      return "Custom";
    }
    // Only one date set = Custom range
    return "Custom";
  }, [filters.dateRange]);

  // Handle volume window selection
  const handleVolumeWindowChange = useCallback(
    (window: VolumeWindow) => {
      setVolumeWindow(window);
    },
    [setVolumeWindow]
  );

  const handleLiquidityChange = useCallback(
    (value: number | null) => {
      setLiquidity(value);
    },
    [setLiquidity]
  );

  const handleTagToggle = useCallback(
    (tagSlug: string) => {
      if (filters.tagSlugs.includes(tagSlug)) {
        setTagSlugs(filters.tagSlugs.filter((t) => t !== tagSlug));
      } else {
        setTagSlugs([...filters.tagSlugs, tagSlug]);
      }
    },
    [filters.tagSlugs, setTagSlugs]
  );

  // Date quick presets
  const handleDatePreset = useCallback(
    (preset: "24h" | "week" | "month" | "all") => {
      const now = new Date();
      switch (preset) {
        case "24h":
          setDateRange({
            start: new Date(now.getTime() - 24 * 60 * 60 * 1000),
            end: new Date(),
          });
          break;
        case "week":
          setDateRange({
            start: new Date(now.setDate(now.getDate() - 7)),
            end: new Date(),
          });
          break;
        case "month":
          setDateRange({
            start: new Date(now.setMonth(now.getMonth() - 1)),
            end: new Date(),
          });
          break;
        case "all":
          setDateRange({ start: null, end: null });
          break;
      }
    },
    [setDateRange]
  );

  return (
    <div className="flex items-center gap-8 py-4 px-1 border-t border-border/40 overflow-x-auto scrollbar-hide">
      {/* Created At Filter */}
      <div className="flex flex-col gap-1.5 w-[120px] shrink-0">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Created At
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-full justify-start gap-2 px-2 font-medium text-sm hover:bg-muted/50"
            >
              <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="truncate">{dateRangeLabel}</span>
              <ChevronDown className="h-3 w-3 ml-auto text-muted-foreground shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-36">
            <DropdownMenuCheckboxItem
              checked={dateRangeLabel === "24h"}
              onCheckedChange={() => handleDatePreset("24h")}
            >
              24h
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={dateRangeLabel === "7 days"}
              onCheckedChange={() => handleDatePreset("week")}
            >
              7 days
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={dateRangeLabel === "30 days"}
              onCheckedChange={() => handleDatePreset("month")}
            >
              30 days
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={dateRangeLabel === "All time"}
              onCheckedChange={() => handleDatePreset("all")}
            >
              All time
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Liquidity Filter */}
      <div className="flex flex-col gap-1.5 w-[110px] shrink-0">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Liquidity
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 w-full justify-start gap-2 px-2 font-medium text-sm hover:bg-muted/50",
                filters.liquidity !== null && "text-primary"
              )}
            >
              <Droplets className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="truncate">{liquidityLabel}</span>
              <ChevronDown className="h-3 w-3 ml-auto text-muted-foreground shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-36">
            {LIQUIDITY_PRESETS.map((preset) => (
              <DropdownMenuCheckboxItem
                key={preset.label}
                checked={filters.liquidity === preset.value}
                onCheckedChange={() => handleLiquidityChange(preset.value)}
              >
                {preset.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Status Filter */}
      <div className="flex flex-col gap-1.5 w-[110px] shrink-0">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Status
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 w-full justify-start gap-2 px-2 font-medium text-sm hover:bg-muted/50",
                (filters.status.length !== 1 ||
                  !filters.status.includes("active")) &&
                  "text-primary"
              )}
            >
              <Activity className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="truncate">{statusLabel}</span>
              <ChevronDown className="h-3 w-3 ml-auto text-muted-foreground shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-36">
            {STATUS_OPTIONS.map((option) => (
              <DropdownMenuCheckboxItem
                key={option.value}
                checked={filters.status.includes(option.value)}
                onCheckedChange={() => toggleStatus(option.value)}
              >
                {option.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Tags Filter */}
      <div className="flex flex-col gap-1.5 w-[100px] shrink-0">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Tags
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 w-full justify-start gap-2 px-2 font-medium text-sm hover:bg-muted/50",
                filters.tagSlugs.length > 0 && "text-primary"
              )}
            >
              <Tag className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="truncate">{tagsLabel}</span>
              <ChevronDown className="h-3 w-3 ml-auto text-muted-foreground shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-48 max-h-64 overflow-y-auto"
          >
            <DropdownMenuCheckboxItem
              checked={filters.tagSlugs.length === 0}
              onCheckedChange={() => setTagSlugs([])}
            >
              All
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            {tags?.slice(0, 15).map((tag) => (
              <DropdownMenuCheckboxItem
                key={tag.slug}
                checked={filters.tagSlugs.includes(tag.slug)}
                onCheckedChange={() => handleTagToggle(tag.slug)}
              >
                {tag.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Volume Filter */}
      <div className="flex flex-col gap-1.5 w-[100px] shrink-0">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Volume
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 w-full justify-start gap-2 px-2 font-medium text-sm hover:bg-muted/50",
                filters.volumeWindow !== "24h" && "text-primary"
              )}
            >
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="truncate">{volumeWindowLabel}</span>
              <ChevronDown className="h-3 w-3 ml-auto text-muted-foreground shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-36">
            {VOLUME_WINDOW_OPTIONS.map((option) => (
              <DropdownMenuCheckboxItem
                key={option.value}
                checked={filters.volumeWindow === option.value}
                onCheckedChange={() => handleVolumeWindowChange(option.value)}
              >
                {option.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Refresh Button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={hasActiveFilters ? clearAllFilters : undefined}
        className="h-8 w-8 shrink-0"
      >
        <RefreshCw className="h-4 w-4 text-muted-foreground" />
      </Button>
    </div>
  );
}
