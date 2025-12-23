"use client";

import type { TradingSide } from "@/types/market";

interface SharesInputProps {
  shares: number;
  onSharesChange: (shares: number) => void;
  onIncrement: (delta: number) => void;
  minShares: number;
  effectiveBalance?: number;
  price: number;
  side: TradingSide;
}

export function SharesInput({
  shares,
  onSharesChange,
  onIncrement,
  minShares,
  effectiveBalance,
  price,
}: SharesInputProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-foreground">Shares</span>
        <button
          type="button"
          className="text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 font-medium"
          onClick={() => {
            if (effectiveBalance && price > 0) {
              const maxShares = Math.floor(effectiveBalance / price);
              onSharesChange(Math.max(minShares, maxShares));
            }
          }}
        >
          Max
        </button>
      </div>

      <div className="flex items-stretch gap-1.5">
        <button
          type="button"
          className="px-2 py-2 text-xs font-medium text-muted-foreground rounded-lg border border-border hover:bg-secondary/50 hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          onClick={() => onIncrement(-10)}
          disabled={shares - 10 < minShares}
        >
          -10
        </button>
        <button
          type="button"
          className="px-2.5 py-2 text-xs font-medium text-muted-foreground rounded-lg border border-border hover:bg-secondary/50 hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          onClick={() => onIncrement(-1)}
          disabled={shares - 1 < minShares}
        >
          -1
        </button>

        <input
          type="number"
          value={shares}
          onChange={(e) => {
            const val = Number.parseInt(e.target.value, 10);
            if (!Number.isNaN(val)) {
              onSharesChange(Math.max(minShares, val));
            }
          }}
          min={minShares}
          className="flex-1 min-w-0 bg-secondary/30 border border-border rounded-xl px-2 py-2.5 text-center text-base font-semibold font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
        />

        <button
          type="button"
          className="px-2.5 py-2 text-xs font-medium text-muted-foreground rounded-lg border border-border hover:bg-secondary/50 hover:text-foreground transition-colors shrink-0"
          onClick={() => onIncrement(1)}
        >
          +1
        </button>
        <button
          type="button"
          className="px-2 py-2 text-xs font-medium text-muted-foreground rounded-lg border border-border hover:bg-secondary/50 hover:text-foreground transition-colors shrink-0"
          onClick={() => onIncrement(10)}
        >
          +10
        </button>
      </div>
    </div>
  );
}
