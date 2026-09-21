import {
  type PlatformId,
  type PlatformIdentity,
  platformIdentitySchema,
  WALLET_ACCOUNT_TYPES,
} from "@knoww/services/core";
import { z } from "zod";

/**
 * Who a trading tool acts as.
 *
 * Today the caller names the account in the tool input. The ADR of 2026-08-31
 * wants the account bound to the OAuth principal instead (grilling Q1, on hold
 * since 2026-09-06). When that lands this module is the only place that
 * changes: the input schema goes away and `resolveTradingIdentity` reads the
 * linked account from the principal.
 *
 * The schemas are declared here rather than reused from `@knoww/services`
 * because the monorepo carries more than one zod major and the MCP SDK needs
 * schemas from its own copy.
 */

const evmAddressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "Expected an EVM address");

const walletIdentityInputSchema = z.object({
  kind: z.literal("wallet"),
  address: evmAddressSchema.describe(
    "The signing address (the connected EOA)."
  ),
  accountType: z
    .enum(WALLET_ACCOUNT_TYPES)
    .describe(
      "Which wallet holds the funds: the EOA itself, a Safe, or a deposit wallet."
    ),
  tradingAddress: evmAddressSchema
    .optional()
    .describe(
      "The contract wallet that holds funds when accountType is not eoa. Derived when omitted."
    ),
});

const brokerIdentityInputSchema = z.object({
  kind: z.literal("broker"),
  accountId: z.string().trim().min(1).max(200),
});

export const tradingIdentityInputSchema = z
  .discriminatedUnion("kind", [
    walletIdentityInputSchema,
    brokerIdentityInputSchema,
  ])
  .describe(
    "The platform account to act as. The platform itself comes from the tool's platform argument."
  );

export type TradingIdentityInput = z.infer<typeof tradingIdentityInputSchema>;

export function resolveTradingIdentity(
  platform: PlatformId,
  input: TradingIdentityInput
): PlatformIdentity {
  return platformIdentitySchema.parse({ ...input, platform });
}
