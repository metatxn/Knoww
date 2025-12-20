"use client";

import { ChevronDown, ChevronUp, User, Wifi } from "lucide-react";
import Image from "next/image";
import { OrderBookInline } from "@/components/order-book-summary";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ConnectionState } from "@/hooks/use-market-websocket";
import type { Position } from "@/hooks/use-user-positions";
import { cn, formatPrice, formatVolume } from "@/lib/utils";

interface OutcomesTableProps {
  sortedMarketData: {
    id: string;
    yesTokenId: string;
    noTokenId: string;
    yesPrice: string;
    noPrice: string;
    conditionId: string;
    groupItemTitle: string;
    image?: string;
    volume: string | number;
    yesProbability: number;
    change: number;
  }[];
  isOutcomeTableExpanded: boolean;
  setIsOutcomeTableExpanded: (val: boolean) => void;
  isConnected: boolean;
  connectionState: ConnectionState;
  expandedOrderBookMarketId: string | null;
  setExpandedOrderBookMarketId: (val: string | null) => void;
  selectedMarketId: string;
  setSelectedMarketId: (val: string) => void;
  selectedOutcomeIndex: number;
  setSelectedOutcomeIndex: (val: number) => void;
  preloadOrderBook: (tokenId: string | undefined) => Promise<void>;
  getMarketPosition: (market: {
    conditionId: string;
    yesTokenId: string;
    noTokenId: string;
  }) => Position | null;
}

export function OutcomesTable({
  sortedMarketData,
  isOutcomeTableExpanded,
  setIsOutcomeTableExpanded,
  isConnected,
  connectionState,
  expandedOrderBookMarketId,
  setExpandedOrderBookMarketId,
  selectedMarketId,
  setSelectedMarketId,
  selectedOutcomeIndex,
  setSelectedOutcomeIndex,
  preloadOrderBook,
  getMarketPosition,
}: OutcomesTableProps) {
  return (
    <Collapsible
      open={isOutcomeTableExpanded}
      onOpenChange={setIsOutcomeTableExpanded}
    >
      <Card className="py-0 gap-0 border-border/50 shadow-sm overflow-hidden">
        <CardHeader className="py-3 px-6 bg-muted/20 border-b border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CardTitle className="text-lg">OUTCOME</CardTitle>
              <span className="text-xs text-muted-foreground">
                {sortedMarketData.length} market
                {sortedMarketData.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {/* WebSocket connection indicator */}
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-background/50 border border-border/50 shadow-xs transition-colors duration-500">
                <Wifi
                  className={cn(
                    "h-3 w-3",
                    isConnected
                      ? "text-emerald-500"
                      : connectionState === "connecting" ||
                          connectionState === "reconnecting"
                        ? "text-amber-500 animate-pulse"
                        : "text-muted-foreground"
                  )}
                />
                <span
                  className={cn(
                    "text-[10px] font-medium uppercase tracking-wider",
                    isConnected
                      ? "text-emerald-500"
                      : connectionState === "connecting" ||
                          connectionState === "reconnecting"
                        ? "text-amber-500"
                        : "text-muted-foreground"
                  )}
                >
                  {isConnected
                    ? "Live"
                    : connectionState === "connecting"
                      ? "Connecting..."
                      : connectionState === "reconnecting"
                        ? "Reconnecting..."
                        : "Offline"}
                </span>
              </div>
              {/* Collapse/Expand toggle */}
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  {isOutcomeTableExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                  <span className="sr-only">
                    {isOutcomeTableExpanded ? "Collapse" : "Expand"} outcomes
                  </span>
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="p-0">
            <div className="divide-y divide-border/50">
              {sortedMarketData.map((market) => {
                const isMarketClosed = false;
                const isExpanded = expandedOrderBookMarketId === market.id;

                // Check if user has a position in this market
                const userPosition = getMarketPosition({
                  conditionId: market.conditionId,
                  yesTokenId: market.yesTokenId,
                  noTokenId: market.noTokenId,
                });

                return (
                  <div key={market.id}>
                    {/* Market Row - Clickable to expand/collapse */}
                    <button
                      type="button"
                      className={cn(
                        "w-full text-left px-6 py-4 transition-all cursor-pointer group",
                        selectedMarketId === market.id
                          ? "bg-primary/5 border-l-2 border-l-primary"
                          : "hover:bg-accent/30 border-l-2 border-l-transparent",
                        isExpanded && "bg-muted/30"
                      )}
                      onClick={() => {
                        // Toggle order book expansion
                        if (isExpanded) {
                          setExpandedOrderBookMarketId(null);
                        } else {
                          setExpandedOrderBookMarketId(market.id);
                          // Only open markets can drive the trading panel selection
                          if (!isMarketClosed) {
                            setSelectedMarketId(market.id);
                          }
                          // Preload both Yes and No order books for this market
                          void preloadOrderBook(market.yesTokenId);
                          void preloadOrderBook(market.noTokenId);
                        }
                      }}
                    >
                      {/* Desktop Layout (lg+) - Full grid for proper alignment */}
                      <div className="hidden lg:grid lg:grid-cols-[1fr_140px_220px] lg:items-center lg:gap-4">
                        {/* Column 1: Image + Title + Volume */}
                        <div className="flex items-center gap-3 min-w-0">
                          {market.image && (
                            <div className="relative w-10 h-10 shrink-0">
                              <Image
                                src={market.image}
                                alt={market.groupItemTitle || "Market"}
                                fill
                                sizes="40px"
                                className="rounded object-cover ring-1 ring-border/20 shadow-xs"
                              />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-sm xl:text-base truncate group-hover:text-primary transition-colors">
                                {market.groupItemTitle}
                              </h3>
                              {userPosition && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20 shrink-0">
                                        <User className="h-2.5 w-2.5" />
                                        {userPosition.size.toFixed(1)}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="text-xs font-semibold">
                                        You hold {userPosition.size.toFixed(2)}{" "}
                                        {userPosition.outcome} shares
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs xl:text-sm text-muted-foreground mt-0.5">
                              <span className="font-medium">
                                {formatVolume(market.volume)} Vol.
                              </span>
                              {market.yesTokenId && (
                                <OrderBookInline
                                  tokenId={market.yesTokenId}
                                  connectionState={connectionState}
                                />
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Column 2: Percentage + Change */}
                        <div className="flex items-center justify-end gap-2 pr-2 border-r border-border/50">
                          <span className="text-xl xl:text-2xl font-black tabular-nums min-w-[45px] xl:min-w-[50px] text-right">
                            {market.yesProbability}%
                          </span>
                          <div
                            className={cn(
                              "flex items-center gap-0.5 text-xs xl:text-sm font-bold min-w-[55px] xl:min-w-[65px] px-1.5 py-0.5 rounded",
                              market.change >= 0
                                ? "text-emerald-600 bg-emerald-500/10 dark:text-emerald-400"
                                : "text-rose-600 bg-rose-500/10 dark:text-rose-400"
                            )}
                          >
                            <span className="tabular-nums">
                              {market.change >= 0 ? "+" : ""}
                              {market.change}%
                            </span>
                          </div>
                        </div>

                        {/* Column 3: Yes/No Buttons */}
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            className={cn(
                              "h-9 px-3 text-xs xl:w-[100px] xl:h-10 xl:text-sm bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-lg shadow-emerald-500/20 transition-all active:scale-95",
                              isExpanded &&
                                selectedOutcomeIndex === 0 &&
                                "ring-2 ring-emerald-400 ring-offset-2"
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedOrderBookMarketId(market.id);
                              setSelectedMarketId(market.id);
                              setSelectedOutcomeIndex(0);
                              void preloadOrderBook(market.yesTokenId);
                            }}
                          >
                            <span className="lg:hidden xl:inline">Buy </span>
                            Yes {formatPrice(market.yesPrice)}¢
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            className={cn(
                              "h-9 px-3 text-xs xl:w-[100px] xl:h-10 xl:text-sm font-bold shadow-lg shadow-rose-500/20 transition-all active:scale-95",
                              isExpanded &&
                                selectedOutcomeIndex === 1 &&
                                "ring-2 ring-rose-400 ring-offset-2"
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedOrderBookMarketId(market.id);
                              setSelectedMarketId(market.id);
                              setSelectedOutcomeIndex(1);
                              void preloadOrderBook(market.noTokenId);
                            }}
                          >
                            <span className="lg:hidden xl:inline">Buy </span>
                            No {formatPrice(market.noPrice)}¢
                          </Button>
                        </div>
                      </div>
                    </button>

                    {/* Expanded Content ... */}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
