import {
  readTradingApprovalStatus,
  type TradingApprovalStatus,
} from "@knoww/shared-types/approvals";
import type { Address } from "viem";
import { getPublicClient } from "@/lib/rpc";

export type ApprovalStatus = TradingApprovalStatus;

const pendingApprovalChecks = new Map<string, Promise<ApprovalStatus>>();

export async function checkAllApprovals(
  safeAddress: string,
  approvalAmountRaw?: bigint,
  protocolVersion: "v1" | "v2" = "v1"
): Promise<ApprovalStatus> {
  const cacheKey = `${protocolVersion}:${safeAddress.toLowerCase()}:${
    approvalAmountRaw?.toString() ?? "default"
  }`;
  const pending = pendingApprovalChecks.get(cacheKey);
  if (pending) return pending;

  const check = readTradingApprovalStatus(
    getPublicClient(),
    safeAddress as Address,
    { approvalAmountRaw, protocolVersion }
  ).finally(() => {
    pendingApprovalChecks.delete(cacheKey);
  });

  pendingApprovalChecks.set(cacheKey, check);
  return check;
}

export async function needsApprovals(safeAddress: string): Promise<boolean> {
  const status = await checkAllApprovals(safeAddress);
  return !status.allApproved;
}
