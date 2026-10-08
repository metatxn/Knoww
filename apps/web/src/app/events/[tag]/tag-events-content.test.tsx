import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useEventFiltersMock = vi.hoisted(() => vi.fn());
const usePaginatedEventsMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock("@/components/app-layout", () => ({
  ChromeHeader: () => null,
}));

vi.mock("@/components/event-card", () => ({
  EventCard: ({ event }: { event: { title: string } }) => (
    <div>{event.title}</div>
  ),
  EventCardSkeleton: ({ className }: { className?: string }) => (
    <div data-testid="loading-card" className={className} />
  ),
  skeletonVisibilityClass: () => "",
}));

vi.mock("@/components/event-filter-bar", () => ({
  EventFilterBar: () => null,
}));

vi.mock("@/components/market-search", () => ({
  MarketSearch: () => null,
}));

vi.mock("@/components/navbar", () => ({
  Navbar: () => null,
}));

vi.mock("@/components/product-footer", () => ({
  ProductFooter: () => null,
}));

vi.mock("@/components/product-hero", () => ({
  ProductHero: ({ rightSlot }: { rightSlot?: React.ReactNode }) => (
    <div>{rightSlot}</div>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CardHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CardTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/context/event-filter-context", () => ({
  useEventFilters: useEventFiltersMock,
}));

vi.mock("@/hooks/use-paginated-events", () => ({
  usePaginatedEvents: usePaginatedEventsMock,
}));

import { TagEventsContent } from "./tag-events-content";

describe("TagEventsContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useEventFiltersMock.mockReturnValue({
      filters: {
        dateRange: { start: null, end: null },
        volumeWindow: "1wk",
      },
      hasActiveFilters: true,
      serverFilterParams: {},
      apiQueryParams: { closed: false },
    });
    usePaginatedEventsMock.mockReturnValue({
      data: { pages: [{ events: [{ id: "1", title: "Bitcoin market" }] }] },
      isLoading: false,
      error: null,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
  });

  it("sorts tag pages by the selected volume window", () => {
    render(
      <TagEventsContent
        initialData={null}
        initialTag={{ label: "Crypto", slug: "crypto" }}
        tagSlug="crypto"
      />
    );

    expect(usePaginatedEventsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        order: "volume1wk",
        tagSlug: "crypto",
      })
    );
  });

  it.each(["politics", "crypto"])(
    "keeps %s pagination placeholders in the existing card grid",
    (tagSlug) => {
      usePaginatedEventsMock.mockReturnValue({
        data: { pages: [{ events: [{ id: "1", title: "Existing market" }] }] },
        isLoading: false,
        error: null,
        fetchNextPage: vi.fn(),
        hasNextPage: true,
        isFetchingNextPage: true,
      });
      const page = render(<TagEventsContent tagSlug={tagSlug} />);
      const card = screen.getByText("Existing market");
      const placeholders = screen.getAllByTestId("loading-card");

      expect(page.container.querySelectorAll(".grid")).toHaveLength(1);
      for (const placeholder of placeholders) {
        expect(placeholder.parentElement).toBe(card.parentElement);
      }
      expect(card.parentElement).toHaveAttribute("aria-busy", "true");

      usePaginatedEventsMock.mockReturnValue({
        data: {
          pages: [
            {
              events: [
                { id: "1", title: "Existing market" },
                { id: "2", title: "New market" },
              ],
            },
          ],
        },
        isLoading: false,
        error: null,
        fetchNextPage: vi.fn(),
        hasNextPage: false,
        isFetchingNextPage: false,
      });
      page.rerender(<TagEventsContent tagSlug={tagSlug} />);
      expect(screen.getByText("Existing market")).toBe(card);
      expect(screen.getByText("New market").parentElement).toBe(
        card.parentElement
      );
      expect(screen.queryByTestId("loading-card")).toBeNull();
      expect(card.parentElement).toHaveAttribute("aria-busy", "false");
    }
  );
});
