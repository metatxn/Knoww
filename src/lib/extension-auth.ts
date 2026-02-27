import { type NextRequest, NextResponse } from "next/server";

const MAX_TIMESTAMP_DRIFT_MS = 60_000;

const ALLOWED_ORIGINS = [
  "chrome-extension://", // any Chrome extension (tightened below by HMAC)
];

const ALLOWED_REFERER_HOSTS = new Set(["knoww.app", "www.knoww.app"]);

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGINS.some((prefix) => origin.startsWith(prefix));
}

function isRefererAllowed(referer: string | null): boolean {
  if (!referer) return false;
  try {
    const url = new URL(referer);
    return url.protocol === "https:" && ALLOWED_REFERER_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

async function computeHmac(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(sig), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

/**
 * Verify that a request comes from the Knoww extension.
 *
 * Checks (in order):
 *   1. Origin / Referer — blocks casual browser-tab replays
 *   2. HMAC signature  — blocks cURL / Postman replays
 *
 * Returns null if the request is authentic, or a NextResponse (401/403)
 * to short-circuit the handler.
 */
export async function verifyExtensionRequest(
  request: NextRequest
): Promise<NextResponse | null> {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  // Option 4: Origin / Referer gate
  // Background service-worker requests from Chrome extensions set
  // Origin: chrome-extension://<id>.  First-party browser requests
  // from knoww.app set a matching Referer.  Anything else is suspect.
  if (!isOriginAllowed(origin) && !isRefererAllowed(referer)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Option 1: HMAC signature verification
  const secret = process.env.KNOWW_EXTENSION_SECRET;
  if (!secret) {
    // If the server hasn't configured a secret, skip HMAC check
    // (allows gradual rollout)
    return null;
  }

  const signature = request.headers.get("x-knoww-signature");
  const timestamp = request.headers.get("x-knoww-timestamp");

  if (!signature || !timestamp) {
    return NextResponse.json(
      { error: "Missing authentication headers" },
      { status: 401 }
    );
  }

  const ts = Number(timestamp);
  if (Number.isNaN(ts) || Math.abs(Date.now() - ts) > MAX_TIMESTAMP_DRIFT_MS) {
    return NextResponse.json({ error: "Request expired" }, { status: 401 });
  }

  // Read raw body for HMAC input; clone so downstream can also read it
  const bodyText = await request.clone().text();
  const message = `${timestamp}:${bodyText}`;
  const expected = await computeHmac(secret, message);

  if (signature !== expected) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  return null;
}
