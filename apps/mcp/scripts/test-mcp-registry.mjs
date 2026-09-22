import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isPublished, prepareManifest } from "./mcp-registry.mjs";

const source = JSON.parse(
  readFileSync(new URL("../server.json", import.meta.url), "utf8")
);
const timestamp = String(Date.parse("2026-09-22T03:18:05Z") / 1000);
const manifest = prepareManifest(source, timestamp, "123456789");
const response = (server = manifest, status = "active") =>
  Response.json({
    server,
    _meta: { "io.modelcontextprotocol.registry/official": { status } },
  });

test("generates stable versions without changing the checked-in metadata", () => {
  assert.equal(manifest.version, "2026.9.22-ci.123456789");
  assert.deepEqual(manifest, { ...source, version: manifest.version });
  assert.deepEqual(prepareManifest(source, timestamp, "123456789"), manifest);
  assert.notEqual(
    prepareManifest(source, timestamp, "123456790").version,
    manifest.version
  );
  assert.notEqual(source.version, manifest.version);
});

test("rejects missing run identity and an unexpected namespace", () => {
  assert.throws(() => prepareManifest(source, timestamp, ""));
  assert.throws(() => prepareManifest(source, "invalid", "123"));
  assert.throws(() =>
    prepareManifest(
      { ...source, name: "io.github.other/server" },
      timestamp,
      "123"
    )
  );
});

test("a missing version permits publication", async () => {
  assert.equal(
    await isPublished(manifest, async (url) => {
      assert.equal(
        url,
        "https://registry.modelcontextprotocol.io/v0.1/servers/io.github.metatxn%2Fknoww/versions/2026.9.22-ci.123456789"
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
