import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(
  realpathSync(join(web, "node_modules/wrangler/package.json"))
);
const { build } = require("esbuild");
const { Miniflare, convertV4MiniflareOptions } = require("miniflare");
const WebSocket = require("ws");
const fixturePath = process.argv[2] === "-" ? undefined : process.argv[2];
const pageSize = Number(process.argv[3] ?? 10);
assert([10, 20].includes(pageSize), "Use a ten- or twenty-event page");
const events = fixturePath
  ? JSON.parse(readFileSync(fixturePath, "utf8")).events
  : Array.from({ length: 20 }, (_, i) => ({
      id: String(i + 1),
      slug: `event-${i + 1}`,
      title: `Event ${i + 1}`,
      markets: Array.from({ length: 180 }, (_, j) => ({
        id: `${i}-${j}`,
        question: `Candidate ${j}`,
        groupItemTitle: `Candidate ${j}`,
        description: "x".repeat(5000),
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.6","0.4"]',
        clobTokenIds: '["1","2"]',
      })),
    }));
assert.equal(events.length, 20, "Use a captured 20-event page");
let expectedBatchSize = pageSize;
let expectedColdCalls = 1;
while (
  Buffer.byteLength(
    JSON.stringify({
      events: events.slice(0, expectedBatchSize),
      next_cursor:
        expectedBatchSize < events.length
          ? String(expectedBatchSize - 1)
          : null,
    })
  ) >
    5 * 1024 * 1024 &&
  expectedBatchSize > 1
) {
  expectedBatchSize = Math.floor(expectedBatchSize / 2);
  expectedColdCalls++;
}
const expectedEvents = events.slice(0, expectedBatchSize);
const storage = mkdtempSync(join(tmpdir(), "knoww-feed-test-"));
let fail = false;
const upstream = [];
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://fixture.test");
  const limit = Number(url.searchParams.get("limit"));
  const start = Number(url.searchParams.get("after_cursor") || 0);
  if (fail) {
    upstream.push({ status: 503 });
    res.writeHead(503);
    res.end("fixture unavailable");
    return;
  }
  const page = events.slice(start, start + limit);
  const body = JSON.stringify({
    events: page,
    next_cursor:
      start + limit < events.length ? String(start + limit - 1) : null,
  });
  upstream.push({ status: 200, start, limit, bytes: Buffer.byteLength(body) });
  res.writeHead(200, { "content-type": "application/json" });
  setTimeout(() => res.end(body), 5);
});
await new Promise((resolveListen) =>
  server.listen(0, "127.0.0.1", resolveListen)
);
const bundle = await build({
  entryPoints: [join(web, "scripts/market-feed-worker-fixture.ts")],
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  external: ["cloudflare:workers"],
  tsconfig: join(web, "tsconfig.json"),
  alias: { "@": join(web, "src") },
});
const options = convertV4MiniflareOptions({
  inspectorPort: 0,
  durableObjectsPersist: storage,
  workers: [
    {
      name: "feed-test",
      modules: true,
      script: bundle.outputFiles[0].text,
      compatibilityDate: "2025-03-25",
      compatibilityFlags: ["nodejs_compat"],
      bindings: {
        FIXTURE_ORIGIN: `http://127.0.0.1:${server.address().port}`,
        FIXTURE_PAGE_SIZE: pageSize,
      },
      durableObjects: {
        MARKET_FEED_CACHE: {
          className: "TestMarketFeedCache",
          useSQLite: true,
        },
      },
    },
  ],
});
options.resourcePersistencePath = storage;
let mf, socket, sampleTimer;
try {
  mf = new Miniflare(options);
  await mf.ready;
  const inspector = new URL("/json", await mf.getInspectorURL());
  inspector.protocol = "http:";
  const targets = await (await fetch(inspector)).json();
  socket = new WebSocket(targets[0].webSocketDebuggerUrl);
  await once(socket, "open");
  let sequence = 0;
  const pending = new Map();
  socket.on("message", (bytes) => {
    const msg = JSON.parse(String(bytes));
    if (pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });
  const command = (method) =>
    new Promise((resolveResult, reject) => {
      const id = ++sequence;
      pending.set(id, (msg) =>
        msg.error ? reject(msg.error) : resolveResult(msg.result)
      );
      socket.send(JSON.stringify({ id, method }));
    });
  const heapSamples = [];
  let sampling = false;
  sampleTimer = setInterval(async () => {
    if (sampling) return;
    sampling = true;
    try {
      heapSamples.push(await command("Runtime.getHeapUsage"));
    } finally {
      sampling = false;
    }
  }, 10);
  const startTime = Date.now();
  await command("Profiler.enable");
  await command("Profiler.start");
  const started = performance.now();
  const responses = await Promise.all(
    Array.from({ length: 8 }, () => mf.dispatchFetch("http://test/page"))
  );
  const bodies = await Promise.all(
    responses.map(async (response) => {
      assert.equal(response.status, 200);
      return response.json();
    })
  );
  const coldMs = performance.now() - started;
  const profile = (await command("Profiler.stop")).profile;
  assert.equal(
    upstream.length,
    expectedColdCalls,
    "Concurrent misses must share one bounded refresh"
  );
  for (const body of bodies) {
    assert.deepEqual(
      body.data.map((event) => event.id),
      expectedEvents.map((event) => event.id)
    );
    assert.equal(
      body.data.reduce((sum, event) => sum + event.marketCount, 0),
      expectedEvents.reduce(
        (sum, event) => sum + (event.markets?.length ?? 0),
        0
      )
    );
    assert(body.data.every((event) => !Object.hasOwn(event, "markets")));
  }
  const coldCalls = upstream.slice();
  assert(coldCalls.at(-1).bytes <= 5 * 1024 * 1024);
  assert(coldCalls.slice(0, -1).every((call) => call.bytes > 5 * 1024 * 1024));
  if (!fixturePath)
    assert(coldCalls.some((call) => call.bytes > 4 * 1024 * 1024));
  const responseBytes = Buffer.byteLength(JSON.stringify(bodies[0]));
  assert(responseBytes <= 512 * 1024);
  const warmStart = performance.now();
  const beforeWarm = await (
    await mf.dispatchFetch("http://test/inspect")
  ).json();
  for (let i = 0; i < 20; i++)
    assert.equal((await mf.dispatchFetch("http://test/page")).status, 200);
  const warm20Ms = performance.now() - warmStart;
  assert.equal(
    upstream.length,
    expectedColdCalls,
    "Warm reads must do no Gamma work"
  );
  const afterWarm = await (
    await mf.dispatchFetch("http://test/inspect")
  ).json();
  assert.equal(
    afterWarm.sqlChanges,
    beforeWarm.sqlChanges,
    "Warm bursts must not rewrite SQL state"
  );
  await mf.dispatchFetch(`http://test/clock?time=${startTime + 65000}`);
  fail = true;
  const stale = await (await mf.dispatchFetch("http://test/page")).json();
  assert.equal(stale.freshness.stale, true);
  await mf.dispatchFetch("http://test/alarm");
  const retained = await (await mf.dispatchFetch("http://test/page")).json();
  assert.deepEqual(retained.data, bodies[0].data);
  assert.equal(retained.freshness.generatedAt, bodies[0].freshness.generatedAt);
  assert.equal(
    upstream.length,
    expectedColdCalls + 1,
    "A failed refresh is attempted once"
  );
  clearInterval(sampleTimer);
  heapSamples.push(await command("Runtime.getHeapUsage"));
  socket.close();
  socket = undefined;
  await mf.dispose();
  mf = new Miniflare(options);
  await mf.ready;
  const recovered = await (await mf.dispatchFetch("http://test/page")).json();
  assert(
    JSON.stringify(recovered.data) === JSON.stringify(bodies[0].data),
    "Restart must recover the persisted page"
  );
  assert.equal(
    upstream.length,
    expectedColdCalls + 1,
    "Recovery must not fetch Gamma"
  );
  await mf.dispatchFetch(`http://test/clock?time=${startTime + 400000}`);
  assert.equal(
    (await mf.dispatchFetch("http://test/page")).status,
    503,
    "Expired data must not be served"
  );
  const failedCalls = upstream.length;
  assert.equal((await mf.dispatchFetch("http://test/page")).status, 503);
  assert.equal(
    upstream.length,
    failedCalls,
    "Backoff must prevent repeated failed cold reads"
  );
  await mf.dispatchFetch(`http://test/clock?time=${startTime + 600000}`);
  await mf.dispatchFetch("http://test/alarm");
  const expired = await (await mf.dispatchFetch("http://test/inspect")).json();
  assert.equal(expired.rows, 0, "Idle expired snapshots must be deleted");
  assert.equal(expired.alarm, null, "Idle objects must stop scheduling work");
  fail = false;
  assert.equal(
    (await mf.dispatchFetch("http://test/page")).status,
    200,
    "An expired object must be reusable after deleteAll"
  );
  const ids = bodies[0].data.map((event) => event.id);
  let cursor = bodies[0].pagination.nextCursor;
  while (cursor) {
    const before = upstream.length;
    const response = await mf.dispatchFetch(
      `http://test/next?after_cursor=${encodeURIComponent(cursor)}`
    );
    assert.equal(response.status, 200);
    const page = await response.json();
    assert.equal(
      upstream.length - before,
      1,
      "Continuation reuses the known batch size"
    );
    assert(page.data.length > 0, "Every nonterminal fixture page advances");
    ids.push(...page.data.map((event) => event.id));
    assert(
      ids.length <= events.length,
      "Pagination must terminate without duplicates"
    );
    cursor = page.pagination.nextCursor;
  }
  assert.deepEqual(
    ids,
    events.map((event) => event.id),
    "Short cached pages preserve every event through their cursor"
  );
  const idleIds = new Set(
    profile.nodes
      .filter((n) => n.callFrame.functionName === "(idle)")
      .map((n) => n.id)
  );
  const sampledActiveMs =
    (profile.samples ?? []).reduce(
      (sum, id, i) =>
        sum + (idleIds.has(id) ? 0 : (profile.timeDeltas[i] ?? 0)),
      0
    ) / 1000;
  process.stdout.write(
    `${JSON.stringify(
      {
        result: "PASS",
        pageSize,
        returnedCards: bodies[0].data.length,
        checks: [
          "8 concurrent misses share one refresh",
          "20 warm reads make zero Gamma calls",
          "20 warm reads make zero SQL writes",
          "failed alarm preserves last-good page",
          "restart recovers persisted page",
          "expired page returns 503",
          "failed cold reads back off",
          "idle cleanup removes state and alarm",
          "short-page continuations preserve every event",
        ],
        responseBytes,
        coldCalls,
        coldMs,
        warm20Ms,
        sampledActiveMs,
        sampledMaxJsHeapBytes: Math.max(
          ...heapSamples.map((sample) => sample.usedSize)
        ),
        limitations:
          "Local workerd with fixture network and a controllable clock. Sampled CPU/JS heap are not production billed CPU or peak isolate memory. Next SSR is not included.",
      },
      null,
      2
    )}\n`
  );
} finally {
  clearInterval(sampleTimer);
  socket?.close();
  await mf?.dispose();
  server.close();
  rmSync(storage, { recursive: true, force: true });
}
