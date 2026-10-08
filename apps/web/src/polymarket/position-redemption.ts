import {
  decodePolymarketV2AssetId,
  type PolymarketProtocolVersion,
  resolvePolymarketProtocolVersion,
} from "@knoww/shared-types/polymarket";
import Decimal from "decimal.js";

export interface RedemptionPosition {
  asset?: string;
  conditionId: string;
  size: number | string;
  outcomeIndex?: number;
}

export function getPositionRedemption(position: RedemptionPosition): {
  protocolVersion: PolymarketProtocolVersion;
  redemption?: { outcomeIndex: 0 | 1; amount: string };
} {
  if (!position.asset) throw new Error("Missing position asset ID");
  const protocolVersion = resolvePolymarketProtocolVersion(position.asset);
  if (protocolVersion === "v1") return { protocolVersion };
  const decoded = decodePolymarketV2AssetId(position.asset);
  const conditionId = position.conditionId.toLowerCase();
  if (
    conditionId !== decoded.conditionId &&
    conditionId !== `${decoded.conditionId}00`
  )
    throw new Error("Position asset does not match condition ID");
  if (
    position.outcomeIndex !== undefined &&
    position.outcomeIndex !== decoded.outcomeIndex
  )
    throw new Error("Position outcome index does not match asset ID");
  const amount = new Decimal(position.size);
  if (!amount.isFinite() || amount.lte(0) || amount.decimalPlaces() > 6)
    throw new Error("Invalid redemption amount");
  return {
    protocolVersion,
    redemption: {
      outcomeIndex: decoded.outcomeIndex,
      amount: amount.toFixed(),
    },
  };
}
