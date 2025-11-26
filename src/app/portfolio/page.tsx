"use client";

import { useAppKit } from "@reown/appkit/react";
import { motion } from "framer-motion";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Clock,
  DollarSign,
  ListOrdered,
  Percent,
  RefreshCw,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { useAccount } from "wagmi";
import { Navbar } from "@/components/navbar";
import { PositionCard } from "@/components/position-card";
import { TradeHistory } from "@/components/trade-history";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCancelOrder, useOpenOrders } from "@/hooks/use-open-orders";
import { type PnLPeriod, useUserPnL } from "@/hooks/use-user-pnl";
import { useUserPositions } from "@/hooks/use-user-positions";
import { useUserTrades } from "@/hooks/use-user-trades";

/**
 * Format currency value
 */
function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  }
  if (Math.abs(value) >= 1000) {
    return `$${(value / 1000).toFixed(2)}K`;
  }
  return `$${value.toFixed(2)}`;
}

/**
 * Format percentage
 */
function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

/**
 * Stats card component
 */
function StatCard({
  title,
  value,
  change,
  icon: Icon,
  isLoading,
}: {
  title: string;
  value: string;
  change?: number;
  icon: React.ElementType;
  isLoading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            {isLoading ? (
              <Skeleton className="h-7 w-24" />
            ) : (
              <p className="text-2xl font-bold">{value}</p>
            )}
            {change !== undefined && !isLoading && (
              <p
                className={`text-sm flex items-center gap-1 ${
                  change >= 0 ? "text-green-500" : "text-red-500"
                }`}
              >
                {change >= 0 ? (
                  <ArrowUpRight className="h-3 w-3" />
                ) : (
                  <ArrowDownRight className="h-3 w-3" />
                )}
                {formatPercent(change)}
              </p>
            )}
          </div>
          <div className="p-3 rounded-full bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Portfolio Page
 *
 * Displays user's positions, trade history, open orders, and P&L summary.
 */
export default function PortfolioPage() {
  const { isConnected, address } = useAccount();
  const { open } = useAppKit();
  const [pnlPeriod, setPnlPeriod] = useState<PnLPeriod>("all");

  // Fetch data
  const {
    data: positionsData,
    isLoading: loadingPositions,
    refetch: refetchPositions,
  } = useUserPositions();

  const {
    data: tradesData,
    isLoading: loadingTrades,
    refetch: refetchTrades,
  } = useUserTrades({ limit: 50 });

  const {
    data: ordersData,
    isLoading: loadingOrders,
    refetch: refetchOrders,
  } = useOpenOrders();

  const {
    data: pnlData,
    isLoading: loadingPnl,
    refetch: refetchPnl,
  } = useUserPnL({ period: pnlPeriod });

  const { mutate: cancelOrder, isPending: cancellingOrder } = useCancelOrder();

  // Refresh all data
  const handleRefresh = () => {
    refetchPositions();
    refetchTrades();
    refetchOrders();
    refetchPnl();
  };

  // Not connected state
  if (!isConnected) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="px-4 md:px-6 lg:px-8 py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-20 text-center"
          >
            <div className="p-6 rounded-full bg-muted mb-6">
              <Wallet className="h-12 w-12 text-muted-foreground" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Connect Your Wallet</h1>
            <p className="text-muted-foreground mb-6 max-w-md">
              Connect your wallet to view your portfolio, positions, and trading
              history.
            </p>
            <Button size="lg" onClick={() => open()}>
              <Wallet className="mr-2 h-4 w-4" />
              Connect Wallet
            </Button>
          </motion.div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <motion.main
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="px-4 md:px-6 lg:px-8 py-6 space-y-6"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Portfolio</h1>
            <p className="text-muted-foreground">
              {address?.slice(0, 6)}...{address?.slice(-4)}
            </p>
          </div>
          <Button variant="outline" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Portfolio Value"
            value={formatCurrency(pnlData?.portfolio.currentValue || 0)}
            icon={DollarSign}
            isLoading={loadingPnl}
          />
          <StatCard
            title="Total P&L"
            value={formatCurrency(pnlData?.pnl.total || 0)}
            change={pnlData?.pnl.roi}
            icon={TrendingUp}
            isLoading={loadingPnl}
          />
          <StatCard
            title="Win Rate"
            value={`${(pnlData?.performance.winRate || 0).toFixed(1)}%`}
            icon={Percent}
            isLoading={loadingPnl}
          />
          <StatCard
            title="Open Orders"
            value={ordersData?.count?.toString() || "0"}
            icon={ListOrdered}
            isLoading={loadingOrders}
          />
        </div>

        {/* P&L Period Selector */}
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Period:</span>
          <div className="flex gap-1">
            {(["1d", "7d", "30d", "90d", "all"] as PnLPeriod[]).map(
              (period) => (
                <Button
                  key={period}
                  variant={pnlPeriod === period ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setPnlPeriod(period)}
                >
                  {period === "all" ? "All" : period}
                </Button>
              ),
            )}
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="positions" className="space-y-4">
          <TabsList>
            <TabsTrigger value="positions" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Positions
              {positionsData?.summary.positionCount ? (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-primary/20 rounded-full">
                  {positionsData.summary.positionCount}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="trades" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              Trade History
            </TabsTrigger>
            <TabsTrigger value="orders" className="gap-2">
              <ListOrdered className="h-4 w-4" />
              Open Orders
              {ordersData?.count ? (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-primary/20 rounded-full">
                  {ordersData.count}
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>

          {/* Positions Tab */}
          <TabsContent value="positions" className="space-y-4">
            {loadingPositions ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <div className="flex gap-4">
                        <Skeleton className="w-12 h-12 rounded-lg" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="h-3 w-1/2" />
                          <Skeleton className="h-6 w-24" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : positionsData?.positions.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Positions</h3>
                  <p className="text-muted-foreground mb-4">
                    You don&apos;t have any open positions yet.
                  </p>
                  <Button asChild>
                    <a href="/">Browse Markets</a>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {positionsData?.positions.map((position, index) => (
                  <PositionCard
                    key={position.id}
                    position={position}
                    delay={index * 0.05}
                    onSell={(pos) => {
                      // Navigate to market page for selling
                      window.location.href = `/markets/${pos.market.slug}`;
                    }}
                  />
                ))}
              </div>
            )}

            {/* Position Summary */}
            {positionsData && positionsData.positions.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Position Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Total Value
                      </p>
                      <p className="text-xl font-bold">
                        {formatCurrency(positionsData.summary.totalValue)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Unrealized P&L
                      </p>
                      <p
                        className={`text-xl font-bold ${
                          positionsData.summary.totalUnrealizedPnl >= 0
                            ? "text-green-500"
                            : "text-red-500"
                        }`}
                      >
                        {formatCurrency(
                          positionsData.summary.totalUnrealizedPnl,
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Realized P&L
                      </p>
                      <p
                        className={`text-xl font-bold ${
                          positionsData.summary.totalRealizedPnl >= 0
                            ? "text-green-500"
                            : "text-red-500"
                        }`}
                      >
                        {formatCurrency(positionsData.summary.totalRealizedPnl)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Positions</p>
                      <p className="text-xl font-bold">
                        {positionsData.summary.positionCount}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Trade History Tab */}
          <TabsContent value="trades">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Trade History</CardTitle>
              </CardHeader>
              <CardContent>
                <TradeHistory
                  trades={tradesData?.trades || []}
                  isLoading={loadingTrades}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Open Orders Tab */}
          <TabsContent value="orders" className="space-y-4">
            {loadingOrders ? (
              <Card>
                <CardContent className="p-4 space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="h-10 w-10 rounded" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                      <Skeleton className="h-8 w-20" />
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : ordersData?.orders.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <ListOrdered className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Open Orders</h3>
                  <p className="text-muted-foreground">
                    You don&apos;t have any pending orders.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Open Orders</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {ordersData?.orders.map((order) => (
                      <div
                        key={order.id}
                        className="flex items-center justify-between p-3 rounded-lg border"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`px-2 py-1 text-xs font-medium rounded ${
                              order.side === "BUY"
                                ? "bg-green-500/20 text-green-600"
                                : "bg-red-500/20 text-red-600"
                            }`}
                          >
                            {order.side}
                          </span>
                          <div>
                            <p className="font-medium">
                              {order.market?.question ||
                                `Token ${order.tokenId.slice(0, 8)}...`}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {order.remainingSize} @{" "}
                              {(order.price * 100).toFixed(1)}¢
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => cancelOrder(order.id)}
                          disabled={cancellingOrder}
                        >
                          Cancel
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </motion.main>
    </div>
  );
}
