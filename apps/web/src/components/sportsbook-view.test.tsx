import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SportsbookView } from "./sportsbook-view";

vi.mock("@/hooks/use-sports-websocket", () => ({
  useSportsWebSocket: () => ({ isConnected: false, games: [] }),
}));
vi.mock("@/hooks/use-shared-websocket", () => ({
  useOrderBookWebSocket: () => undefined,
}));
vi.mock("@/hooks/use-orderbook-store", () => {
  const state = { orderBooks: new Map(), lastTrades: new Map() };
  return {
    useBestPrices: () => ({}),
    useOrderBookStore: (select: (value: typeof state) => unknown) =>
      select(state),
  };
});
vi.mock("next/dynamic", () => ({
  default:
    () =>
    ({ market }: { market: { title: string } }) => (
      <div data-testid="ticket">{market.title}</div>
    ),
}));
vi.mock("@/components/live-sportsbook", async () => {
  const helpers = await import("./sportsbook/market-parsing");
  const List = ({
    events,
    onMarketSelect,
  }: {
    events: import("./sportsbook/types").LiveEvent[];
    onMarketSelect: (
      info: import("./sportsbook/types").SelectedMarketInfo,
      index: number
    ) => void;
  }) => (
    <div>
      {events.map((event) => (
        <button
          key={event.id}
          type="button"
          onClick={() => {
            const market = event.markets?.[0];
            if (market)
              onMarketSelect(
                helpers.buildSelectedMarket(event, market).info,
                0
              );
          }}
        >
          {event.title}
        </button>
      ))}
    </div>
  );
  return { ...helpers, LiveSportsbook: List, ScheduledSportsbook: List };
});

afterEach(() => vi.unstubAllGlobals());

function event(id: string, ended = false) {
  return {
    id,
    slug: `nfl-game-${id}`,
    title: `Game ${id}`,
    ended,
    markets: [
      {
        id: `market-${id}`,
        question: `Game ${id}?`,
        conditionId: `0x${"a".repeat(64)}`,
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.4","0.6"]',
        clobTokenIds: '["123","456"]',
        sportsMarketType: "moneyline",
      },
    ],
  };
}

function renderFeed() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <SportsbookView tagSlug="nfl" label="NFL" />
    </QueryClientProvider>
  );
  return { ...view, client };
}

describe("sports feed continuation", () => {
  it("blocks pagination during a background refetch and enables it afterward", async () => {
    const calls: URL[] = [];
    let releaseRefetch!: () => void;
    const refetchGate = new Promise<void>((resolve) => {
      releaseRefetch = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), "https://knoww.app");
        calls.push(url);
        if (calls.length === 2) await refetchGate;
        return Response.json({
          success: true,
          data: [event(url.searchParams.has("after_cursor") ? "2" : "1")],
          pagination: {
            nextCursor: url.searchParams.has("after_cursor") ? null : "next",
          },
        });
      })
    );
    const { client } = renderFeed();
    const loadMore = await screen.findByRole("button", {
      name: "Load more markets",
    });
    let refetch!: Promise<void>;
    act(() => {
      refetch = client.refetchQueries({ type: "active" });
    });
    try {
      await waitFor(() => expect(loadMore).toBeDisabled());
      expect(
        screen.getByRole("button", { name: "Game 1" })
      ).toBeInTheDocument();
      fireEvent.click(loadMore);
      expect(calls).toHaveLength(2);
      expect(calls.every((url) => !url.searchParams.has("after_cursor"))).toBe(
        true
      );
    } finally {
      await act(async () => {
        releaseRefetch();
        await refetch;
      });
    }
    await waitFor(() => expect(loadMore).toBeEnabled());
    fireEvent.click(loadMore);
    await screen.findByRole("button", { name: "Game 2" });
    expect(calls[2].searchParams.get("after_cursor")).toBe("next");
  });

  it("loads the next small page without losing the selected market or duplicating the boundary", async () => {
    const calls: URL[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), "https://knoww.app");
        calls.push(url);
        return url.searchParams.has("after_cursor")
          ? Response.json({
              success: true,
              data: [event("1"), event("2")],
              pagination: { nextCursor: null },
            })
          : Response.json({
              success: true,
              data: [event("1")],
              pagination: { nextCursor: "next" },
            });
      })
    );
    renderFeed();
    await screen.findByRole("button", { name: "Game 1" });
    await waitFor(() =>
      expect(screen.getByTestId("ticket")).toHaveTextContent("Game 1")
    );
    fireEvent.click(screen.getByRole("button", { name: "Load more markets" }));
    await screen.findByRole("button", { name: "Game 2" });
    expect(screen.getAllByRole("button", { name: "Game 1" })).toHaveLength(1);
    expect(screen.getByTestId("ticket")).toHaveTextContent("Game 1");
    expect(calls.map((url) => url.searchParams.get("limit"))).toEqual([
      "6",
      "6",
    ]);
    expect(calls[1].searchParams.get("after_cursor")).toBe("next");
    expect(
      calls.every((url) => url.searchParams.get("markets") === "full")
    ).toBe(true);
    expect(
      screen.queryByRole("button", { name: "Load more markets" })
    ).not.toBeInTheDocument();
  });

  it("keeps loaded markets visible when continuation fails and allows retry", async () => {
    let attempts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), "https://knoww.app");
        if (!url.searchParams.has("after_cursor"))
          return Response.json({
            success: true,
            data: [event("1")],
            pagination: { nextCursor: "next" },
          });
        if (++attempts === 1)
          return Response.json(
            { success: false, error: "unavailable" },
            { status: 503 }
          );
        return Response.json({
          success: true,
          data: [event("2")],
          pagination: { nextCursor: null },
        });
      })
    );
    renderFeed();
    await screen.findByRole("button", { name: "Game 1" });
    fireEvent.click(screen.getByRole("button", { name: "Load more markets" }));
    const retry = await screen.findByRole("button", {
      name: "Retry loading markets",
    });
    expect(screen.getByRole("button", { name: "Game 1" })).toBeInTheDocument();
    expect(screen.queryByText("Feed Error")).not.toBeInTheDocument();
    fireEvent.click(retry);
    await screen.findByRole("button", { name: "Game 2" });
  });

  it("does not declare the league empty when the first batch is filtered out but more pages exist", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        Response.json({
          success: true,
          data: [event("1", true)],
          pagination: { nextCursor: "next" },
        })
      )
    );
    renderFeed();
    await screen.findByRole("button", { name: "Load more markets" });
    expect(
      screen.queryByText("No active NFL markets right now.")
    ).not.toBeInTheDocument();
  });
});
