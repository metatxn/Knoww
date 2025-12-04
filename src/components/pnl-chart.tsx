"use client";

import { motion } from "framer-motion";
import {
  ArrowDownRight,
  ArrowUpRight,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type PnLDataPoint,
  type PnLInterval,
  usePnLHistory,
} from "@/hooks/use-pnl-history";

interface PnLChartProps {
  userAddress?: string;
  height?: number;
  showIntervalSelector?: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

function formatCurrency(value: number): string {
  const absValue = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (absValue >= 1_000_000) {
    return `${sign}$${(absValue / 1_000_000).toFixed(2)}M`;
  }
  if (absValue >= 1000) {
    return `${sign}$${(absValue / 1000).toFixed(2)}K`;
  }
  return `${sign}$${absValue.toFixed(2)}`;
}

function formatPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const INTERVAL_OPTIONS: { value: PnLInterval; label: string }[] = [
  { value: "1d", label: "1D" },
  { value: "1w", label: "1W" },
  { value: "1m", label: "1M" },
  { value: "3m", label: "3M" },
  { value: "1y", label: "1Y" },
  { value: "all", label: "All" },
];

// ============================================================================
// Chart Component
// ============================================================================

function InteractiveLineChart({
  data,
  height = 200,
  isPositive,
}: {
  data: PnLDataPoint[];
  height: number;
  isPositive: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Calculate chart bounds and points
  const { points, minPnl, maxPnl } = useMemo(() => {
    if (data.length === 0) return { points: [], minPnl: 0, maxPnl: 0 };

    const pnlValues = data.map((d) => d.pnl);
    const min = Math.min(...pnlValues);
    const max = Math.max(...pnlValues);
    const range = max - min || 1;

    // Add 10% padding
    const padding = range * 0.1;
    const adjMin = min - padding;
    const adjMax = max + padding;
    const adjRange = adjMax - adjMin;

    const pts = data.map((d, i) => {
      const x = data.length === 1 ? 50 : (i / (data.length - 1)) * 100;
      const y = height - ((d.pnl - adjMin) / adjRange) * height;
      return { x, y, data: d };
    });

    return { points: pts, minPnl: min, maxPnl: max };
  }, [data, height]);

  // Generate simple polyline path (straight lines between points)
  const linePath = useMemo(() => {
    if (points.length === 0) return "";
    return points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
      .join(" ");
  }, [points]);

  // Generate area path
  const areaPath = useMemo(() => {
    if (points.length === 0) return "";
    return `${linePath} L ${points[points.length - 1].x} ${height} L ${
      points[0].x
    } ${height} Z`;
  }, [linePath, points, height]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!containerRef.current || data.length === 0) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const relativeX = x / rect.width;

      const index = Math.round(relativeX * (data.length - 1));
      setHoveredIndex(Math.max(0, Math.min(data.length - 1, index)));
    },
    [data.length]
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredIndex(null);
  }, []);

  if (points.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-muted-foreground text-sm"
        style={{ height }}
      >
        No data available
      </div>
    );
  }

  const strokeColor = isPositive ? "#10b981" : "#ef4444";
  const hoveredPoint = hoveredIndex !== null ? points[hoveredIndex] : null;

  return (
    <div
      ref={containerRef}
      className="relative cursor-crosshair select-none"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ height }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        className="overflow-visible"
      >
        <defs>
          <linearGradient
            id={`gradient-${isPositive}`}
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.25" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Subtle grid lines */}
        {[0.25, 0.5, 0.75].map((tick) => (
          <line
            key={tick}
            x1="0"
            y1={height * tick}
            x2="100"
            y2={height * tick}
            stroke="currentColor"
            strokeOpacity="0.06"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* Area fill */}
        <path d={areaPath} fill={`url(#gradient-${isPositive})`} />

        {/* Main line */}
        <path
          d={linePath}
          fill="none"
          stroke={strokeColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* Hover vertical line */}
        {hoveredPoint && (
          <line
            x1={hoveredPoint.x}
            y1="0"
            x2={hoveredPoint.x}
            y2={height}
            stroke={strokeColor}
            strokeWidth="1"
            strokeOpacity="0.4"
            strokeDasharray="4,4"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {/* Hover dot (HTML element for perfect circle) */}
      {hoveredPoint && (
        <div
          className="absolute w-3 h-3 rounded-full border-2 border-background pointer-events-none"
          style={{
            left: `${hoveredPoint.x}%`,
            top: hoveredPoint.y,
            backgroundColor: strokeColor,
            boxShadow: `0 0 8px ${strokeColor}`,
            transform: "translate(-50%, -50%)",
          }}
        />
      )}

      {/* Tooltip */}
      {hoveredPoint && hoveredIndex !== null && (
        <div
          className="absolute z-20 pointer-events-none"
          style={{
            left: `${Math.min(Math.max(hoveredPoint.x, 12), 88)}%`,
            top: 8,
            transform: "translateX(-50%)",
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
            className="bg-popover border border-border rounded-lg shadow-lg px-3 py-2 text-center min-w-[110px]"
          >
            <p className="text-[10px] text-muted-foreground mb-1">
              {formatDate(hoveredPoint.data.timestamp)}
            </p>
            <p
              className={`text-sm font-bold ${
                hoveredPoint.data.pnl >= 0 ? "text-emerald-500" : "text-red-500"
              }`}
            >
              {formatCurrency(hoveredPoint.data.pnl)}
            </p>
            {hoveredIndex > 0 && (
              <p
                className={`text-[10px] flex items-center justify-center gap-0.5 mt-0.5 ${
                  hoveredPoint.data.pnl - data[hoveredIndex - 1].pnl >= 0
                    ? "text-emerald-500"
                    : "text-red-500"
                }`}
              >
                {hoveredPoint.data.pnl - data[hoveredIndex - 1].pnl >= 0 ? (
                  <ArrowUpRight className="h-2.5 w-2.5" />
                ) : (
                  <ArrowDownRight className="h-2.5 w-2.5" />
                )}
                {formatCurrency(
                  Math.abs(hoveredPoint.data.pnl - data[hoveredIndex - 1].pnl)
                )}
              </p>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function PnLChart({
  userAddress,
  height = 220,
  showIntervalSelector = true,
}: PnLChartProps) {
  const [interval, setInterval] = useState<PnLInterval>("1m");

  const { data, isLoading, error } = usePnLHistory({
    userAddress,
    interval,
    fidelity: interval === "1d" ? "1h" : "1d",
  });

  const isPositive = (data?.summary?.endPnl || 0) >= 0;
  const hasData = data?.data && data.data.length > 0;

  return (
    <div className="rounded-2xl bg-card border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div
            className={`p-1.5 rounded-lg ${
              hasData
                ? isPositive
                  ? "bg-emerald-500/10"
                  : "bg-red-500/10"
                : "bg-muted"
            }`}
          >
            {isPositive ? (
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
          </div>
          <div>
            <h3 className="font-semibold text-sm">P&L History</h3>
            {hasData && (
              <p className="text-[10px] text-muted-foreground">
                {data.summary.dataPoints} points
              </p>
            )}
          </div>
        </div>

        {showIntervalSelector && (
          <div className="flex items-center gap-0.5 p-1 bg-muted/50 rounded-lg">
            {INTERVAL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setInterval(opt.value)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  interval === opt.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        {isLoading ? (
          <div className="space-y-4">
            <div className="flex items-baseline gap-3">
              <Skeleton className="h-9 w-28" />
              <Skeleton className="h-6 w-24" />
            </div>
            <Skeleton className="w-full" style={{ height }} />
          </div>
        ) : error ? (
          <div
            className="flex flex-col items-center justify-center text-muted-foreground text-sm"
            style={{ height }}
          >
            <p>Failed to load P&L data</p>
          </div>
        ) : !hasData ? (
          <div
            className="flex flex-col items-center justify-center text-muted-foreground"
            style={{ height }}
          >
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-3">
              <TrendingUp className="h-6 w-6 opacity-40" />
            </div>
            <p className="text-sm font-medium">No trading history</p>
            <p className="text-xs opacity-60 mt-1">Start trading to see data</p>
          </div>
        ) : (
          <div>
            {/* Summary */}
            <div className="flex items-baseline gap-3 mb-5">
              <span
                className={`text-3xl font-bold ${
                  isPositive ? "text-emerald-500" : "text-red-500"
                }`}
              >
                {formatCurrency(data.summary.endPnl)}
              </span>
              <span
                className={`text-sm flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${
                  data.summary.change >= 0
                    ? "bg-emerald-500/10 text-emerald-500"
                    : "bg-red-500/10 text-red-500"
                }`}
              >
                {data.summary.change >= 0 ? (
                  <ArrowUpRight className="h-3 w-3" />
                ) : (
                  <ArrowDownRight className="h-3 w-3" />
                )}
                {formatCurrency(Math.abs(data.summary.change))} (
                {formatPercent(data.summary.changePercent)})
              </span>
            </div>

            {/* Chart */}
            <InteractiveLineChart
              data={data.data}
              height={height}
              isPositive={isPositive}
            />

            {/* Footer */}
            <div className="flex justify-between items-center text-xs text-muted-foreground mt-4 pt-3 border-t border-border">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                High: {formatCurrency(data.summary.high)}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                Low: {formatCurrency(data.summary.low)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
