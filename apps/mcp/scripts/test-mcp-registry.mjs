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

test("history lookup fails closed on API errors, malformed data, and repeated cursors", async () => {
  for (const status of [404, 429, 500]) {
    await assert.rejects(
      listVersions(source.name, async () => new Response(null, { status })),
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
  assert.equal(
    await isPublished(manifest, async (url) => {
      assert.equal(
        url,
        "https://registry.modelcontextprotocol.io/v0.1/servers/io.github.metatxn%2Fknoww/versions/0.2.2"
      );
      return new Response(null, { status: 404 });
    }),
    false
  );
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
      isPublished(manifest, async () => new Response(null, { status })),
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
