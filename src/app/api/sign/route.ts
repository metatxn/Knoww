import { type NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/api-rate-limit";

/**
 * Server-side proxy for the Builder Signing Server.
 *
 * The Polymarket SDK on the client calls this route instead of the external
 * signing server directly. This keeps the auth token entirely server-side
 * so it never appears in the browser's network tab or JS bundle.
 *
 * Flow:
 *   SDK (browser) → POST /api/sign  → this route → signing.knoww.app/sign
 *
 * Environment variables (server-only, NO NEXT_PUBLIC_ prefix):
 *   BUILDER_SIGNING_SERVER_URL – the upstream signing server URL
 *   INTERNAL_AUTH_TOKEN         – bearer token for the signing server
 */

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_BODY_SIZE = 10 * 1024; // 10 KB — signing payloads are small

function getUpstreamUrl(): string | null {
  return process.env.BUILDER_SIGNING_SERVER_URL || null;
}

function getAuthToken(): string | null {
  return process.env.INTERNAL_AUTH_TOKEN || null;
}

export async function POST(request: NextRequest) {
  // Rate limit: 30 requests per minute per IP
  const rateLimitResponse = checkRateLimit(request, {
    uniqueTokenPerInterval: 30,
  });
  if (rateLimitResponse) return rateLimitResponse;

  const upstreamUrl = getUpstreamUrl();
  if (!upstreamUrl) {
    console.error("[Sign Proxy] BUILDER_SIGNING_SERVER_URL is not configured");
    return NextResponse.json(
      { error: "Signing service not configured" },
      { status: 503 }
    );
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength && Number.parseInt(contentLength, 10) > MAX_BODY_SIZE) {
    return NextResponse.json(
      { error: "Request body too large" },
      { status: 413 }
    );
  }

  let body: unknown;
  try {
    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_SIZE) {
      return NextResponse.json(
        { error: "Request body too large" },
        { status: 413 }
      );
    }
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400 }
    );
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    const authToken = getAuthToken();
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    let response: Response;
    try {
      response = await fetch(upstreamUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (fetchError) {
      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        console.error("[Sign Proxy] Upstream request timed out");
        return NextResponse.json(
          { error: "Signing request timed out" },
          { status: 504 }
        );
      }
      throw fetchError;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      console.error(
        "[Sign Proxy] Upstream error:",
        response.status,
        response.statusText
      );
      return NextResponse.json(
        { error: `Signing request failed: ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[Sign Proxy] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
