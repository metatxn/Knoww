"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

interface MarketPriceChartProps {
  outcomes?: string[];
  outcomePrices?: string[];
  startDate?: string; // ISO date string for when the market/event started
}

type TimeRange = "1H" | "6H" | "1D" | "1W" | "1M" | "ALL";

export function MarketPriceChart({
  outcomes = [],
  outcomePrices = [],
  startDate,
}: MarketPriceChartProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>("ALL");

  // Parse outcome prices or use defaults
  const parsedPrices = useMemo(() => {
    return outcomePrices.length > 0
      ? outcomePrices.map((p) => Number.parseFloat(p))
      : [0.69, 0.29, 0.03, 0.01]; // Default probabilities that sum to ~1
  }, [outcomePrices]);

  // Generate multi-outcome price history data
  const chartData = useMemo(() => {
    const data = [];
    const now = new Date();
    let dataPoints = 90; // Default for ALL
    let startTime: Date;

    // For "ALL" view, calculate from startDate if provided
    if (timeRange === "ALL" && startDate) {
      startTime = new Date(startDate);
      // Calculate days between start date and now
      const daysDiff = Math.floor(
        (now.getTime() - startTime.getTime()) / (1000 * 60 * 60 * 24),
      );
      dataPoints = Math.max(daysDiff, 30); // At least 30 days
    } else {
      startTime = new Date();
    }

    // Adjust data points based on time range
    switch (timeRange) {
      case "1H":
        dataPoints = 12; // 5-min intervals
        break;
      case "6H":
        dataPoints = 36; // 10-min intervals
        break;
      case "1D":
        dataPoints = 24; // Hourly
        break;
      case "1W":
        dataPoints = 28; // 6-hour intervals
        break;
      case "1M":
        dataPoints = 60; // 12-hour intervals
        break;
      case "ALL":
        // dataPoints already calculated above if startDate provided
        if (!startDate) {
          dataPoints = 150; // Default 5 months if no startDate
        }
        break;
    }

    for (let i = 0; i <= dataPoints; i++) {
      const date = new Date();
      const point: Record<string, number | string> = {};

      // Calculate time offset based on range
      switch (timeRange) {
        case "1H":
          date.setMinutes(date.getMinutes() - (dataPoints - i) * 5);
          break;
        case "6H":
          date.setMinutes(date.getMinutes() - (dataPoints - i) * 10);
          break;
        case "1D":
          date.setHours(date.getHours() - (dataPoints - i));
          break;
        case "1W":
          date.setHours(date.getHours() - (dataPoints - i) * 6);
          break;
        case "1M":
          date.setHours(date.getHours() - (dataPoints - i) * 12);
          break;
        case "ALL":
          if (startDate) {
            // Start from the market/event start date
            const startTime = new Date(startDate);
            const timePerPoint =
              (now.getTime() - startTime.getTime()) / dataPoints;
            date.setTime(startTime.getTime() + timePerPoint * i);
          } else {
            date.setDate(date.getDate() - (dataPoints - i));
          }
          break;
      }

      point.date = date.toISOString();

      // Generate realistic price movement for each outcome
      parsedPrices.forEach((basePrice, idx) => {
        // Use different variance based on time range for more realistic data
        const varianceMultiplier =
          timeRange === "1H" || timeRange === "6H"
            ? 0.01
            : timeRange === "1D"
              ? 0.02
              : 0.03;

        const variance = (Math.random() - 0.5) * varianceMultiplier;
        const trend = basePrice * 0.1 * (i / dataPoints) - basePrice * 0.05; // Trend toward current value
        let price = basePrice + trend + variance;

        // Ensure prices stay between 0.01 and 0.99
        price = Math.max(0.01, Math.min(0.99, price));

        point[`outcome${idx}`] = Number.parseFloat((price * 100).toFixed(2));
      });

      data.push(point);
    }

    // For "ALL" view, sample data to show only 5 unique months
    if (timeRange === "ALL") {
      const monthlyData = new Map<string, Record<string, number | string>>();

      data.forEach((point) => {
        const date = new Date(point.date as string);
        const monthKey = `${date.getFullYear()}-${date.getMonth()}`; // Unique key for each month

        // Keep the last data point for each month (end of month)
        monthlyData.set(monthKey, point);
      });

      // Convert map to array and show all unique months (chronologically)
      const uniqueMonths = Array.from(monthlyData.values());
      return uniqueMonths;
    }

    return data;
  }, [timeRange, parsedPrices, startDate]);

  // Generate chart config based on outcomes
  const chartConfig = useMemo(() => {
    const config: ChartConfig = {};
    const colors = [
      "hsl(25, 95%, 53%)", // Orange
      "hsl(221, 83%, 53%)", // Blue
      "hsl(280, 100%, 70%)", // Purple/Pink
      "hsl(142, 76%, 36%)", // Green
    ];

    outcomes.forEach((outcome, idx) => {
      config[`outcome${idx}`] = {
        label: outcome,
        color: colors[idx % colors.length],
      };
    });

    // Fallback config if no outcomes
    if (outcomes.length === 0) {
      config.outcome0 = { label: "25 bps decrease", color: colors[0] };
      config.outcome1 = { label: "No change", color: colors[1] };
      config.outcome2 = { label: "50+ bps decrease", color: colors[2] };
      config.outcome3 = { label: "25+ bps increase", color: colors[3] };
    }

    return config;
  }, [outcomes]);

  const formatXAxis = (value: string) => {
    const date = new Date(value);
    switch (timeRange) {
      case "1H":
      case "6H":
        return date.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        });
      case "1D":
      case "1W":
        return date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
      case "1M":
        return date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
      case "ALL":
        // Show only months for ALL view
        return date.toLocaleDateString("en-US", {
          month: "short",
        });
      default:
        return date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
    }
  };

  // Calculate dynamic Y-axis domain based on actual data
  const yAxisDomain = useMemo(() => {
    if (chartData.length === 0) return [0, 100];

    let maxValue = 0;
    chartData.forEach((point) => {
      Object.keys(point).forEach((key) => {
        if (key !== "date" && typeof point[key] === "number") {
          maxValue = Math.max(maxValue, point[key] as number);
        }
      });
    });

    // Add 5% padding to the max value
    const maxWithPadding = Math.ceil(maxValue * 1.05);
    return [0, Math.min(100, maxWithPadding)]; // Cap at 100% max
  }, [chartData]);

  const timeRanges: TimeRange[] = ["1H", "6H", "1D", "1W", "1M", "ALL"];

  return (
    <div className="space-y-4">
      {/* Chart */}
      <ChartContainer config={chartConfig} className="h-[400px] w-full">
        <LineChart
          accessibilityLayer
          data={chartData}
          margin={{
            left: 0,
            right: 12,
            top: 12,
            bottom: 12,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickFormatter={formatXAxis}
            minTickGap={50}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={4}
            tickFormatter={(value) => `${value}%`}
            domain={yAxisDomain}
            width={40}
          />
          <ChartTooltip
            cursor={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }}
            content={<ChartTooltipContent />}
          />
          {Object.keys(chartConfig).map((key) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={chartConfig[key as keyof typeof chartConfig]?.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ChartContainer>

      {/* Time Range Selectors - Below Chart */}
      <div className="flex justify-center gap-2">
        {timeRanges.map((range) => (
          <Button
            key={range}
            type="button"
            variant={timeRange === range ? "default" : "ghost"}
            size="sm"
            onClick={() => setTimeRange(range)}
            className="h-8 px-3"
          >
            {range}
          </Button>
        ))}
      </div>
    </div>
  );
}
