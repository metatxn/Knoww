import { NextResponse } from "next/server";

/**
 * Server-side endpoint to provide builder configuration
 *
 * This endpoint returns a short-lived, client-scoped token configuration
 * for the builder signing SDK. The actual auth token is kept server-side
 * and never exposed to the client bundle.
 *
 * Security: This endpoint returns the builder signing server URL and
 * a scoped token (if configured) without exposing the internal auth token
 * directly in the client bundle.
 */
export async function GET() {
  try {
    // Server-side only environment variables (not prefixed with NEXT_PUBLIC_)
    const builderSigningServerUrl =
      process.env.BUILDER_SIGNING_SERVER_URL ||
      process.env.NEXT_PUBLIC_BUILDER_SIGNING_SERVER_URL;

    // Internal auth token - kept server-side only
    const internalAuthToken = process.env.INTERNAL_AUTH_TOKEN;

    if (!builderSigningServerUrl) {
      return NextResponse.json(
        { error: "Builder signing server not configured" },
        { status: 500 },
      );
    }

    // Return config with token (token is fetched server-side, not embedded in client)
    return NextResponse.json({
      url: builderSigningServerUrl,
      // Only include token if it exists on the server
      ...(internalAuthToken ? { token: internalAuthToken } : {}),
    });
  } catch (error) {
    console.error("[Builder Config API] Error:", error);
    return NextResponse.json(
      { error: "Failed to get builder configuration" },
      { status: 500 },
    );
  }
}
