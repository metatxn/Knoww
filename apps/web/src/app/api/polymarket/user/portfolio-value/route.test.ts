import { NextRequest } from "next/server";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/lib/api-rate-limit", () => ({ checkRateLimit: vi.fn(() => null) }));
vi.mock("@/polymarket/wallet-reads", () => ({
  fetchWalletDataResponse: vi.fn(),
}));

import { fetchWalletDataResponse } from "@/polymarket/wallet-reads";
import { GET } from "./route";

const user = `0x${"1".repeat(40)}`;
afterEach(() => vi.resetAllMocks());
it.each([
  {
    payload: [
      { user, value: 123.45 },
      { user, value: 999 },
    ],
    expected: 123.45,
  },
  { payload: [], expected: 0 },
  { payload: null, expected: 0 },
  { payload: { value: 123.45 }, expected: 0 },
  { payload: [null], expected: 0 },
  { payload: [{}], expected: 0 },
  { payload: [{ value: "invalid" }], expected: 0 },
  { payload: [{ value: null }], expected: 0 },
  { payload: [{ value: 0 }], expected: 0 },
])(
  "reads the first wallet value, falling back to zero for invalid data: $payload",
  async ({ payload, expected }) => {
    vi.mocked(fetchWalletDataResponse).mockResolvedValue(
      Response.json(payload)
    );
    const response = await GET(
      new NextRequest(
        `https://knoww.app/api/polymarket/user/portfolio-value?user=${user}`
      )
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      portfolioValue: expected,
    });
    expect(fetchWalletDataResponse).toHaveBeenCalledWith(
      "value",
      new URLSearchParams({ user }),
      expect.any(Object)
    );
  }
);
