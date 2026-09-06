import { createHash } from "node:crypto";

/**
 * Pure helpers shared by the golden fetch shim (runs inside the Next server)
 * and the golden runner (runs under `node --experimental-strip-types`), so
 * this file uses nothing that type stripping cannot erase.
 */
export type GoldenBodyKind = "json" | "html" | "text";

/** Response headers that change between identical upstream calls. */
const VOLATILE_RESPONSE_HEADERS = new Set([
  "age",
  "alt-svc",
  "cf-cache-status",
  "cf-ray",
  "connection",
  "content-encoding",
  "content-length",
  "date",
  "etag",
  "expires",
  "keep-alive",
  "last-modified",
  "nel",
  "report-to",
  "server-timing",
  "set-cookie",
  "transfer-encoding",
  "via",
  "x-cache",
  "x-request-id",
  "x-served-by",
  "x-timer",
]);

const VOLATILE_HEADER_PREFIXES = ["x-amz-", "x-vercel-"];

/** Only `new Date().toISOString()` output has exactly three fraction digits. */
const MILLISECOND_ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g;
const NEXT_STATIC_ASSET = /\/_next\/static\/[^"'\s\\)]+/g;
const BARE_STATIC_ASSET = /static\/(?:chunks|css|media)\/[^"'\s\\)]+/g;
/**
 * Flight module references list `"<chunk id>","static/chunks/…"` pairs. The
 * numeric chunk id is assigned per build and moved between two builds of the
 * same source in different environments, while module ids stayed put.
 */
const FLIGHT_CHUNK_ID = /(\\")\d+(\\",\\"static\/<asset>\\")/g;
/**
 * Next streams the flight payload as consecutive `self.__next_f.push([1,"…"])`
 * scripts and cuts them wherever a stream chunk happened to end, so the same
 * page splits at different points between runs. Each piece is a JSON string
 * fragment escaped on its own, so joining the pieces back yields the escaped
 * form of the whole payload. This runs before every other mask because a cut
 * can fall inside an asset path or a chunk id.
 */
const FLIGHT_PUSH_BOUNDARY =
  /"\]\)<\/script><script(?: nonce="[^"]*")?>self\.__next_f\.push\(\[1,"/g;
const CSP_NONCE = /nonce="[^"]+"/g;
/**
 * The feature-flags payload carries the visitor's location. The runner pins
 * the country with a `cf-ipcountry` header, but the subdivision comes from
 * the Cloudflare request context, which is the recording machine's real
 * region under `next start` and absent in CI, so it is masked here.
 */
const FLIGHT_VISITOR_SUBDIVISION =
  /(\\?"subdivision\\?":)(?:\\?"[A-Z0-9]{1,3}\\?"|null)/g;
/**
 * Next writes its build id (a 21-character nanoid) right after the doctype
 * and as `"b"` in the first flight chunk. A rebuild changes it and nothing
 * else, so it cannot take part in the comparison.
 */
const NEXT_BUILD_ID_COMMENT = /(<!DOCTYPE html><!--)[A-Za-z0-9_-]{16,32}(-->)/;
const NEXT_FLIGHT_BUILD_ID = /(\\"b\\":\\")[A-Za-z0-9_-]{16,32}(\\")/g;

/**
 * The URL with its query parameters sorted by name. The legacy Gamma fetches
 * and the services client build the same query in different orders, and both
 * must hit the same fixture. Text that is not an absolute URL is left alone.
 */
function canonicalUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  parsed.searchParams.sort();
  return parsed.toString();
}

export function fixtureKey(method: string, url: string, body?: string): string {
  return createHash("sha256")
    .update(`${method.toUpperCase()} ${canonicalUrl(url)}\n${body ?? ""}`)
    .digest("hex");
}

function isVolatileHeader(name: string): boolean {
  if (VOLATILE_RESPONSE_HEADERS.has(name)) return true;
  return VOLATILE_HEADER_PREFIXES.some((prefix) => name.startsWith(prefix));
}

export function pickStableHeaders(headers: Headers): Record<string, string> {
  const entries: [string, string][] = [];
  headers.forEach((value, name) => {
    const key = name.toLowerCase();
    if (!isVolatileHeader(key)) entries.push([key, value]);
  });
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(entries);
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      sorted[key] = sortKeysDeep(source[key]);
    }
    return sorted;
  }
  return value;
}

export function normalizeHtml(html: string): string {
  return html
    .replace(FLIGHT_PUSH_BOUNDARY, "")
    .replace(NEXT_STATIC_ASSET, "/_next/static/<asset>")
    .replace(BARE_STATIC_ASSET, "static/<asset>")
    .replace(FLIGHT_CHUNK_ID, "$1<chunk>$2")
    .replace(CSP_NONCE, 'nonce="<nonce>"')
    .replace(FLIGHT_VISITOR_SUBDIVISION, "$1<subdivision>")
    .replace(NEXT_BUILD_ID_COMMENT, "$1<build-id>$2")
    .replace(NEXT_FLIGHT_BUILD_ID, "$1<build-id>$2")
    .replace(MILLISECOND_ISO, "<timestamp>");
}

export function normalizeJson(text: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return text;
  }
  return JSON.stringify(sortKeysDeep(parsed), null, 2).replace(
    MILLISECOND_ISO,
    "<timestamp>"
  );
}

export function normalizeBody(kind: GoldenBodyKind, text: string): string {
  if (kind === "json") return normalizeJson(text);
  if (kind === "html") return normalizeHtml(text);
  return text.replace(MILLISECOND_ISO, "<timestamp>");
}

export function detectBodyKind(
  contentType: string | null | undefined
): GoldenBodyKind {
  const value = (contentType ?? "").toLowerCase();
  if (value.includes("json")) return "json";
  if (value.includes("html")) return "html";
  return "text";
}
