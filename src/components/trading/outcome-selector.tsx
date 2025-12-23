"use client";

import type { OutcomeData } from "@/types/market";

interface OutcomeSelectorProps {
  outcomes: OutcomeData[];
  selectedOutcomeIndex: number;
  onOutcomeChange: (index: number) => void;
}

export function OutcomeSelector({
  outcomes,
  selectedOutcomeIndex,
  onOutcomeChange,
}: OutcomeSelectorProps) {
  return (
    <div className="flex gap-2">
      {outcomes.map((outcome, idx) => (
        <button
          key={outcome.tokenId}
          type="button"
          className={`flex-1 relative px-4 py-3 rounded-xl border-2 transition-all ${
            selectedOutcomeIndex === idx
              ? outcome.name === "Yes"
                ? "border-emerald-500 bg-emerald-500/5"
                : "border-red-500 bg-red-500/5"
              : "border-border hover:border-muted-foreground/50 bg-secondary/30"
          }`}
          onClick={() => onOutcomeChange(idx)}
        >
          {/* Active indicator dot */}
          {selectedOutcomeIndex === idx && (
            <span
              className={`absolute top-2 right-2 h-2 w-2 rounded-full ${
                outcome.name === "Yes" ? "bg-emerald-500" : "bg-red-500"
              }`}
            />
          )}
          <span
            className={`block text-sm font-medium ${
              outcome.name === "Yes"
                ? "text-emerald-600 dark:text-emerald-400"
                : outcome.name === "No"
                  ? "text-red-600 dark:text-red-400"
                  : "text-foreground"
            }`}
          >
            {outcome.name}
          </span>
          <span className="block text-lg font-semibold font-mono text-foreground mt-0.5">
            {(outcome.price * 100).toFixed(1)}¢
          </span>
        </button>
      ))}
    </div>
  );
}
