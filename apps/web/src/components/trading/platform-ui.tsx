import type { PlatformId } from "@knoww/services/core";
import { polymarketTradingUi } from "@/polymarket/trading-ui";
import type { PlatformTradingUi } from "./types";

/**
 * The web app's platform UI map. A platform gets an entry only when it needs
 * an optional slot in the trading form; everything else renders from the
 * canonical market. This file and the platform's own folder are the only web
 * code that names a platform on the trading path.
 * See docs/decisions/2026-09-03-aggregator-platform-adapters.md,
 * "Adding a platform".
 */
const PLATFORM_TRADING_UI: Partial<Record<PlatformId, PlatformTradingUi>> = {
  polymarket: polymarketTradingUi,
};

export function getPlatformTradingUi(
  platform: PlatformId
): PlatformTradingUi | undefined {
  return PLATFORM_TRADING_UI[platform];
}
