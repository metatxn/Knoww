import type { LegacyClobCompatibleClient } from "@knoww/shared-types/polymarket-unified";

/** Which of `orderIds` count towards Polymarket's liquidity rewards. */
export async function checkOrdersScoring(
  client: LegacyClobCompatibleClient,
  orderIds: string[]
): Promise<Record<string, boolean>> {
  return client.areOrdersScoring({ orderIds });
}
