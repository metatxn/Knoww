import { isUpstreamPublicDataError } from "@knoww/services/platforms/polymarket";
import type { ServiceFetchOptions } from "@knoww/services/registry";
import { getPlatformRegistry } from "@/lib/platform-registry";

const numberFields = new Set([
  "size",
  "avgPrice",
  "initialValue",
  "grossInitialValue",
  "entryFeesUsdc",
  "currentValue",
  "cashPnl",
  "percentPnl",
  "totalBought",
  "realizedPnl",
  "percentRealizedPnl",
  "curPrice",
  "price",
  "usdcSize",
  "vol",
  "pnl",
  "amount",
]);
function webRow(row: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      numberFields.has(key) && typeof value === "string"
        ? Number(value)
        : value,
    ])
  );
}

/** Keep existing web payloads while the platform client owns the v2 wire contract. */
export async function fetchWalletDataResponse(
  resource:
    | "positions"
    | "activity"
    | "value"
    | "leaderboard"
    | "trades"
    | "holders"
    | "profile",
  params: URLSearchParams,
  options?: ServiceFetchOptions
): Promise<Response> {
  const { client } = getPlatformRegistry().getPlatformAdapter("polymarket");
  const walletAddress = params.get("user") ?? "";
  const page = {
    limit: Number(params.get("limit") ?? 100),
    offset: Number(params.get("offset") ?? 0),
  };
  const conditionIds = params.get("market")?.split(",");
  try {
    switch (resource) {
      case "profile":
        return Response.json(
          await client.fetchPublicProfile(walletAddress, options)
        );
      case "trades":
        return Response.json(
          (
            await client.fetchMarketTrades(
              {
                ...page,
                conditionIds,
                walletAddress: walletAddress || undefined,
              },
              options
            )
          ).map(webRow)
        );
      case "holders":
        return Response.json(
          (
            await client.fetchMarketHolders(
              { conditionIds: conditionIds ?? [], limit: page.limit },
              options
            )
          ).map((group) => ({ ...group, holders: group.holders.map(webRow) }))
        );

      case "positions":
        return Response.json(
          (
            await client.fetchWalletPositions(
              {
                ...page,
                walletAddress,
                conditionIds,
                sizeThreshold: params.get("sizeThreshold") ?? undefined,
                sortBy: params.get("sortBy") ?? undefined,
                sortDirection:
                  params.get("sortDirection") === "ASC" ? "ASC" : "DESC",
                ...(params.has("redeemable")
                  ? { redeemable: params.get("redeemable") === "true" }
                  : {}),
                ...(params.has("mergeable")
                  ? { mergeable: params.get("mergeable") === "true" }
                  : {}),
                ...(params.has("includeArchived")
                  ? {
                      includeArchived: params.get("includeArchived") === "true",
                    }
                  : {}),
              },
              options
            )
          ).map(webRow)
        );
      case "activity":
        return Response.json(
          (
            await client.fetchWalletActivity(
              {
                ...page,
                walletAddress,
                conditionIds,
                types: params.get("type")?.split(","),
                sortDirection:
                  params.get("sortDirection") === "ASC" ? "ASC" : "DESC",
                ...(params.has("start")
                  ? { startTimestamp: Number(params.get("start")) }
                  : {}),
                ...(params.has("end")
                  ? { endTimestamp: Number(params.get("end")) }
                  : {}),
              },
              options
            )
          ).map(webRow)
        );
      case "value": {
        const result = await client.fetchWalletPortfolioValue(
          walletAddress,
          options
        );
        return Response.json([
          { user: walletAddress, value: Number(result.value) },
        ]);
      }
      case "leaderboard": {
        const result = await client.fetchTraderLeaderboardPage(
          {
            ...page,
            walletAddress,
            userName: params.get("userName") ?? undefined,
            category: params.get("category") ?? "OVERALL",
            timePeriod: params.get("timePeriod") ?? "ALL",
            orderBy: params.get("orderBy") ?? "PNL",
          },
          options
        );
        return Response.json(result.rawEntries.map(webRow));
      }
    }
  } catch (error) {
    if (isUpstreamPublicDataError(error))
      return Response.json(
        { error: "Polymarket data unavailable" },
        { status: error.status ?? 502 }
      );
    throw error;
  }
}
