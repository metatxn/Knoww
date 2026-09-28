import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

const fetchJson = vi.hoisted(() => vi.fn());
vi.mock("@/lib/fetch-json", () => ({ fetchJson }));

import { useEventCards } from "./use-event-cards";

afterEach(() => {
  vi.useRealTimers();
  fetchJson.mockReset();
});

it("continues a short page and stops at a terminal cursor regardless of the reported total", async () => {
  vi.useFakeTimers();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  fetchJson
    .mockResolvedValueOnce({
      data: [{ id: "1" }, { id: "2" }],
      pagination: { nextCursor: "opaque-next-page", totalResults: 999 },
      freshness: { generatedAt: Date.now(), stale: false },
    })
    .mockResolvedValueOnce({
      data: [{ id: "3" }],
      pagination: { nextCursor: null, totalResults: 999 },
      freshness: { generatedAt: Date.now(), stale: false },
    });
  const { result, unmount } = renderHook(
    () => useEventCards({ feed: "categories" }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    }
  );
  try {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(
      result.current.data?.pages
        .flatMap((page) => page.events)
        .map((event) => event.id)
    ).toEqual(["1", "2"]);
    expect(result.current.hasNextPage).toBe(true);
    await act(async () => {
      await result.current.fetchNextPage();
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(
      new URL(fetchJson.mock.calls[1][0], "https://knoww.app").searchParams.get(
        "after_cursor"
      )
    ).toBe("opaque-next-page");
    expect(
      result.current.data?.pages
        .flatMap((page) => page.events)
        .map((event) => event.id)
    ).toEqual(["1", "2", "3"]);
    expect(result.current.hasNextPage).toBe(false);
  } finally {
    unmount();
    client.clear();
  }
});

it("polls a stale snapshot until it recovers, then stops polling", async () => {
  vi.useFakeTimers();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const response = (stale: boolean) => ({
    data: [{ id: "1" }],
    pagination: { nextCursor: null },
    freshness: { generatedAt: Date.now(), stale },
  });
  fetchJson
    .mockResolvedValueOnce(response(true))
    .mockResolvedValue(response(false));
  const { result, unmount } = renderHook(
    () => useEventCards({ feed: "categories" }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    }
  );
  try {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(result.current.feedStale).toBe(true);
    expect(
      new URL(fetchJson.mock.calls[0][0], "https://knoww.app").searchParams.get(
        "limit"
      )
    ).toBe("10");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_001);
    });
    expect(result.current.feedStale).toBe(false);
    expect(fetchJson).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(fetchJson).toHaveBeenCalledTimes(2);
  } finally {
    unmount();
    client.clear();
  }
});
