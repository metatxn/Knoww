import { expect, it, vi } from "vitest";
import {
  loadOrderTokenMarkets,
  type OrderMarketResponse,
} from "../../src/sidepanel/order-token-markets";

it("batches unique tokens into groups of 50 and matches omitted IDs by identity", async () => {
  const calls: string[] = [];
  const read = async (path: string): Promise<OrderMarketResponse> => {
    calls.push(path);
    const url = new URL(path, "https://knoww.app");
    if (url.pathname.endsWith("/tokens")) {
      const ids = url.searchParams.get("tokenIds")?.split(",") ?? [];
      expect(ids.length).toBeGreaterThan(0);
      expect(ids.length).toBeLessThanOrEqual(50);
      return {
        success: true,
        tokens: ids
          .filter((id) => id !== "2")
          .reverse()
          .map((tokenId) => ({
            tokenId,
            title: `Market ${tokenId}`,
            outcome: "Yes",
            marketSlug: `market-${tokenId}`,
            eventSlug: "parent-event",
          })),
      };
    }
    expect(path).toBe("/api/polymarket/markets/by-token/2");
    return {
      success: true,
      market: {
        question: "Gamma fallback",
        outcome: "No",
        icon: "https://example.com/icon.png",
      },
    };
  };
  const ids = Array.from({ length: 51 }, (_, index) => String(index + 1));
  const markets = await loadOrderTokenMarkets([...ids, "1", ""], read);
  expect(markets.size).toBe(51);
  expect(markets.get("1")).toMatchObject({
    question: "Market 1",
    slug: "market-1",
    eventSlug: "parent-event",
  });
  expect(markets.get("2")).toMatchObject({
    question: "Gamma fallback",
    outcome: "No",
  });
  expect(calls.filter((path) => path.includes("/tokens?"))).toHaveLength(2);
  expect(calls.filter((path) => path.includes("/by-token/"))).toHaveLength(1);
});
it("falls back when the batch endpoint is unavailable", async () => {
  const read = vi.fn(async (path: string): Promise<OrderMarketResponse> => {
    if (path.includes("/tokens?")) throw new Error("Batch route unavailable");
    return {
      success: true,
      market: { question: "Existing lookup", outcome: "Yes" },
    };
  });
  expect(
    (await loadOrderTokenMarkets(["123"], read)).get("123")?.question
  ).toBe("Existing lookup");
  expect(read).toHaveBeenCalledTimes(2);
});
it("keeps unknown tokens unenriched and never requests an empty batch", async () => {
  const read = vi.fn(
    async (): Promise<OrderMarketResponse> => ({ success: true, tokens: [] })
  );
  expect((await loadOrderTokenMarkets([], read)).size).toBe(0);
  expect(read).not.toHaveBeenCalled();
  expect((await loadOrderTokenMarkets(["999"], read)).size).toBe(0);
});
it("falls back for missing market identity and ignores unsolicited token metadata", async () => {
  const read = async (path: string): Promise<OrderMarketResponse> =>
    path.includes("/tokens?")
      ? {
          success: true,
          tokens: [
            { tokenId: "123", title: null, outcome: "Yes" },
            { tokenId: "999", title: "Unrequested market", outcome: "No" },
          ],
        }
      : { success: true, market: { question: "Gamma title", outcome: "Yes" } };
  const markets = await loadOrderTokenMarkets(["123"], read);
  expect(markets.get("123")?.question).toBe("Gamma title");
  expect(markets.has("999")).toBe(false);
});

it("uses Gamma fallback when token metadata lacks a navigable market or event slug", async () => {
  const read = async (path: string): Promise<OrderMarketResponse> =>
    path.includes("/tokens?")
      ? {
          success: true,
          tokens: [
            {
              tokenId: "123",
              title: "Example",
              outcome: "Yes",
              eventSlug: null,
              marketSlug: null,
            },
          ],
        }
      : {
          success: true,
          market: {
            question: "Example",
            outcome: "Yes",
            eventSlug: "gamma-parent-event",
          },
        };
  const markets = await loadOrderTokenMarkets(["123"], read);
  expect(markets.get("123")?.eventSlug).toBe("gamma-parent-event");
});
