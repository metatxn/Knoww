"use client";

import { AnimatePresence, m } from "framer-motion";
import { Merge, MoreHorizontal, Split } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MergeSharesModal } from "@/components/trading/merge-shares-modal";
import { SplitSharesModal } from "@/components/trading/split-shares-modal";
import type {
  PlatformTradingUi,
  TradingSlotProps,
} from "@/components/trading/types";
import { usePolymarketBuyFeeEstimate } from "./fee-estimate";
import { usePolymarketOrderReadiness } from "./order-readiness";
import { isPolymarketTradingDetails } from "./trading-target";

/**
 * Polymarket's optional trading UI: the neg-risk badge beside the title and
 * the split/merge menu, which only make sense for CTF-backed markets. The
 * ticket shows the extras once the user can trade on Polymarket.
 */

function PolymarketMarketBadge({ details }: TradingSlotProps) {
  if (!isPolymarketTradingDetails(details) || !details.negRisk) {
    return null;
  }
  return <span className="neg">Neg Risk</span>;
}

function PolymarketTradingExtras({ market, details }: TradingSlotProps) {
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Close more menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        moreMenuRef.current &&
        !moreMenuRef.current.contains(event.target as Node)
      ) {
        setShowMoreMenu(false);
      }
    }
    if (showMoreMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showMoreMenu]);

  if (!isPolymarketTradingDetails(details)) {
    return null;
  }

  return (
    <>
      <div className="relative shrink-0 mt-3" ref={moreMenuRef}>
        <button
          type="button"
          onClick={() => setShowMoreMenu(!showMoreMenu)}
          className={`h-[30px] w-9 transition-colors flex items-center justify-center border border-(--kwm-hl) rounded-md ${
            showMoreMenu
              ? "text-(--kwm-ink) bg-(--kwm-bg-3)"
              : "text-(--kwm-ink-3) hover:text-(--kwm-ink)"
          }`}
          title="More options"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
        <AnimatePresence>
          {showMoreMenu && (
            <m.div
              initial={{ opacity: 0, y: -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-full mt-1 z-50 min-w-[140px] bg-(--kwm-panel) border border-(--kwm-hl-2) rounded-md overflow-hidden"
            >
              <button
                type="button"
                onClick={() => {
                  setShowSplitModal(true);
                  setShowMoreMenu(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-(--kwm-ink) hover:bg-(--kwm-bg-3) transition-colors"
              >
                <Split className="h-3.5 w-3.5 text-(--kwm-ink-3)" />
                Split
              </button>
              <div className="h-px bg-(--kwm-hl)" />
              <button
                type="button"
                onClick={() => {
                  setShowMergeModal(true);
                  setShowMoreMenu(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-(--kwm-ink) hover:bg-(--kwm-bg-3) transition-colors"
              >
                <Merge className="h-3.5 w-3.5 text-(--kwm-ink-3)" />
                Merge
              </button>
            </m.div>
          )}
        </AnimatePresence>
      </div>

      <SplitSharesModal
        open={showSplitModal}
        onOpenChange={setShowSplitModal}
        conditionId={details.conditionId}
        marketTitle={market.title}
        negRisk={details.negRisk}
      />

      <MergeSharesModal
        open={showMergeModal}
        onOpenChange={setShowMergeModal}
        conditionId={details.conditionId}
        yesTokenId={market.outcomes[0]?.sourceOutcomeId || ""}
        noTokenId={market.outcomes[1]?.sourceOutcomeId || ""}
        marketTitle={market.title}
        negRisk={details.negRisk}
      />
    </>
  );
}

export const polymarketTradingUi: PlatformTradingUi = {
  MarketBadge: PolymarketMarketBadge,
  TradingExtras: PolymarketTradingExtras,
  useOrderReadiness: usePolymarketOrderReadiness,
  useBuyFeeEstimate: usePolymarketBuyFeeEstimate,
};
