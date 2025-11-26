import { NextResponse } from "next/server";

// CoinMarketCap API response types
interface CoinMarketCapQuote {
  price: number;
  volume_24h: number;
  percent_change_24h: number;
}

interface CoinMarketCapData {
  id: number;
  name: string;
  symbol: string;
  quote: {
    USD: CoinMarketCapQuote;
  };
}

interface CoinMarketCapResponse {
  data: {
    POL: CoinMarketCapData;
  };
}

// Cache the price for 60 seconds to avoid hitting rate limits
let cachedPrice: { price: number; timestamp: number } | null = null;
const CACHE_DURATION = 60 * 1000; // 60 seconds

export async function GET() {
  try {
    // Check if we have a valid cached price
    if (cachedPrice && Date.now() - cachedPrice.timestamp < CACHE_DURATION) {
      return NextResponse.json({
        price: cachedPrice.price,
        cached: true,
      });
    }

    const apiKey = process.env.COINMARKET_API_KEY;

    if (!apiKey) {
      console.warn("COINMARKET_API_KEY is not defined");
      return NextResponse.json(
        { error: "API key not configured" },
        { status: 500 }
      );
    }

    const response = await fetch(
      "https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=POL&convert=USD",
      {
        headers: {
          "X-CMC_PRO_API_KEY": apiKey,
          Accept: "application/json",
        },
        next: { revalidate: 60 }, // Next.js cache for 60 seconds
      }
    );

    if (!response.ok) {
      throw new Error(`CoinMarketCap API error: ${response.status}`);
    }

    const data: CoinMarketCapResponse = await response.json();

    // Extract POL price from the response
    const polData = data.data?.POL;
    if (!polData) {
      throw new Error("POL data not found in response");
    }

    const price = polData.quote?.USD?.price;
    if (typeof price !== "number") {
      throw new Error("Invalid price data");
    }

    // Update cache
    cachedPrice = {
      price,
      timestamp: Date.now(),
    };

    return NextResponse.json({
      price,
      cached: false,
    });
  } catch (error) {
    console.error("Error fetching POL price:", error);

    // Return cached price if available, even if expired
    if (cachedPrice) {
      return NextResponse.json({
        price: cachedPrice.price,
        cached: true,
        stale: true,
      });
    }

    return NextResponse.json(
      { error: "Failed to fetch POL price" },
      { status: 500 }
    );
  }
}
