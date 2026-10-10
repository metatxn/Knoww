import { afterEach, describe, expect, it, vi } from "vitest";
import SportSubPage, { generateMetadata } from "./page";

vi.mock("@/app/events/sports/sports-content", () => ({
  SportsContent: () => null,
}));
const preload = vi.hoisted(() => vi.fn());
vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-dom")>()),
  preload,
}));
afterEach(() => {
  vi.unstubAllGlobals();
  preload.mockClear();
});

describe("sports page inventory", () => {
  it("keeps a populated category indexable and preloads its event image", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        Response.json({
          events: [
            { id: "1", image: "https://example.com/game.png", markets: [] },
          ],
          next_cursor: null,
        })
      )
    );
    const params = Promise.resolve({ sport: "nfl" });
    const metadata = await generateMetadata({ params });
    expect(metadata.robots).toMatchObject({ index: true, follow: true });
    await SportSubPage({ params });
    expect(preload).toHaveBeenCalledWith(
      expect.stringContaining("game.png"),
      expect.objectContaining({ as: "image", fetchPriority: "high" })
    );
  });

  it("marks only a successful empty inventory as noindex", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(() =>
          Response.json({ events: [], next_cursor: null })
        )
    );
    const metadata = await generateMetadata({
      params: Promise.resolve({ sport: "golf" }),
    });
    expect(metadata.robots).toMatchObject({ index: false, follow: true });
  });

  it("propagates upstream failure from metadata and page rendering", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => new Response("down", { status: 503 }))
    );
    const params = Promise.resolve({ sport: "nfl" });
    await expect(generateMetadata({ params })).rejects.toThrow("503");
    await expect(SportSubPage({ params })).rejects.toThrow("503");
  });
});
