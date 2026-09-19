import { NextRequest } from "next/server";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/lib/api-rate-limit", () => ({ checkRateLimit: vi.fn(() => null) }));

import { GET } from "./route";

afterEach(() => vi.unstubAllGlobals());
it("rejects malformed market ids and out-of-range limits without upstream calls", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  for (const query of ["market=bad", `market=0x${"a".repeat(64)}&limit=21`]) {
    expect(
      (
        await GET(
          new NextRequest(
            `https://knoww.app/api/polymarket/markets/holders?${query}`
          )
        )
      ).status
    ).toBe(400);
  }
  expect(fetcher).not.toHaveBeenCalled();
});
it("reads holders from v2 through the registry", async () => {
  const fetcher = vi.fn(async (_input: RequestInfo | URL) =>
    Response.json({ data: [], pagination: { next_cursor: null } })
  );
  vi.stubGlobal("fetch", fetcher);
  const response = await GET(
    new NextRequest(
      `https://knoww.app/api/polymarket/markets/holders?market=0x${"a".repeat(64)}`
    )
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual([]);
  expect(new URL(String(fetcher.mock.calls[0]?.[0])).pathname).toBe(
    "/v2/holders"
  );
});
