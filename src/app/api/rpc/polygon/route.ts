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

// CORS headers for responses
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

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
  try {
    const body = await request.json();

    // Validate the request body
    if (!body || (typeof body !== "object" && !Array.isArray(body))) {
      return NextResponse.json(
        { error: "Invalid JSON-RPC request" },
        { status: 400, headers: corsHeaders },
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
          "ms",
        );
        return NextResponse.json(
          { error: "RPC request timed out" },
          { status: 504, headers: corsHeaders },
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
        response.statusText,
      );
      return NextResponse.json(
        { error: `RPC request failed: ${response.statusText}` },
        { status: response.status, headers: corsHeaders },
      );
    }

    const data = await response.json();
    return NextResponse.json(data, { headers: corsHeaders });
  } catch (error) {
    console.error("[RPC Proxy] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders },
    );
  }
}

// Handle preflight requests for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  });
}
