import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const registryUrl = "https://registry.modelcontextprotocol.io";

export function prepareManifest(source, commitTimestamp, runId) {
  if (source.name !== "io.github.metatxn/knoww") {
    throw new Error("Expected the Knoww registry namespace.");
  }
  if (!/^\d+$/.test(commitTimestamp) || !/^[1-9]\d*$/.test(runId)) {
    throw new Error("A commit timestamp and GitHub run ID are required.");
  }
  const date = new Date(Number(commitTimestamp) * 1000);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("Invalid commit timestamp.");
  }
  const version = `${date.getUTCFullYear()}.${date.getUTCMonth() + 1}.${date.getUTCDate()}-ci.${runId}`;
  return { ...source, version };
}

export async function isPublished(manifest, request = fetch) {
  const url = `${registryUrl}/v0.1/servers/${encodeURIComponent(manifest.name)}/versions/${encodeURIComponent(manifest.version)}`;
  const response = await request(url, {
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 404) return false;
  if (!response.ok) {
    throw new Error(`Registry lookup failed with HTTP ${response.status}.`);
  }
  const published = await response.json();
  if (
    !isDeepStrictEqual(published.server, manifest) ||
    published._meta?.["io.modelcontextprotocol.registry/official"]?.status !==
      "active"
  ) {
    throw new Error(
      "The published version differs from the expected active listing."
    );
  }
  return true;
}

async function main() {
  const [mode, sourcePath, outputPath] = process.argv.slice(2);
  const source = JSON.parse(readFileSync(sourcePath, "utf8"));
  if (mode === "prepare") {
    const manifest = prepareManifest(
      source,
      process.env.MCP_COMMIT_TIMESTAMP ?? "",
      process.env.GITHUB_RUN_ID ?? ""
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
  if (!(await isPublished(source))) {
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
