import { describe, expect, it, vi } from "vitest";
import { readCacheHint, withUpstreamTimeout } from "./fetch-options";

/**
 * Cache hints travel on the request init so an injected fetch (the web app's
 * Next-aware one) can map them onto its own cache options. Services never
 * import Next; see the ADR section "Caching by injection".
 */
describe("withUpstreamTimeout cache hints", () => {
  it("forwards the cache hint on the request init", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("{}"));
    const hint = { revalidateSeconds: 60, tags: ["events"] };

    await withUpstreamTimeout(
      { fetchImpl, cache: hint },
      1_000,
      (fetchFn, signal) => fetchFn("https://example.test/x", { signal })
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(readCacheHint(init)).toEqual(hint);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("adds no hint when the caller gave none", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("{}"));

    await withUpstreamTimeout({ fetchImpl }, 1_000, (fetchFn, signal) =>
      fetchFn("https://example.test/x", { signal })
    );

    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(readCacheHint(init)).toBeUndefined();
    expect(Object.keys(init ?? {})).toEqual(["signal"]);
  });
});

describe("readCacheHint", () => {
  it("returns undefined for a missing init", () => {
    expect(readCacheHint(undefined)).toBeUndefined();
  });
});
