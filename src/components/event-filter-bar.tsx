"use client";

import {
  Activity,
  CalendarDays,
  ChevronDown,
  Clock,
  Droplets,
  RefreshCw,
  SlidersHorizontal,
  Tag,
} from "lucide-react";
import { useCallback } from "react";
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
  VOLUME_24HR_PRESETS,
} from "@/context/event-filter-context";
import { useTags } from "@/hooks/use-tags";
import { cn } from "@/lib/utils";

// Sort options
const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "volume", label: "Volume" },
  { value: "liquidity", label: "Liquidity" },
  { value: "ending", label: "Ending Soon" },
];

export function EventFilterBar() {
  const {
    filters,
    setVolume24hr,
    setLiquidity,
    toggleStatus,
    setTagSlugs,
    setDateRange,
    clearAllFilters,
    hasActiveFilters,
  } = useEventFilters();

  const { data: tags } = useTags();

  // Get current filter display values
  const volume24hrLabel =
    VOLUME_24HR_PRESETS.find((p) => p.value === filters.volume24hr)?.label ||
    "Any";
  const liquidityLabel =
    LIQUIDITY_PRESETS.find((p) => p.value === filters.liquidity)?.label ||
    "Any";

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
  const dateRangeLabel =
    !filters.dateRange.start && !filters.dateRange.end
      ? "24h"
      : filters.dateRange.start && filters.dateRange.end
        ? "Custom"
        : "All time";

  // Handle volume selection
  const handleVolume24hrChange = useCallback(
    (value: number | null) => {
      setVolume24hr(value);
    },
    [setVolume24hr],
  );

  const handleLiquidityChange = useCallback(
    (value: number | null) => {
      setLiquidity(value);
    },
    [setLiquidity],
  );

  const handleTagToggle = useCallback(
    (tagSlug: string) => {
      if (filters.tagSlugs.includes(tagSlug)) {
        setTagSlugs(filters.tagSlugs.filter((t) => t !== tagSlug));
      } else {
        setTagSlugs([...filters.tagSlugs, tagSlug]);
      }
    },
    [filters.tagSlugs, setTagSlugs],
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
    [setDateRange],
  );

  return (
    <div className="flex items-center gap-4 py-4 border-t border-border/40 overflow-x-auto scrollbar-hide">
      {/* Timeframe Filter */}
      <div className="flex flex-col gap-1.5 min-w-[100px]">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Timeframe
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 justify-start gap-2 px-2 font-medium text-sm hover:bg-muted/50"
            >
              <Clock className="h-4 w-4 text-muted-foreground" />
              {dateRangeLabel}
              <ChevronDown className="h-3 w-3 ml-auto text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-36">
            <DropdownMenuCheckboxItem
              checked={
                filters.dateRange.start !== null &&
                filters.dateRange.end !== null
              }
              onCheckedChange={() => handleDatePreset("24h")}
            >
              24h
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={false}
              onCheckedChange={() => handleDatePreset("week")}
            >
              7 days
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={false}
              onCheckedChange={() => handleDatePreset("month")}
            >
              30 days
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={!filters.dateRange.start && !filters.dateRange.end}
              onCheckedChange={() => handleDatePreset("all")}
            >
              All time
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Liquidity Filter */}
      <div className="flex flex-col gap-1.5 min-w-[100px]">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Liquidity
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 justify-start gap-2 px-2 font-medium text-sm hover:bg-muted/50",
                filters.liquidity !== null && "text-primary",
              )}
            >
              <Droplets className="h-4 w-4 text-muted-foreground" />
              {liquidityLabel}
              <ChevronDown className="h-3 w-3 ml-auto text-muted-foreground" />
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
      <div className="flex flex-col gap-1.5 min-w-[100px]">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Status
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 justify-start gap-2 px-2 font-medium text-sm hover:bg-muted/50",
                (filters.status.length !== 1 ||
                  !filters.status.includes("active")) &&
                  "text-primary",
              )}
            >
              <Activity className="h-4 w-4 text-muted-foreground" />
              {statusLabel}
              <ChevronDown className="h-3 w-3 ml-auto text-muted-foreground" />
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
      <div className="flex flex-col gap-1.5 min-w-[100px]">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Tags
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 justify-start gap-2 px-2 font-medium text-sm hover:bg-muted/50",
                filters.tagSlugs.length > 0 && "text-primary",
              )}
            >
              <Tag className="h-4 w-4 text-muted-foreground" />
              {tagsLabel}
              <ChevronDown className="h-3 w-3 ml-auto text-muted-foreground" />
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
      <div className="flex flex-col gap-1.5 min-w-[100px]">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Volume
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 justify-start gap-2 px-2 font-medium text-sm hover:bg-muted/50",
                filters.volume24hr !== null && "text-primary",
              )}
            >
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
              {volume24hrLabel}
              <ChevronDown className="h-3 w-3 ml-auto text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-36">
            {VOLUME_24HR_PRESETS.map((preset) => (
              <DropdownMenuCheckboxItem
                key={preset.label}
                checked={filters.volume24hr === preset.value}
                onCheckedChange={() => handleVolume24hrChange(preset.value)}
              >
                {preset.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Sort Filter */}
      <div className="flex flex-col gap-1.5 min-w-[100px]">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Sort
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 justify-start gap-2 px-2 font-medium text-sm hover:bg-muted/50"
            >
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              Newest
              <ChevronDown className="h-3 w-3 ml-auto text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-36">
            {SORT_OPTIONS.map((option) => (
              <DropdownMenuCheckboxItem
                key={option.value}
                checked={option.value === "newest"}
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
