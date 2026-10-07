import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventFilterProvider } from "@/context/event-filter-context";
import { HomeContent } from "./home-content";

const navigation = vi.hoisted(() => ({ params: new URLSearchParams() }));
const useEventCards = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => navigation.params,
}));
vi.mock("@/components/navbar", () => ({ Navbar: () => null }));
vi.mock("@/components/app-layout", () => ({ ChromeHeader: () => null }));
vi.mock("@/components/market-search", () => ({ MarketSearch: () => null }));
vi.mock("@/components/event-filter-bar", () => ({
  EventFilterBar: () => null,
  FilterChip: () => null,
  useFilterBarState: () => ({ filters: { tagSlugs: [] }, tags: [] }),
}));
vi.mock("@/components/event-card", () => ({ EventCard: () => null }));
vi.mock("@/components/markets-view", () => ({
  MarketsView: ({ viewMode }: { viewMode: string }) => (
    <output aria-label="Desktop market view">{viewMode}</output>
  ),
  TableSkeleton: () => null,
}));
vi.mock("@/hooks/use-event-cards", () => ({ useEventCards }));
vi.mock("@/hooks/use-search", () => ({ fetchSearchResults: vi.fn() }));
vi.mock("./markets/use-markets-webmcp", () => ({
  useMarketsWebMcp: () => {},
}));

function renderHome() {
  return render(
    <EventFilterProvider>
      <HomeContent />
    </EventFilterProvider>
  );
}

function expectView(mode: string, label: string) {
  expect(screen.getByRole("tab", { name: label })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  expect(screen.getByLabelText("Desktop market view")).toHaveTextContent(mode);
  const latestQueries = useEventCards.mock.calls.slice(-4);
  expect(
    latestQueries
      .filter(([query]) => query.enabled)
      .map(([query]) => query.feed)
  ).toEqual([mode]);
}

beforeEach(() => {
  navigation.params = new URLSearchParams();
  useEventCards.mockReset();
  useEventCards.mockReturnValue({
    data: { pages: [{ events: [{ id: "event-1", title: "Market" }] }] },
    isLoading: false,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
  });
});

describe("market view navigation", () => {
  it("selects Trending and its feed for the portfolio's existing sort URL", () => {
    navigation.params = new URLSearchParams("sort=trending");
    sessionStorage.setItem("homeViewMode", "categories");
    renderHome();
    expectView("trending", "Trending");
    expect(
      useEventCards.mock.calls
        .slice(0, 4)
        .filter(([query]) => query.enabled)
        .map(([query]) => query.feed)
    ).toEqual(["trending"]);
  });

  it.each([
    ["categories", "All"],
    ["trending", "Trending"],
    ["breaking", "Breaking"],
    ["new", "New"],
  ])(
    "selects the explicit view %s ahead of a saved preference",
    (mode, label) => {
      navigation.params = new URLSearchParams(`view=${mode}`);
      sessionStorage.setItem("homeViewMode", "breaking");
      renderHome();
      expectView(mode, label);
    }
  );

  it("gives the canonical view parameter precedence over sort", () => {
    navigation.params = new URLSearchParams("view=new&sort=trending");
    renderHome();
    expectView("new", "New");
  });

  it("follows query changes during client navigation", () => {
    const page = renderHome();
    expectView("categories", "All");
    navigation.params = new URLSearchParams("sort=trending");
    page.rerender(
      <EventFilterProvider>
        <HomeContent />
      </EventFilterProvider>
    );
    expectView("trending", "Trending");
  });

  it("opens All after Trending when Explore markets requests categories", () => {
    navigation.params = new URLSearchParams("view=trending");
    const page = renderHome();
    expectView("trending", "Trending");
    expect(sessionStorage.getItem("homeViewMode")).toBe("trending");

    navigation.params = new URLSearchParams("view=categories");
    page.rerender(
      <EventFilterProvider>
        <HomeContent />
      </EventFilterProvider>
    );
    expectView("categories", "All");
  });

  it("preserves a saved view when no valid URL view exists", () => {
    navigation.params = new URLSearchParams("sort=unsupported");
    sessionStorage.setItem("homeViewMode", "new");
    renderHome();
    expectView("new", "New");
  });

  it("falls back to All when URL and saved views are invalid", () => {
    navigation.params = new URLSearchParams("view=unsupported");
    sessionStorage.setItem("homeViewMode", "unsupported");
    renderHome();
    expectView("categories", "All");
  });
});
