import { describe, expect, it, vi } from "vitest";
import {
  createMcpAnalytics,
  MCP_ANALYTICS_EVENTS,
  mcpRoute,
  parseMcpProtocolMessages,
} from "./analytics";

describe("MCP PostHog analytics", () => {
  it("batches privacy-safe events and hashes authenticated identities", async () => {
    const backgroundTasks: Promise<unknown>[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json({ status: "Ok" })
    );
    const analytics = createMcpAnalytics({
      projectApiKey: "test-project-token",
      host: "https://us.i.posthog.com///",
      fetchImpl,
      waitUntil: (task) => backgroundTasks.push(task),
    });

    analytics.capture(
      MCP_ANALYTICS_EVENTS.httpRequestCompleted,
      {
        request_id: "request-1",
        route: "/mcp",
        status: 200,
      },
      "principal-123"
    );
    analytics.capture(
      MCP_ANALYTICS_EVENTS.toolCalled,
      {
        request_id: "request-1",
        tool_name: "search_markets",
        outcome: "success",
      },
      "principal-123"
    );
    analytics.flush();
    await Promise.all(backgroundTasks);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("https://us.i.posthog.com/batch/");
    expect(init).toMatchObject({ method: "POST" });

    const payload = JSON.parse(String(init?.body)) as {
      api_key: string;
      batch: Array<{
        event: string;
        properties: Record<string, unknown>;
      }>;
    };
    expect(payload.api_key).toBe("test-project-token");
    expect(payload.batch.map(({ event }) => event)).toEqual([
      "mcp_http_request_completed",
      "mcp_tool_called",
    ]);
    expect(payload.batch[0]?.properties).toMatchObject({
      product: "mcp",
      service: "knoww-mcp",
      $process_person_profile: false,
      request_id: "request-1",
    });
    expect(payload.batch[0]?.properties.distinct_id).toBe(
      payload.batch[1]?.properties.distinct_id
    );
    expect(payload.batch[0]?.properties.distinct_id).not.toContain(
      "principal-123"
    );
  });

  it.each(["small", "large", "unicode"])(
    "caps %s events and reserves the HTTP outcome",
    async (size) => {
      const tasks: Promise<unknown>[] = [];
      const fetchImpl = vi.fn<typeof fetch>(async () =>
        Response.json({ status: "Ok" })
      );
      const analytics = createMcpAnalytics({
        projectApiKey: "test-project-token",
        fetchImpl,
        waitUntil: (task) => tasks.push(task),
      });
      const value =
        size === "small"
          ? "ok"
          : size === "large"
            ? "a".repeat(3000)
            : "界".repeat(1000);
      for (let i = 0; i < 10_000; i++) {
        analytics.capture(
          MCP_ANALYTICS_EVENTS.toolCalled,
          { value },
          "same-principal"
        );
      }
      analytics.capture(MCP_ANALYTICS_EVENTS.httpRequestCompleted, {
        status: 400,
      });
      analytics.flush();
      await Promise.all(tasks);
      expect(fetchImpl).toHaveBeenCalledOnce();
      const body = String(fetchImpl.mock.calls[0]?.[1]?.body);
      expect(new TextEncoder().encode(body).length).toBeLessThanOrEqual(
        64 * 1024
      );
      const { batch } = JSON.parse(body);
      expect(batch.length).toBeLessThanOrEqual(32);
      expect(batch.length).toBeGreaterThan(1);
      expect(batch.at(-1)).toMatchObject({
        event: "mcp_http_request_completed",
        properties: { status: 400 },
      });
    }
  );

  it("drops oversized events without losing the request outcome", async () => {
    const tasks: Promise<unknown>[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json({ status: "Ok" })
    );
    const analytics = createMcpAnalytics({
      projectApiKey: "test-project-token",
      fetchImpl,
      waitUntil: (task) => tasks.push(task),
    });
    analytics.capture(MCP_ANALYTICS_EVENTS.toolCalled, {
      value: "x".repeat(100_000),
    });
    analytics.capture(MCP_ANALYTICS_EVENTS.httpRequestCompleted, {
      status: 200,
    });
    analytics.flush();
    await Promise.all(tasks);
    const { batch } = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(batch).toHaveLength(1);
    expect(batch[0].event).toBe("mcp_http_request_completed");
  });

  it("does not schedule delivery when the project token is absent", () => {
    const waitUntil = vi.fn();
    const fetchImpl = vi.fn<typeof fetch>();
    const analytics = createMcpAnalytics({
      projectApiKey: "",
      fetchImpl,
      waitUntil,
    });

    analytics.capture(MCP_ANALYTICS_EVENTS.httpRequestCompleted, {
      route: "/healthz",
    });
    analytics.flush();

    expect(waitUntil).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses bounded route names for every public endpoint", () => {
    const publicRoutes = [
      "/healthz",
      "/readyz",
      "/.well-known/oauth-protected-resource/mcp",
      "/.well-known/oauth-authorization-server",
      "/authorize",
      "/auth/google/callback",
      "/oauth/token",
      "/oauth/register",
      "/mcp",
    ];

    for (const route of publicRoutes) {
      expect(mcpRoute(route)).toBe(route);
    }
    expect(mcpRoute("/attacker-controlled-value")).toBe("other");
  });

  it("extracts only bounded MCP protocol and tool metadata", () => {
    expect(
      parseMcpProtocolMessages({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          clientInfo: { name: "Codex Desktop", version: "1.2.3" },
        },
      })
    ).toEqual([
      {
        protocol_method: "initialize",
        client_family: "codex",
      },
    ]);

    expect(
      parseMcpProtocolMessages([
        {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "get_market",
            arguments: { query: "must not be captured" },
          },
        },
        {
          jsonrpc: "2.0",
          id: 3,
          method: "attacker-controlled-method",
        },
      ])
    ).toEqual([{ protocol_method: "batch" }]);
  });
});
