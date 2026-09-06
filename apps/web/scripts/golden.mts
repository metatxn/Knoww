import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  type GoldenBodyKind,
  normalizeBody,
} from "../src/lib/golden/normalize.ts";

/**
 * Golden runner. Fetches every manifest entry from a running Next server that
 * was started with KNOWW_GOLDEN_MODE (see ../golden/README.md), normalizes the
 * response and either stores it (record) or diffs it against the stored copy
 * (replay). Exit code 1 on any mismatch or missing golden.
 */
interface ManifestEntry {
  name: string;
  path: string;
  kind: GoldenBodyKind;
}

interface Manifest {
  baseUrl: string;
  entries: ManifestEntry[];
}

const here = path.dirname(fileURLToPath(import.meta.url));
const goldenDir = path.resolve(here, "..", "golden");
const responsesDir = path.join(goldenDir, "responses");
const diffDir = path.join(goldenDir, "diff");
const clockFile = path.join(goldenDir, "clock.json");
const missLogPath = path.join(goldenDir, "replay-misses.log");

const extensionFor: Record<GoldenBodyKind, string> = {
  json: "json",
  html: "html",
  text: "txt",
};

function relative(file: string): string {
  return path.relative(process.cwd(), file);
}

async function readOptional(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function firstDifference(expected: string, actual: string): string {
  const a = expected.split("\n");
  const b = actual.split("\n");
  const limit = Math.max(a.length, b.length);
  for (let i = 0; i < limit; i += 1) {
    if (a[i] === b[i]) continue;
    const lines = [`first difference at line ${i + 1}`];
    for (let j = Math.max(0, i - 3); j < Math.min(limit, i + 4); j += 1) {
      const marker = j === i ? ">" : " ";
      lines.push(`${marker} expected ${j + 1}: ${a[j] ?? "<eof>"}`);
      lines.push(`${marker} actual   ${j + 1}: ${b[j] ?? "<eof>"}`);
    }
    return lines.join("\n");
  }
  return "contents differ";
}

/**
 * The country the recorded pages see. Cloudflare sets `cf-ipcountry` at the
 * edge and the app reads it ahead of the request context, so this pins the
 * region-policy result in the feature-flags payload. Japan has no entry in
 * any platform's region policy, so every recorded page shows the open state.
 */
const GOLDEN_VISITOR_COUNTRY = "JP";

/**
 * Next streams Suspense boundaries and page metadata to browsers, and whether
 * a boundary lands in the shell or in a later chunk depends on timing, so two
 * fetches of one page can differ in shape. For user agents on its HTML-limited
 * bot list Next renders the whole page in one pass with the metadata in the
 * head, so the runner presents itself as one. The app has no user-agent
 * branches of its own.
 */
const GOLDEN_USER_AGENT = "knoww-golden/1 (compatible; Chrome-Lighthouse)";

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (mode !== "record" && mode !== "replay") {
    console.error("usage: golden.mts record|replay");
    process.exit(2);
  }

  const manifest = JSON.parse(
    await readFile(path.join(goldenDir, "manifest.json"), "utf8")
  ) as Manifest;
  const baseUrl = process.env.KNOWW_GOLDEN_BASE_URL ?? manifest.baseUrl;

  if (mode === "replay" && (await readOptional(clockFile)) === undefined) {
    console.error(`no ${relative(clockFile)}; run golden:record first`);
    process.exit(1);
  }

  await rm(missLogPath, { force: true });
  await rm(diffDir, { recursive: true, force: true });
  await mkdir(responsesDir, { recursive: true });

  const failures: string[] = [];
  for (const entry of manifest.entries) {
    const url = new URL(entry.path, baseUrl).toString();
    const response = await fetch(url, {
      headers: {
        accept: entry.kind === "html" ? "text/html" : "application/json",
        "user-agent": GOLDEN_USER_AGENT,
        "cf-ipcountry": GOLDEN_VISITOR_COUNTRY,
      },
      redirect: "manual",
    });
    const text = await response.text();
    const normalized = `status: ${response.status}\n\n${normalizeBody(entry.kind, text)}\n`;
    const goldenFile = path.join(
      responsesDir,
      `${entry.name}.${extensionFor[entry.kind]}`
    );

    if (mode === "record") {
      await writeFile(goldenFile, normalized);
      console.log(
        `recorded ${entry.name} (${response.status}, ${text.length} bytes)`
      );
      continue;
    }

    const expected = await readOptional(goldenFile);
    if (expected === undefined) {
      failures.push(`${entry.name}: no golden at ${relative(goldenFile)}`);
      continue;
    }
    if (expected === normalized) {
      console.log(`ok ${entry.name}`);
      continue;
    }
    await mkdir(diffDir, { recursive: true });
    const ext = extensionFor[entry.kind];
    await writeFile(
      path.join(diffDir, `${entry.name}.expected.${ext}`),
      expected
    );
    await writeFile(
      path.join(diffDir, `${entry.name}.actual.${ext}`),
      normalized
    );
    failures.push(`${entry.name}: ${firstDifference(expected, normalized)}`);
  }

  const misses = await readOptional(missLogPath);
  if (misses?.trim()) {
    console.warn(
      `\nreplay misses (the server went to the network for these):\n${misses}`
    );
  }

  if (failures.length > 0) {
    console.error(
      `\n${failures.length} golden mismatch(es):\n\n${failures.join("\n\n")}`
    );
    console.error(`\nexpected/actual pairs written to ${relative(diffDir)}`);
    process.exit(1);
  }
  console.log(
    `\n${manifest.entries.length} golden(s) ${mode === "record" ? "recorded" : "match"}`
  );
}

await main();
