import {
  DEFAULT_APPROVAL_AMOUNT,
  parseApprovalAmountRaw,
} from "@knoww/shared-types/trading";

export const DEFAULT_TRADING_APPROVAL_RAW = parseApprovalAmountRaw(
  DEFAULT_APPROVAL_AMOUNT
);

export function parseRawUnits(
  value: string | number | bigint | undefined
): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0
      ? BigInt(Math.trunc(value))
      : BigInt(0);
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return BigInt(value);
  }
  return BigInt(0);
}

export function isBalanceAllowanceError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return /not enough balance\s*\/\s*allowance|balance is not enough/i.test(
    message
  );
}

export type ClobOperationStep =
  | "idle"
  | "checking"
  | "approving"
  | "preparing"
  | "placing";
