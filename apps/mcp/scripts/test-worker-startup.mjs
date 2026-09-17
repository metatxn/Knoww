import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// An explicit env path bypasses .dev.vars. Disable dotenv to skip env-file loading.
process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = "false";
process.env.WRANGLER_SEND_METRICS = "false";

const { unstable_startWorker } = await import("wrangler");

test("Wrangler's local bundle starts and serves the MCP catalog", {
  timeout: 60_000,
}, async (t) => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "knoww-mcp-startup-")
  );
  const emptyEnvFile = join(temporaryDirectory, "empty-vars");
  await writeFile(emptyEnvFile, "");
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }));

  const worker = await unstable_startWorker({
    config: fileURLToPath(new URL("../wrangler.jsonc", import.meta.url)),
    env: "local",
    envFiles: [emptyEnvFile],
    dev: {
      remote: false,
      server: { hostname: "127.0.0.1", port: 0 },
      inspector: false,
      watch: false,
      persist: false,
      logLevel: "error",
      outboundService: () =>
        new Response("External requests disabled in startup test", {
          status: 503,
        }),
    },
  });
  t.after(() => worker.dispose());

  let rejectStartup;
  const startupFailure = new Promise((_, reject) => {
    rejectStartup = reject;
  });
  const onError = (event) =>
    rejectStartup(new Error(event.reason, { cause: event.cause }));
  const onAbort = () => rejectStartup(t.signal.reason);
  worker.raw.on("error", onError);
  t.signal.addEventListener("abort", onAbort, { once: true });
  try {
    await Promise.race([worker.ready, startupFailure]);
  } finally {
    worker.raw.off("error", onError);
    t.signal.removeEventListener("abort", onAbort);
  }

  for (const [path, status] of [
    ["/healthz", "ok"],
    ["/readyz", "ready"],
  ]) {
    const response = await worker.fetch(`http://localhost${path}`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, status);
  }

  const response = await worker.fetch("http://localhost/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "Mcp-Protocol-Version": "2025-11-25",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    }),
  });
  assert.equal(response.status, 200);
  const body = await response.text();
  const payload = response.headers
    .get("content-type")
    ?.includes("text/event-stream")
    ? JSON.parse(
        body
          .split("\n")
          .find((line) => line.startsWith("data: "))
          .slice(6)
      )
    : JSON.parse(body);
  assert.equal(payload.error, undefined);
  const toolNames = payload.result.tools.map((tool) => tool.name);
  assert.ok(toolNames.includes("search_markets"));
  assert.ok(toolNames.includes("get_price_history"));
});
