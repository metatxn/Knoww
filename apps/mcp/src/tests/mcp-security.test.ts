import { describe, expect, it } from "vitest";
import {
  devEnv,
  dispatch,
  mcpRequest,
  PROTOCOL_VERSION,
  readJsonRpc,
  setupGammaFetchStub,
} from "./helpers";

const MODERN_PROTOCOL_VERSION = "2026-07-28";

async function rpc(
  version: string,
  method: string,
  params: Record<string, unknown>
) {
  const modern = version === MODERN_PROTOCOL_VERSION;
  return dispatch(
    mcpRequest(
      {
        jsonrpc: "2.0",
        id: "same-request-id",
        method,
        params: {
          ...params,
          ...(modern
            ? {
                _meta: {
                  "io.modelcontextprotocol/protocolVersion": version,
                  "io.modelcontextprotocol/clientInfo": {
                    name: "security-tests",
                    version: "0.0.0",
                  },
                  "io.modelcontextprotocol/clientCapabilities": {},
                },
              }
            : {}),
        },
      },
      {
        headers: {
          "mcp-protocol-version": version,
          ...(modern ? { "mcp-method": method } : {}),
          ...(modern && typeof params.name === "string"
            ? { "mcp-name": params.name }
            : {}),
        },
      }
    ),
    devEnv
  );
}

describe.each([PROTOCOL_VERSION, MODERN_PROTOCOL_VERSION])(
  "MCP request isolation and input budgets (%s)",
  (version) => {
    setupGammaFetchStub();

    it.each([
      [
        "invalid array members",
        { slugs: Array.from({ length: 1001 }, () => []) },
      ],
      [
        "unknown object members",
        {
          slugs: [],
          extra: Object.fromEntries(
            Array.from({ length: 1001 }, (_, i) => [`key${i}`, null])
          ),
        },
      ],
      [
        "nested unknown members",
        {
          slugs: [],
          extra: Array.from({ length: 501 }, () => ({ nested: [] })),
        },
      ],
    ])(
      "rejects %s before schema validation or tool execution",
      async (_name, args) => {
        const response = await rpc(version, "tools/call", {
          name: "show_markets",
          arguments: args,
        });
        expect(response.status).toBe(200);
        const message = await readJsonRpc(response.clone());
        expect(message.result?.isError).toBe(true);
        const text = await response.text();
        expect(text.length).toBeLessThan(1000);
        expect(text).toContain("maximum of 1000 elements");
        expect(text).not.toContain("stack");
      }
    );

    it("accepts a normal call within the argument budget", async () => {
      const message = await readJsonRpc(
        await rpc(version, "tools/call", {
          name: "show_markets",
          arguments: { slugs: [] },
        })
      );
      expect(message.error).toBeUndefined();
      expect(message.result?.isError).not.toBe(true);
      expect(message.result?.structuredContent).toMatchObject({ markets: [] });
    });

    it("keeps concurrent requests with identical IDs on separate servers", async () => {
      for (let round = 0; round < 3; round++) {
        const [listing, call] = await Promise.all([
          rpc(version, "tools/list", {}).then(readJsonRpc),
          rpc(version, "tools/call", {
            name: "show_markets",
            arguments: { slugs: [] },
          }).then(readJsonRpc),
        ]);
        expect(listing.id).toBe("same-request-id");
        expect(call.id).toBe("same-request-id");
        expect(listing.error).toBeUndefined();
        expect(call.error).toBeUndefined();
        expect(listing.result?.tools).toBeInstanceOf(Array);
        expect(listing.result?.structuredContent).toBeUndefined();
        expect(call.result?.tools).toBeUndefined();
        expect(call.result?.structuredContent).toMatchObject({ markets: [] });
      }
    });
  }
);
