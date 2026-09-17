import Decimal from "decimal.js";

export interface PriceHistoryRequest {
  assetId: string;
  start?: number;
  end?: number;
  interval?: "max";
  bucketSeconds?: number;
}
export interface PriceHistoryParams {
  startTs?: string | number;
  endTs?: string | number;
  fidelity?: string | number;
}

/** Keep the legacy seconds/minutes contract at the SDK boundary. */
export function priceHistoryRequests(
  assetId: string,
  params: PriceHistoryParams
): PriceHistoryRequest[] {
  const integer = (value: string | number | undefined, name: string) => {
    if (value === undefined) return undefined;
    const result = Number(value);
    if (!Number.isSafeInteger(result) || result <= 0)
      throw new Error(`Invalid price history ${name}`);
    return result;
  };
  const wholeHistory =
    params.startTs !== undefined && Number(params.startTs) === 0;
  const start = wholeHistory ? undefined : integer(params.startTs, "start");
  const end =
    integer(params.endTs, "end") ??
    (start === undefined ? undefined : Math.floor(Date.now() / 1000));
  const fidelity = integer(params.fidelity, "fidelity");
  const bucketSeconds = fidelity === undefined ? undefined : fidelity * 60;
  if (bucketSeconds !== undefined && bucketSeconds > 86400)
    throw new Error("Price history fidelity exceeds one day");
  const base = {
    assetId,
    ...(bucketSeconds === undefined ? {} : { bucketSeconds }),
  };
  if (start === undefined) {
    if (end !== undefined && !wholeHistory)
      throw new Error("Price history end requires start");
    return [{ ...base, interval: "max" }];
  }
  if (end === undefined || end <= start)
    throw new Error("Price history end must be after start");
  const requests: PriceHistoryRequest[] = [];
  const span = 15 * 24 * 60 * 60;
  for (let from = start; from < end; from += span) {
    if (requests.length >= 256)
      throw new Error("Price history window is too large");
    requests.push({ ...base, start: from, end: Math.min(from + span, end) });
  }
  return requests;
}

export function normalizePriceHistoryPoint(
  raw: unknown,
  milliseconds = false
): { t: number; p: string } {
  if (!raw || typeof raw !== "object")
    throw new Error("Malformed price history point");
  const row = raw as Record<string, unknown>;
  const t =
    typeof row.timestamp === "number"
      ? row.timestamp / (milliseconds ? 1000 : 1)
      : NaN;
  if (
    !Number.isSafeInteger(t) ||
    t <= 0 ||
    (typeof row.price !== "number" && typeof row.price !== "string")
  )
    throw new Error("Malformed price history point");
  const p = new Decimal(row.price);
  if (!p.isFinite() || p.lt(0) || p.gt(1))
    throw new Error("Malformed price history price");
  return { t, p: p.toString() };
}

export interface PriceHistoryPaginator
  extends AsyncIterable<{ items: unknown[] }> {}
export interface PriceHistoryClient {
  listPriceHistory?(request: PriceHistoryRequest): PriceHistoryPaginator;
}

export async function readSdkPriceHistory(
  client: PriceHistoryClient,
  assetId: string,
  params: PriceHistoryParams
) {
  if (!client.listPriceHistory)
    throw new Error("Unified Polymarket SDK client cannot list price history");
  const points = new Map<number, { t: number; p: string }>();
  for (const request of priceHistoryRequests(assetId, params)) {
    let pages = 0;
    for await (const page of client.listPriceHistory(request)) {
      if (++pages > 1000)
        throw new Error("Price history pagination exceeded limit");
      for (const raw of page.items) {
        const point = normalizePriceHistoryPoint(raw, true);
        if (
          request.start !== undefined &&
          (point.t < request.start ||
            (request.end !== undefined && point.t > request.end))
        )
          throw new Error("Price history point outside requested window");
        points.set(point.t, point);
      }
    }
  }
  return [...points.values()]
    .filter(
      (point) => params.endTs === undefined || point.t <= Number(params.endTs)
    )
    .sort((a, b) => a.t - b.t);
}
