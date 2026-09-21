import { describe, expect, it } from "vitest";
import {
  callTool,
  DATA_ORIGIN,
  dataUrl,
  dataV2Page,
  devEnv,
  dispatch,
  expectGammaFetch,
  mcpRequest,
  PROTOCOL_VERSION,
  readJsonRpc,
  setupGammaFetchStub,
  type ToolCallResult,
} from "./helpers";

/** Data API v2 uses token IDs, seconds-based windows and cursor pages.
 * Tool results retain ISO timestamps and decimal-string prices.
 */

const TOKEN_ID =
  "27146956652877944551877724690365745048289675287536243265951843487691050802191";

const START_ISO = "2026-08-20T00:00:00.000Z";
const END_ISO = "2026-08-21T00:00:00.000Z";
const START_TS = Math.floor(Date.parse(START_ISO) / 1000);
const END_TS = Math.floor(Date.parse(END_ISO) / 1000);

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

interface HistoryStructured {
  history: {
    tokenId: string;
    startTime: string;
    endTime: string;
    fidelityMinutes: number;
    points: Array<{ timestamp: string; price: string }>;
    downsampled?: boolean;
  };
  meta: {
    requestId: string;
    asOf: string;
    sources: Array<{ name: string; url?: string }>;
    truncated?: boolean;
  };
}

function structuredOf(result: ToolCallResult): HistoryStructured {
  return result.structuredContent as unknown as HistoryStructured;
}

describe("get_price_history tool", () => {
  setupGammaFetchStub();

  it("appears in tools/list with read-only annotations and bounded inputs", async () => {
    const response = await dispatch(
      mcpRequest(
        { jsonrpc: "2.0", id: 80, method: "tools/list" },
        { headers: { "mcp-protocol-version": PROTOCOL_VERSION } }
      ),
      devEnv
    );
    const message = await readJsonRpc(response);
    const tools = message.result?.tools as Array<Record<string, unknown>>;
    const tool = tools.find((entry) => entry.name === "get_price_history");

    expect(tool).toBeDefined();
    expect(tool?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
    });
    const inputSchema = tool?.inputSchema as {
      properties: Record<string, unknown>;
    };
    expect(Object.keys(inputSchema.properties).sort()).toEqual([
      "endTime",
      "fidelityMinutes",
      "platform",
      "startTime",
      "tokenId",
    ]);
    expect(String(tool?.description)).toContain("price history");
    expect(String(tool?.description)).toContain("trade");
  });

  it("rejects a missing tokenId before calling upstream", async () => {
    const { message } = await callTool("get_price_history", 81, {});
    const result = message.result as ToolCallResult;

    expect(result.isError).toBe(true);
    const text = result.content?.[0]?.text ?? "";
    expect(text).toContain("VALIDATION_ERROR");
    expect(text).toContain("tokenId");
    expect(text).toContain("Do not retry with the same input.");
  });

  it("rejects a malformed tokenId before calling upstream", async () => {
    const { message } = await callTool("get_price_history", 82, {
      tokenId: "12,34",
    });
    const result = message.result as ToolCallResult;

    expect(result.isError).toBe(true);
    expect(result.content?.[0]?.text).toContain(
      "tokenId must be a string of up to 80 decimal digits."
    );
  });

  it("converts ISO inputs to epoch seconds and points to ISO plus decimal strings", async () => {
    expectGammaFetch(
      "data-history",
      dataUrl(
        "/v2/prices-history",
        `token_id=${TOKEN_ID}&start=${START_TS}&end=${END_TS}&bucket_seconds=7200`
      ),
      () =>
        jsonResponse(
          dataV2Page([
            { timestamp: START_TS + 425, price: 0.006 },
            { timestamp: START_TS + 4025, price: 0.007 },
            { timestamp: START_TS + 7625, price: 0.0065 },
          ])
        )
    );

    const { response, message } = await callTool("get_price_history", 83, {
      tokenId: TOKEN_ID,
      startTime: START_ISO,
      endTime: END_ISO,
      fidelityMinutes: 120,
    });
    const result = message.result as ToolCallResult;

    expect(response.status).toBe(200);
    expect(result.isError).toBeFalsy();
    expect(result.content?.[0]?.text).toContain("3 price points");
    expect(result.content?.[0]?.text).toContain("0.0065");

    const structured = structuredOf(result);
    expect(structured.history).toEqual({
      tokenId: TOKEN_ID,
      startTime: START_ISO,
      endTime: END_ISO,
      fidelityMinutes: 120,
      points: [
        {
          timestamp: new Date((START_TS + 425) * 1000).toISOString(),
          price: "0.006",
        },
        {
          timestamp: new Date((START_TS + 4025) * 1000).toISOString(),
          price: "0.007",
        },
        {
          timestamp: new Date((START_TS + 7625) * 1000).toISOString(),
          price: "0.0065",
        },
      ],
    });
    expect(structured.meta.requestId).toBe(
      response.headers.get("x-request-id")
    );
    expect(structured.meta.asOf).toBe(
      new Date((START_TS + 7625) * 1000).toISOString()
    );
    expect(structured.meta.sources).toEqual([
      { name: "polymarket-data", url: DATA_ORIGIN },
    ]);
    expect(structured.meta.truncated).toBeUndefined();
  });

  it("returns valid history when Polymarket includes an earlier boundary bucket", async () => {
    const startTs = START_TS + 37;
    const startTime = new Date(startTs * 1000).toISOString();
    expectGammaFetch(
      "history with an earlier boundary bucket",
      dataUrl(
        "/v2/prices-history",
        `token_id=${TOKEN_ID}&start=${startTs}&end=${END_TS}&bucket_seconds=3600`
      ),
      () =>
        jsonResponse(
          dataV2Page([
            { timestamp: START_TS, price: 0.4 },
            { timestamp: START_TS + 3600, price: 0.5 },
          ])
        )
    );

    const { message } = await callTool("get_price_history", 831, {
      tokenId: TOKEN_ID,
      startTime,
      endTime: END_ISO,
      fidelityMinutes: 60,
    });
    const result = message.result as ToolCallResult;
    const structured = structuredOf(result);

    expect(result.isError).toBeFalsy();
    expect(structured.history.points).toEqual([
      {
        timestamp: new Date((START_TS + 3600) * 1000).toISOString(),
        price: "0.5",
      },
    ]);
  });

  it("defaults to a 24 hour window ending now", async () => {
    expectGammaFetch(
      "data-history",
      dataUrl("/v2/prices-history", `token_id=${TOKEN_ID}`),
      () => jsonResponse(dataV2Page([]))
    );

    const { message } = await callTool("get_price_history", 84, {
      tokenId: TOKEN_ID,
    });
    const result = message.result as ToolCallResult;
    const structured = structuredOf(result);

    expect(result.isError).toBeFalsy();
    const spanSeconds =
      (Date.parse(structured.history.endTime) -
        Date.parse(structured.history.startTime)) /
      1000;
    expect(spanSeconds).toBe(24 * 60 * 60);
    expect(Date.parse(structured.history.endTime)).toBeGreaterThan(
      Date.now() - 10_000
    );
    expect(structured.history.fidelityMinutes).toBe(60);
  });

  it("rejects an unparseable startTime before calling upstream", async () => {
    const { message } = await callTool("get_price_history", 85, {
      tokenId: TOKEN_ID,
      startTime: "yesterday",
    });
    const result = message.result as ToolCallResult;

    expect(result.isError).toBe(true);
    const text = result.content?.[0]?.text ?? "";
    expect(text).toContain("VALIDATION_ERROR");
    expect(text).toContain("startTime");
  });

  it("rejects a startTime at or after endTime before calling upstream", async () => {
    const { message } = await callTool("get_price_history", 86, {
      tokenId: TOKEN_ID,
      startTime: END_ISO,
      endTime: START_ISO,
    });
    const result = message.result as ToolCallResult;

    expect(result.isError).toBe(true);
    const text = result.content?.[0]?.text ?? "";
    expect(text).toContain("VALIDATION_ERROR");
    expect(text).toContain("before");
  });

  it("rejects a window longer than 31 days before calling upstream", async () => {
    const { message } = await callTool("get_price_history", 87, {
      tokenId: TOKEN_ID,
      startTime: "2026-06-01T00:00:00.000Z",
      endTime: "2026-08-01T00:00:00.000Z",
    });
    const result = message.result as ToolCallResult;

    expect(result.isError).toBe(true);
    const text = result.content?.[0]?.text ?? "";
    expect(text).toContain("VALIDATION_ERROR");
    expect(text).toContain("31 days");
  });

  it("downsamples past 1000 points, keeps the endpoints, and flags truncation", async () => {
    const dense = Array.from({ length: 1500 }, (_, index) => ({
      timestamp: START_TS + index * 30,
      price: 0.4 + (index % 10) / 1000,
    }));
    expectGammaFetch(
      "first history page",
      (url) =>
        dataUrl("/v2/prices-history", `token_id=${TOKEN_ID}`)(url) &&
        !url.searchParams.has("cursor"),
      () => jsonResponse(dataV2Page(dense.slice(0, 750), "history-next"))
    );
    expectGammaFetch(
      "second history page",
      dataUrl("/v2/prices-history", "cursor=history-next"),
      () => jsonResponse(dataV2Page(dense.slice(750)))
    );

    const { message } = await callTool("get_price_history", 88, {
      tokenId: TOKEN_ID,
      startTime: START_ISO,
      endTime: END_ISO,
      fidelityMinutes: 1,
    });
    const result = message.result as ToolCallResult;
    const structured = structuredOf(result);

    expect(result.isError).toBeFalsy();
    expect(structured.history.points).toHaveLength(1000);
    expect(structured.history.points[0].timestamp).toBe(
      new Date(START_TS * 1000).toISOString()
    );
    expect(structured.history.points.at(-1)?.timestamp).toBe(
      new Date((START_TS + 1499 * 30) * 1000).toISOString()
    );
    expect(structured.history.downsampled).toBe(true);
    expect(structured.meta.truncated).toBe(true);
    expect(result.content?.[0]?.text).toContain("downsampled");
  });

  it("does not label lossless timestamp deduplication as truncated", async () => {
    expectGammaFetch(
      "first history page with boundary timestamp",
      (url) =>
        dataUrl("/v2/prices-history", `token_id=${TOKEN_ID}`)(url) &&
        !url.searchParams.has("cursor"),
      () =>
        jsonResponse(
          dataV2Page(
            [
              { timestamp: START_TS, price: 0.5 },
              { timestamp: START_TS + 60, price: 0.55 },
            ],
            "history-next"
          )
        )
    );
    expectGammaFetch(
      "second history page with boundary timestamp",
      dataUrl("/v2/prices-history", "cursor=history-next"),
      () =>
        jsonResponse(
          dataV2Page([
            { timestamp: START_TS + 60, price: 0.6 },
            { timestamp: START_TS + 120, price: 0.7 },
          ])
        )
    );

    const { message } = await callTool("get_price_history", 881, {
      tokenId: TOKEN_ID,
      startTime: START_ISO,
      endTime: END_ISO,
      fidelityMinutes: 1,
    });
    const result = message.result as ToolCallResult;
    const structured = structuredOf(result);

    expect(result.isError).toBeFalsy();
    expect(structured.history.points).toEqual([
      { timestamp: START_ISO, price: "0.5" },
      {
        timestamp: new Date((START_TS + 60) * 1000).toISOString(),
        price: "0.6",
      },
      {
        timestamp: new Date((START_TS + 120) * 1000).toISOString(),
        price: "0.7",
      },
    ]);
    expect(structured.history.downsampled).toBeUndefined();
    expect(structured.meta.truncated).toBeUndefined();
    expect(result.content?.[0]?.text).not.toContain("downsampled");
  });

  it("treats an empty history as success, not NOT_FOUND", async () => {
    expectGammaFetch(
      "data-history",
      dataUrl("/v2/prices-history", `token_id=${TOKEN_ID}`),
      () => jsonResponse(dataV2Page([]))
    );

    const { message } = await callTool("get_price_history", 89, {
      tokenId: TOKEN_ID,
      startTime: START_ISO,
      endTime: END_ISO,
    });
    const result = message.result as ToolCallResult;
    const structured = structuredOf(result);

    expect(result.isError).toBeFalsy();
    expect(structured.history.points).toEqual([]);
    expect(result.content?.[0]?.text).toContain(
      "No price history in the requested window."
    );
    expect(structured.history).not.toHaveProperty("downsampled");
  });

  it("maps Data API 429 responses to RATE_LIMITED", async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      expectGammaFetch(
        `rate-limited history attempt ${attempt}`,
        dataUrl("/v2/prices-history", `token_id=${TOKEN_ID}`),
        () =>
          new Response("{}", { status: 429, headers: { "Retry-After": "0" } })
      );
    }

    const { message } = await callTool("get_price_history", 90, {
      tokenId: TOKEN_ID,
    });
    const result = message.result as ToolCallResult;

    expect(result.isError).toBe(true);
    const text = result.content?.[0]?.text ?? "";
    expect(text).toContain("RATE_LIMITED");
    expect(text).toContain("Safe to retry.");
  });

  it("maps Data API server failures to UPSTREAM_UNAVAILABLE", async () => {
    expectGammaFetch(
      "data-history",
      dataUrl("/v2/prices-history", `token_id=${TOKEN_ID}`),
      () => jsonResponse({ error: "boom" }, 500)
    );

    const { message } = await callTool("get_price_history", 91, {
      tokenId: TOKEN_ID,
    });
    const result = message.result as ToolCallResult;

    expect(result.isError).toBe(true);
    const text = result.content?.[0]?.text ?? "";
    expect(text).toContain("UPSTREAM_UNAVAILABLE");
    expect(text).toContain("Safe to retry.");
  });

  it("maps aborted upstream fetches to UPSTREAM_TIMEOUT", async () => {
    expectGammaFetch(
      "data-history",
      dataUrl("/v2/prices-history", `token_id=${TOKEN_ID}`),
      () => {
        throw new DOMException("The operation was aborted", "AbortError");
      }
    );

    const { message } = await callTool("get_price_history", 92, {
      tokenId: TOKEN_ID,
    });
    const result = message.result as ToolCallResult;

    expect(result.isError).toBe(true);
    const text = result.content?.[0]?.text ?? "";
    expect(text).toContain("UPSTREAM_TIMEOUT");
    expect(text).toContain("Safe to retry.");
  });
});
