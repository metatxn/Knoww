import { readClobOrderPusdAllowance } from "@knoww/shared-types/approvals";
import {
  CTF_JSON_ABI,
  readPolymarketOutcomeBalance,
} from "@knoww/shared-types/ctf";
import { resolvePolymarketProtocolVersion } from "@knoww/shared-types/polymarket";
import type { Address } from "viem";

import { CTF_ADDRESS, PUSD_DECIMALS } from "@/constants/contracts";
import { getRpcUrl } from "@/lib/rpc";

export async function readConditionalBalanceRaw(
  tokenId: string,
  owner: string
): Promise<bigint> {
  const { createPublicClient, http } = await import("viem");
  const { polygon } = await import("@/lib/chains");

  const publicClient = createPublicClient({
    chain: polygon,
    transport: http(getRpcUrl()),
  });

  if (resolvePolymarketProtocolVersion(tokenId) === "v2")
    return readPolymarketOutcomeBalance(
      publicClient,
      owner as Address,
      tokenId,
      "v2"
    );
  const balances = (await publicClient.readContract({
    address: CTF_ADDRESS as Address,
    abi: CTF_JSON_ABI,
    functionName: "balanceOfBatch",
    args: [[owner as Address], [BigInt(tokenId)]],
  })) as readonly bigint[];
  return balances[0] ?? BigInt(0);
}

export async function readPusdAllowance(
  targetAddress: string,
  negRisk = false,
  protocolVersion: "v1" | "v2" = "v1"
) {
  const { createPublicClient, http, formatUnits } = await import("viem");
  const { polygon } = await import("@/lib/chains");

  const client = createPublicClient({
    chain: polygon,
    transport: http(getRpcUrl()),
  });

  const allowance = await readClobOrderPusdAllowance(
    client,
    targetAddress as Address,
    negRisk,
    { protocolVersion }
  );

  return {
    allowance: Number(formatUnits(allowance, PUSD_DECIMALS)),
    allowanceRaw: allowance.toString(),
    decimals: PUSD_DECIMALS,
    exchange:
      protocolVersion === "v2"
        ? "EXCHANGE_V3"
        : negRisk
          ? "NEG_RISK_CTF_EXCHANGE"
          : "CTF_EXCHANGE",
  };
}
