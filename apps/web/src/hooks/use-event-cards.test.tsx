import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

const fetchJson = vi.hoisted(() => vi.fn());
vi.mock("@/lib/fetch-json", () => ({ fetchJson }));

import { useEventCards } from "./use-event-cards";

afterEach(() => vi.useRealTimers());

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
