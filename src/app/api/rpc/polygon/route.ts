import { type NextRequest, NextResponse } from "next/server";

/**
 * Server-side RPC Proxy for Polygon
 *
 * This proxies RPC requests to Alchemy without exposing the API key to the client.
 * The API key is only accessible server-side.
 *
 * Supports both single and batch JSON-RPC requests.
 */

// Timeout for RPC requests (30 seconds)
const RPC_TIMEOUT_MS = 30000;

// Allowed origins whitelist - add your production/staging domains here
const ALLOWED_ORIGINS_WHITELIST = [
  "http://localhost:3000",
  "http://localhost:3001",
  "https://polycaster.vercel.app",
  // Add more allowed origins as needed
];

/**
 * Validates the request origin against the whitelist or env-configured value.
 * Returns the validated origin if allowed, or null if not allowed.
 */
function getValidatedOrigin(requestOrigin: string | null): string | null {
  if (!requestOrigin) {
    return null;
  }

  // Priority 1: Check env-configured allowed origin (single origin)
  const envAllowedOrigin = process.env.ALLOWED_ORIGIN;
  if (envAllowedOrigin && requestOrigin === envAllowedOrigin) {
    return requestOrigin;
  }

  // Priority 2: Check env-configured allowed origins (comma-separated list)
  const envAllowedOrigins = process.env.ALLOWED_ORIGINS;
  if (envAllowedOrigins) {
    const originsArray = envAllowedOrigins.split(",").map((o) => o.trim());
    if (originsArray.includes(requestOrigin)) {
      return requestOrigin;
    }
  }

  // Priority 3: Check against hardcoded whitelist
  if (ALLOWED_ORIGINS_WHITELIST.includes(requestOrigin)) {
    return requestOrigin;
  }

  return null;
}

/**
 * Generates CORS headers with the validated origin.
 * If origin is not validated, returns headers without Access-Control-Allow-Origin.
 */
function getCorsHeaders(requestOrigin: string | null): Record<string, string> {
  const validatedOrigin = getValidatedOrigin(requestOrigin);

  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (validatedOrigin) {
    headers["Access-Control-Allow-Origin"] = validatedOrigin;
    // Vary header is important when origin can change based on request
    headers["Vary"] = "Origin";
  }

  return headers;
}

// Get the RPC URL server-side (API key is not exposed to client)
function getServerRpcUrl(): string {
  // Priority 1: Alchemy (best for production)
  const alchemyKey = process.env.ALCHEMY_API_KEY;
  if (alchemyKey) {
    return `https://polygon-mainnet.g.alchemy.com/v2/${alchemyKey}`;
  }

  // Priority 2: Custom RPC URL (server-side)
  const customRpcUrl = process.env.POLYGON_RPC_URL;
  if (customRpcUrl) {
    return customRpcUrl;
  }

  // Priority 3: Public Polygon RPC (has strict rate limits)
  return "https://polygon-rpc.com";
}

export async function POST(request: NextRequest) {
  // Get the request origin for CORS validation
  const requestOrigin = request.headers.get("origin");
  const validatedOrigin = getValidatedOrigin(requestOrigin);

  // Reject requests from disallowed origins to prevent proxy abuse
  if (!validatedOrigin) {
    console.warn(
      "[RPC Proxy] Rejected request from disallowed origin:",
      requestOrigin || "(no origin)"
    );
    return NextResponse.json(
      {
        error: "Forbidden",
        message: "Origin not allowed. Cross-origin requests from this domain are not permitted.",
      },
      { status: 403 }
    );
  }

  const corsHeaders = getCorsHeaders(requestOrigin);

  // Parse JSON body with dedicated error handling
  let body: unknown;
  try {
    body = await request.json();
  } catch (parseError) {
    // Handle JSON parse errors (SyntaxError) with a 400 response
    console.warn(
      "[RPC Proxy] Invalid JSON payload:",
      parseError instanceof Error ? parseError.message : parseError
    );
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    // Validate the request body structure
    if (!body || (typeof body !== "object" && !Array.isArray(body))) {
      return NextResponse.json(
        { error: "Invalid JSON-RPC request" },
        { status: 400, headers: corsHeaders }
      );
    }

    const rpcUrl = getServerRpcUrl();

    // Set up AbortController with timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);

    let response: Response;
    try {
      // Forward the request to the actual RPC endpoint
      response = await fetch(rpcUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      // Handle abort/timeout errors
      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        console.error(
          "[RPC Proxy] Request timed out after",
          RPC_TIMEOUT_MS,
          "ms"
        );
        return NextResponse.json(
          { error: "RPC request timed out" },
          { status: 504, headers: corsHeaders }
        );
      }
      throw fetchError; // Re-throw other errors to be caught by outer catch
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      console.error(
        "[RPC Proxy] Upstream error:",
        response.status,
        response.statusText
      );
      return NextResponse.json(
        { error: `RPC request failed: ${response.statusText}` },
        { status: response.status, headers: corsHeaders }
      );
    }

    const data = await response.json();
    return NextResponse.json(data, { headers: corsHeaders });
  } catch (error) {
    console.error("[RPC Proxy] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}

// Handle preflight requests for CORS
export async function OPTIONS(request: NextRequest) {
  // Get the request origin for CORS validation
  const requestOrigin = request.headers.get("origin");
  const validatedOrigin = getValidatedOrigin(requestOrigin);

  // Reject preflight requests from disallowed origins
  if (!validatedOrigin) {
    console.warn(
      "[RPC Proxy] Rejected OPTIONS preflight from disallowed origin:",
      requestOrigin || "(no origin)"
    );
    return new NextResponse(null, {
      status: 403,
      statusText: "Forbidden - Origin not allowed",
    });
  }

  const corsHeaders = getCorsHeaders(requestOrigin);

  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  });
}
