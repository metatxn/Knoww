import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const registryUrl = "https://registry.modelcontextprotocol.io";
const publisherMetadataKey =
  "io.modelcontextprotocol.registry/publisher-provided";
const retryDelays = [2_000, 4_000, 8_000, 16_000];
const retryStatuses = new Set([408, 429, 500, 502, 503, 504]);

async function requestRegistry(
  url,
  request,
  { retryNotFound = false, sleep: wait = sleep } = {}
) {
  for (let attempt = 0; ; attempt++) {
    let response;
    try {
      response = await request(url, { signal: AbortSignal.timeout(30_000) });
    } catch (error) {
      if (
        attempt === retryDelays.length ||
        !(error instanceof TypeError || error?.name === "TimeoutError")
      ) {
        throw error;
      }
    }
    if (response) {
      if (
        attempt === retryDelays.length ||
        (!retryStatuses.has(response.status) &&
          !(retryNotFound && response.status === 404))
      ) {
        return response;
      }
      await response.body?.cancel().catch(() => {});
    }
    await wait(retryDelays[attempt]);
  }
}

function stableVersion(version) {
  return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)
    ? version.split(".").map(BigInt)
    : null;
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index++) {
    if (left[index] !== right[index])
      return left[index] > right[index] ? 1 : -1;
  }
  return 0;
}

export function prepareManifest(source, versions, runId, commitSha) {
  if (source.name !== "io.github.metatxn/knoww") {
    throw new Error("Expected the Knoww registry namespace.");
  }
  if (!/^[1-9]\d*$/.test(runId) || !/^[a-f0-9]{40}$/.test(commitSha)) {
    throw new Error("A GitHub run ID and commit SHA are required.");
  }
  let highest = stableVersion(source.version);
  if (!highest)
    throw new Error("The baseline version must be MAJOR.MINOR.PATCH.");

  const manifest = {
    ...source,
    _meta: {
      ...source._meta,
      [publisherMetadataKey]: {
        ...source._meta?.[publisherMetadataKey],
        githubActions: { runId, commitSha },
      },
    },
  };
  let previous;
  for (const entry of versions) {
    if (
      entry.server?.name !== source.name ||
      typeof entry.server.version !== "string"
    ) {
      throw new Error("Unexpected server in registry version history.");
    }
    const version = stableVersion(entry.server.version);
    if (version && compareVersions(version, highest) > 0) highest = version;
    if (
      entry.server._meta?.[publisherMetadataKey]?.githubActions?.runId === runId
    ) {
      if (previous)
        throw new Error("Multiple versions belong to this workflow run.");
      previous = entry;
    }
  }
  if (previous) {
    const expected = { ...manifest, version: previous.server.version };
    if (!stableVersion(expected.version))
      throw new Error("Invalid version for this workflow run.");
    assertPublished(previous, expected);
    return expected;
  }
  return {
    ...manifest,
    version: `${highest[0]}.${highest[1]}.${highest[2] + 1n}`,
  };
}

export async function listVersions(name, request = fetch, options = {}) {
  const url = new URL(
    `${registryUrl}/v0.1/servers/${encodeURIComponent(name)}/versions`
  );
  url.searchParams.set("limit", "100");
  url.searchParams.set("include_deleted", "true");
  const versions = [];
  const cursors = new Set();
  while (true) {
    const response = await requestRegistry(url.toString(), request, options);
    if (!response.ok)
      throw new Error(
        `Registry history lookup failed with HTTP ${response.status}.`
      );
    const page = await response.json();
    if (
      !Array.isArray(page.servers) ||
      page.metadata === null ||
      typeof page.metadata !== "object" ||
      Array.isArray(page.metadata)
    )
      throw new Error("Invalid registry history response.");
    versions.push(...page.servers);
    const cursor = page.metadata.nextCursor;
    if (cursor === null || cursor === undefined || cursor === "")
      return versions;
    if (typeof cursor !== "string" || cursors.has(cursor))
      throw new Error("Invalid registry history cursor.");
    cursors.add(cursor);
    url.searchParams.set("cursor", cursor);
  }
}

function assertPublished(published, manifest) {
  if (
    !isDeepStrictEqual(published.server, manifest) ||
    published._meta?.["io.modelcontextprotocol.registry/official"]?.status !==
      "active"
  ) {
    throw new Error(
      "The published version differs from the expected active listing."
    );
  }
}

export async function isPublished(manifest, request = fetch, options = {}) {
  const url = `${registryUrl}/v0.1/servers/${encodeURIComponent(manifest.name)}/versions/${encodeURIComponent(manifest.version)}`;
  const response = await requestRegistry(url, request, options);
  if (response.status === 404) return false;
  if (!response.ok) {
    throw new Error(`Registry lookup failed with HTTP ${response.status}.`);
  }
  const published = await response.json();
  assertPublished(published, manifest);
  return true;
}

async function main() {
  const [mode, sourcePath, outputPath] = process.argv.slice(2);
  const source = JSON.parse(readFileSync(sourcePath, "utf8"));
  if (mode === "prepare") {
    const manifest = prepareManifest(
      source,
      await listVersions(source.name),
      process.env.GITHUB_RUN_ID ?? "",
      process.env.GITHUB_SHA ?? ""
    );
    writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const published = await isPublished(manifest);
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `publish_required=${!published}\nversion=${manifest.version}\n`
    );
    return;
  }
  if (mode !== "verify") throw new Error("Expected prepare or verify.");
  if (!(await isPublished(source, fetch, { retryNotFound: true }))) {
    throw new Error("The published version was not found in the registry.");
  }
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `Published and verified ${source.name} version ${source.version}.\n\nWebsite: ${source.websiteUrl}\n`
  );
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  await main();
}
