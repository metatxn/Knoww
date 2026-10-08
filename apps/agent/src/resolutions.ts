import { createLogger } from "@knoww/logger";
import { normalizeProtocolConditionId } from "@knoww/shared-types/ctf";
import {
  decodePolymarketV2AssetId,
  resolvePolymarketProtocolVersion,
} from "@knoww/shared-types/polymarket";
import { createUnifiedPolymarketPublicClient } from "@knoww/shared-types/polymarket-unified";
import Decimal from "decimal.js";
import type { AgentWatchlistItem } from "./types.ts";

const log = createLogger("agent.resolutions");
const GAMMA_MARKETS_BASE = "https://gamma-api.polymarket.com/markets";
const GAMMA_TIMEOUT_MS = 5000;

export interface AgentResolution {
  tokenId: string;
  protocolVersion?: "v1" | "v2";
  conditionId?: string;
  marketSlug?: string;
  /** 0 if our token expired worthless, 1 if it paid out. */
  outcomeYes: 0 | 1;
  /** Raw settled payout for our position (decimal string from the SDK). */
  settlementPrice: string;
  /** ISO timestamp when the resolution row was written. */
  resolvedAt: string;
}

interface GammaMarketShape {
  conditionId?: unknown;
  clobTokenIds?: unknown;
}

interface ProtocolResolutionShape {
  conditionId?: string;
  status?: string;
  payouts?: unknown;
}

interface ResolutionClient {
  fetchResolutions(input: {
    conditionIds: string[];
  }): Promise<ProtocolResolutionShape[]>;
}

interface FetchResponseLike {
  ok: boolean;
  json(): Promise<unknown>;
}

type FetchLike = (
  url: string,
  init?: RequestInit
) => Promise<FetchResponseLike>;

// Gamma sometimes serializes array columns as JSON-encoded strings instead
// of native arrays — normalize both forms.
function parseStringList(value: unknown): string[] | null {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // fall through
    }
  }
  return null;
}

export async function fetchMarketResolution(
  item: Pick<
    AgentWatchlistItem,
    | "tokenId"
    | "conditionId"
    | "marketSlug"
    | "protocolVersion"
    | "outcomeIndex"
  >,
  resolutionClient?: ResolutionClient,
  fetcher: FetchLike = fetch as FetchLike
): Promise<AgentResolution | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GAMMA_TIMEOUT_MS);
  try {
    const protocolVersion = resolvePolymarketProtocolVersion(
      item.tokenId,
      item.protocolVersion
    );
    let conditionId = item.conditionId
      ? normalizeProtocolConditionId(item.conditionId, protocolVersion)
      : undefined;
    let index = item.outcomeIndex;

    if (protocolVersion === "v2") {
      const decoded = decodePolymarketV2AssetId(item.tokenId);
      const assetConditionId = normalizeProtocolConditionId(
        decoded.conditionId,
        "v2"
      );
      const assetOutcomeIndex = decoded.outcomeIndex;
      if (
        conditionId &&
        assetConditionId.toLowerCase() !== conditionId.toLowerCase()
      )
        return null;
      conditionId = assetConditionId;
      if (index === undefined) index = assetOutcomeIndex;
      if (!Number.isInteger(index) || index !== assetOutcomeIndex || index > 1)
        return null;
    } else if (!Number.isInteger(index)) {
      if (!conditionId) return null;
      const gammaConditionId = conditionId;
      // Older watchlist rows did not store an outcome index. Gamma supplies
      // only the token ordering; settlement values always come from the SDK.
      const gammaUrl = `${GAMMA_MARKETS_BASE}?condition_ids=${encodeURIComponent(gammaConditionId)}`;
      const gammaResponse = await fetcher(gammaUrl, {
        signal: controller.signal,
      });
      if (!gammaResponse.ok) return null;
      const gammaData = (await gammaResponse.json()) as GammaMarketShape[];
      const market = Array.isArray(gammaData)
        ? gammaData.find(
            (entry) =>
              String(entry.conditionId ?? "").toLowerCase() ===
              gammaConditionId.toLowerCase()
          )
        : undefined;
      const tokens = market ? parseStringList(market.clobTokenIds) : null;
      if (!tokens) return null;
      index = tokens.indexOf(item.tokenId);
    }

    if (!conditionId) return null;
    if (typeof index !== "number" || !Number.isInteger(index) || index < 0)
      return null;

    const client: ResolutionClient = (resolutionClient ??
      createUnifiedPolymarketPublicClient()) as unknown as ResolutionClient;
    const resolutions = await client.fetchResolutions({
      conditionIds: [conditionId],
    });
    const resolution = resolutions.find(
      (entry: ProtocolResolutionShape) =>
        entry.conditionId &&
        normalizeProtocolConditionId(
          entry.conditionId,
          protocolVersion
        ).toLowerCase() === conditionId.toLowerCase()
    );
    if (
      resolution?.status !== "resolved" ||
      !Array.isArray(resolution.payouts) ||
      index >= resolution.payouts.length
    )
      return null;
    const payouts = resolution.payouts.map((value: unknown) => {
      if (typeof value !== "string") return null;
      const decimal = new Decimal(value);
      return decimal.isFinite() && decimal.gte(0) && decimal.lte(1)
        ? decimal
        : null;
    });
    if (
      payouts.length === 0 ||
      payouts.some((value: Decimal | null) => value === null)
    )
      return null;
    const payout = resolution.payouts[index];
    const parsed = payouts[index];
    if (typeof payout !== "string" || !parsed) return null;

    return {
      tokenId: item.tokenId,
      protocolVersion,
      conditionId,
      marketSlug: item.marketSlug,
      outcomeYes: parsed.gte("0.5") ? 1 : 0,
      settlementPrice: payout,
      resolvedAt: new Date().toISOString(),
    };
  } catch (error) {
    log.error("resolution.fetch.failed", { tokenId: item.tokenId, error });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Per-vote Brier score = (fairProbability - outcomeYes)^2.
 * Mean across votes for a model gives that model's calibration over time.
 * Lower is better; 0.25 is "no skill" (always predicting 0.5).
 */
export function brierScore(fairProbability: number, outcomeYes: 0 | 1): number {
  const clamped = Math.min(1, Math.max(0, fairProbability));
  const diff = clamped - outcomeYes;
  return diff * diff;
}
