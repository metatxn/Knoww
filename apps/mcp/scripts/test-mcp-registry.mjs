import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isPublished, listVersions, prepareManifest } from "./mcp-registry.mjs";

const source = JSON.parse(
  readFileSync(new URL("../server.json", import.meta.url), "utf8")
);
const commitSha = "a".repeat(40);
const runId = "123456789";
const manifest = prepareManifest(source, [], runId, commitSha);
const entry = (server = manifest, status = "active") => ({
  server,
  _meta: { "io.modelcontextprotocol.registry/official": { status } },
});
const versionEntry = (version, status) => entry({ ...source, version }, status);
const response = (server = manifest, status = "active") =>
  Response.json({
    server,
    _meta: { "io.modelcontextprotocol.registry/official": { status } },
  });
const noWait = { sleep: async () => {} };

test("patch releases continue from 0.2.1 despite an accidental calendar version", () => {
  const versions = [
    { server: { ...source, version: "0.2.0" } },
    { server: { ...source, version: "2026.9.22-ci.35685132784" } },
  ];
  assert.equal(
    prepareManifest(source, versions, "123456789", "a".repeat(40)).version,
    "0.2.2"
  );
});

test("subsequent runs increment numerically and do not reuse retired versions", () => {
  assert.equal(
    prepareManifest(source, [entry(manifest)], "123456790", commitSha).version,
    "0.2.3"
  );
  const versions = [versionEntry("0.2.9"), versionEntry("0.2.10", "deleted")];
  assert.equal(
    prepareManifest(source, versions, runId, commitSha).version,
    "0.2.11"
  );
  assert.equal(source.version, "0.2.1");
  assert.equal(manifest.websiteUrl, source.websiteUrl);
  assert.deepEqual(manifest.remotes, source.remotes);
});

test("a higher stable baseline or published version is respected", () => {
  assert.equal(
    prepareManifest({ ...source, version: "0.3.0" }, [], runId, commitSha)
      .version,
    "0.3.1"
  );
  assert.equal(
    prepareManifest(source, [versionEntry("1.0.0")], runId, commitSha).version,
    "1.0.1"
  );
});

test("retrying a published run reuses its version even after a newer release", () => {
  const versions = [entry(manifest), versionEntry("0.2.3")];
  assert.deepEqual(
    prepareManifest(source, versions, runId, commitSha),
    manifest
  );
});

test("retrying a run with changed metadata, SHA, or inactive status fails", () => {
  assert.throws(
    () =>
      prepareManifest(
        { ...source, title: "Changed" },
        [entry()],
        runId,
        commitSha
      ),
    /differs/
  );
  assert.throws(
    () => prepareManifest(source, [entry()], runId, "b".repeat(40)),
    /differs/
  );
  assert.throws(
    () =>
      prepareManifest(source, [entry(manifest, "deleted")], runId, commitSha),
    /differs/
  );
});

test("rejects invalid baseline, missing identity, and an unexpected namespace", () => {
  assert.throws(() => prepareManifest(source, [], "", commitSha));
  assert.throws(() => prepareManifest(source, [], runId, "invalid"));
  assert.throws(
    () =>
      prepareManifest(
        { ...source, version: "2026.9.22-ci.1" },
        [],
        runId,
        commitSha
      ),
    /baseline/
  );
  assert.throws(() =>
    prepareManifest(
      { ...source, name: "io.github.other/server" },
      [],
      runId,
      commitSha
    )
  );
  assert.throws(
    () =>
      prepareManifest(
        source,
        [entry({ name: "io.github.other/server", version: "9.9.9" })],
        runId,
        commitSha
      ),
    /history/
  );
});

test("reads every history page and requests retired versions", async () => {
  const pages = [
    { servers: [versionEntry("0.2.0")], metadata: { nextCursor: "next/page" } },
    { servers: [versionEntry("0.2.10", "deleted")], metadata: { count: 1 } },
  ];
  let calls = 0;
  const versions = await listVersions(source.name, async (value) => {
    const url = new URL(value);
    assert.equal(
      url.pathname,
      "/v0.1/servers/io.github.metatxn%2Fknoww/versions"
    );
    assert.equal(url.searchParams.get("include_deleted"), "true");
    assert.equal(
      url.searchParams.get("cursor"),
      calls === 0 ? null : "next/page"
    );
    return Response.json(pages[calls++]);
  });
  assert.equal(calls, 2);
  assert.equal(
    prepareManifest(source, versions, runId, commitSha).version,
    "0.2.11"
  );
});

test("null, undefined, and empty cursors finish pagination", async () => {
  const servers = [versionEntry("0.2.2")];
  for (const nextCursor of [null, undefined, ""]) {
    let calls = 0;
    const versions = await listVersions(source.name, async () => {
      calls++;
      assert.equal(calls, 1);
      return Response.json({ servers, metadata: { nextCursor } });
    });
    assert.deepEqual(versions, servers);
    assert.equal(calls, 1);
  }
});

for (const [label, metadata] of [
  ["string", "invalid metadata"],
  ["array", []],
  ["null", null],
]) {
  test(`rejects ${label} metadata with the invalid-response error`, async () => {
    await assert.rejects(
      listVersions(source.name, async () =>
        Response.json({ servers: [], metadata })
      ),
      { message: "Invalid registry history response." }
    );
  });
}

test("history lookup fails closed on API errors, malformed data, and repeated cursors", async () => {
  for (const status of [404, 429, 500]) {
    await assert.rejects(
      listVersions(
        source.name,
        async () => new Response(null, { status }),
        noWait
      ),
      /history lookup failed/
    );
  }
  await assert.rejects(
    listVersions(source.name, async () => Response.json({})),
    /history response/
  );
  await assert.rejects(
    listVersions(source.name, async () =>
      Response.json({ servers: [], metadata: { nextCursor: "same" } })
    ),
    /cursor/
  );
});

test("a missing version permits publication", async () => {
  let calls = 0;
  assert.equal(
    await isPublished(manifest, async (url) => {
      calls++;
      assert.equal(
        url,
        "https://registry.modelcontextprotocol.io/v0.1/servers/io.github.metatxn%2Fknoww/versions/0.2.2"
      );
      return new Response(null, { status: 404 });
    }),
    false
  );
  assert.equal(calls, 1);
});

test("registry reads recover from transient HTTP and network failures", async () => {
  const failures = [
    408,
    429,
    500,
    502,
    503,
    504,
    new TypeError("fetch failed"),
    new DOMException("Request timed out", "TimeoutError"),
  ];
  for (const failure of failures) {
    let calls = 0;
    const delays = [];
    assert.equal(
      await isPublished(
        manifest,
        async (_url, options) => {
          assert.ok(options.signal instanceof AbortSignal);
          if (calls++ === 0) {
            if (failure instanceof Error) throw failure;
            return new Response(null, { status: failure });
          }
          return response();
        },
        {
          sleep: async (delay) => {
            delays.push(delay);
          },
        }
      ),
      true
    );
    assert.equal(calls, 2);
    assert.deepEqual(delays, [2_000]);
  }
});

test("history retries the failed page without skipping or duplicating versions", async () => {
  const cursors = [];
  let calls = 0;
  const versions = await listVersions(
    source.name,
    async (value) => {
      cursors.push(new URL(value).searchParams.get("cursor"));
      calls++;
      if (calls === 1)
        return Response.json({
          servers: [versionEntry("0.2.0")],
          metadata: { nextCursor: "next/page" },
        });
      if (calls === 2) return new Response(null, { status: 500 });
      return Response.json({ servers: [versionEntry("0.2.1")], metadata: {} });
    },
    noWait
  );
  assert.deepEqual(cursors, [null, "next/page", "next/page"]);
  assert.deepEqual(versions, [versionEntry("0.2.0"), versionEntry("0.2.1")]);
});

test("post-publication verification waits for a newly published version", async () => {
  let calls = 0;
  assert.equal(
    await isPublished(
      manifest,
      async () => {
        return calls++ === 0 ? new Response(null, { status: 404 }) : response();
      },
      { ...noWait, retryNotFound: true }
    ),
    true
  );
  assert.equal(calls, 2);
});

test("persistent failures exhaust a bounded backoff and never permit publication", async () => {
  for (const failure of [500, new TypeError("fetch failed")]) {
    let calls = 0;
    const delays = [];
    await assert.rejects(
      isPublished(
        manifest,
        async () => {
          calls++;
          if (failure instanceof Error) throw failure;
          return new Response(null, { status: failure });
        },
        {
          sleep: async (delay) => {
            delays.push(delay);
          },
        }
      ),
      failure instanceof Error ? /fetch failed/ : /HTTP 500/
    );
    assert.equal(calls, 5);
    assert.deepEqual(delays, [2_000, 4_000, 8_000, 16_000]);
  }
});

test("post-publication verification remains unsuccessful after repeated 404s", async () => {
  let calls = 0;
  assert.equal(
    await isPublished(
      manifest,
      async () => {
        calls++;
        return new Response(null, { status: 404 });
      },
      { ...noWait, retryNotFound: true }
    ),
    false
  );
  assert.equal(calls, 5);
});

test("permanent errors and invalid listings fail immediately", async () => {
  for (const result of [
    () => new Response(null, { status: 400 }),
    () => new Response(null, { status: 401 }),
    () => new Response(null, { status: 403 }),
    () => new Response("invalid JSON"),
    () => response({ ...manifest, title: "Changed" }),
    () => response(manifest, "deleted"),
  ]) {
    let calls = 0;
    await assert.rejects(
      isPublished(
        manifest,
        async () => {
          calls++;
          return result();
        },
        noWait
      )
    );
    assert.equal(calls, 1);
  }
});

test("a successful retry still requires the exact active listing", async () => {
  let calls = 0;
  await assert.rejects(
    isPublished(
      manifest,
      async () => {
        return calls++ === 0
          ? new Response(null, { status: 500 })
          : response(manifest, "deleted");
      },
      noWait
    ),
    /differs/
  );
  assert.equal(calls, 2);
});

test("an identical active version makes a rerun safe", async () => {
  assert.equal(await isPublished(manifest, async () => response()), true);
});

test("an existing version with different metadata or inactive status fails", async () => {
  await assert.rejects(
    isPublished(manifest, async () =>
      response({ ...manifest, websiteUrl: "https://example.com" })
    ),
    /differs/
  );
  await assert.rejects(
    isPublished(manifest, async () => response(manifest, "deleted")),
    /differs/
  );
});

test("registry failures cannot be mistaken for an unpublished version", async () => {
  for (const status of [401, 429, 500]) {
    await assert.rejects(
      isPublished(manifest, async () => new Response(null, { status }), noWait),
      /Registry lookup failed/
    );
  }
  await assert.rejects(
    isPublished(manifest, async () => {
      throw new Error("Network unavailable");
    }),
    /Network unavailable/
  );
});
