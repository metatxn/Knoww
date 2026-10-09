import { z } from "zod";
import type { ServiceFetchOptions } from "../../fetch-options";
import { decimalValueSchema } from "../../validation";
import type { PolymarketClientContext } from "./context";
import { camelCaseDataRow, createDataApi } from "./data-api";
import { upstreamPublicDataError } from "./errors";

const tokenIdSchema = z
  .string()
  .regex(/^[0-9]{1,78}$/)
  .pipe(
    z
      .string()
      .refine(
        (value) => BigInt(value) < BigInt(2) ** BigInt(256),
        "Token ID exceeds uint256"
      )
  );
const conditionSelectorSchema = z
  .string()
  .regex(/^0x(?:[0-9a-fA-F]{62}|[0-9a-fA-F]{64})$/);
const conditionIdSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/);

export const tokenLookupInputSchema = z
  .object({
    tokenIds: z.array(tokenIdSchema).min(1).max(50).optional(),
    conditionIds: z.array(conditionSelectorSchema).min(1).max(10).optional(),
  })
  .strict()
  .refine(
    (input) => Boolean(input.tokenIds) !== Boolean(input.conditionIds),
    "Supply exactly one of tokenIds or conditionIds"
  );

export type TokenLookupInput = z.infer<typeof tokenLookupInputSchema>;

const tokenSchema = z.object({
  tokenId: tokenIdSchema,
  conditionId: conditionIdSchema,
  structuralConditionId: conditionIdSchema.nullable(),
  // Keep the module set open so a new on-chain module does not break reads.
  module: z.string().min(1),
  outcomeIndex: z.number().int().nonnegative(),
  // Structural tokens may have no corresponding CLOB outcome.
  clobIndex: z.number().int().nonnegative().nullable(),
  outcome: z.string(),
  oppositeTokenId: tokenIdSchema,
  resolved: z.boolean(),
  finalPrice: decimalValueSchema({ min: "0", max: "1" })
    .transform(String)
    .nullable(),
  title: z.string().nullish(),
  marketSlug: z.string().nullish(),
  eventId: z
    .union([z.string(), z.number().int().nonnegative()])
    .transform(String)
    .nullish(),
  eventSlug: z.string().nullish(),
  closed: z.boolean(),
  negRisk: z.boolean(),
  negRiskMarketId: conditionIdSchema.nullish(),
  questionIndex: z.number().int().nonnegative().nullish(),
});

export type PolymarketToken = z.infer<typeof tokenSchema>;

/** HTTP-only token lookup, https://docs.polymarket.com/market-data/public-analytics#token-lookup. */
export function createTokenLookup(ctx: PolymarketClientContext) {
  const dataApi = createDataApi(ctx);
  async function fetchTokenLookup(
    input: TokenLookupInput,
    options?: ServiceFetchOptions
  ) {
    const parsed = tokenLookupInputSchema.safeParse(input);
    if (!parsed.success)
      throw upstreamPublicDataError("Invalid token lookup selectors", 400);
    return dataApi.value(
      "tokens",
      {
        token_id: parsed.data.tokenIds?.join(","),
        condition: parsed.data.conditionIds?.join(","),
      },
      z.array(
        z.preprocess(
          (raw) =>
            raw !== null && typeof raw === "object" && !Array.isArray(raw)
              ? camelCaseDataRow(raw)
              : raw,
          tokenSchema
        )
      ),
      options
    );
  }
  return { fetchTokenLookup };
}
