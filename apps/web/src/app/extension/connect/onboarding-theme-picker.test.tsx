import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ThemeProvider } from "next-themes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALL_THEMES } from "@/lib/themes";
import { OnboardingThemePicker } from "./onboarding-slot";

beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
  });
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.className = "";
  vi.unstubAllGlobals();
});

function mount() {
  return render(
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      themes={[...ALL_THEMES]}
    >
      <OnboardingThemePicker />
    </ThemeProvider>
  );
}

describe("onboarding theme picker", () => {
  it("offers every web theme and saves the selected theme across remounts", async () => {
    const view = mount();
    const trigger = await screen.findByRole("button", {
      name: "Light theme. Open theme picker.",
    });
    fireEvent.keyDown(trigger, { key: "Enter" });
    const items = await screen.findAllByRole("menuitem");
    expect(items).toHaveLength(ALL_THEMES.length);
    fireEvent.click(screen.getByRole("menuitem", { name: "Midnight" }));
    await waitFor(() => expect(localStorage.getItem("theme")).toBe("midnight"));
    expect(document.documentElement).toHaveClass("midnight");
    view.unmount();
    mount();
    expect(
      await screen.findByRole("button", {
        name: "Midnight theme. Open theme picker.",
      })
    ).toBeVisible();
  });
});
