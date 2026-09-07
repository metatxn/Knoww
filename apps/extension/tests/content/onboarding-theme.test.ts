// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyOnboardingTheme,
  ONBOARDING_THEME_COLORS,
} from "../../src/onboarding-theme";

afterEach(() => vi.unstubAllGlobals());

describe("onboarding theme messages", () => {
  function setup() {
    vi.stubGlobal("CSS", {
      supports: (_property: string, value: string) =>
        /^#[a-f0-9]{6}$/i.test(value),
    });
    const root = document.createElement("div");
    const colors = Object.fromEntries(
      Object.keys(ONBOARDING_THEME_COLORS).map((key) => [key, "#fafafa"])
    );
    const data = {
      type: "knoww:onboarding-theme",
      colorScheme: "light",
      colors,
    };
    const send = (patch = {}) =>
      applyOnboardingTheme(
        new MessageEvent("message", {
          source: window,
          origin: "https://knoww.app",
          data,
          ...patch,
        }),
        window,
        "https://knoww.app",
        root
      );
    return { root, data, send };
  }

  it("applies the host colors and subsequent theme changes", () => {
    const { root, data, send } = setup();
    send();
    expect(root.style.getPropertyValue("--bg")).toBe("#fafafa");
    expect(root.style.colorScheme).toBe("light");
    data.colors["--bg"] = "#111936";
    data.colorScheme = "dark";
    send();
    expect(root.style.getPropertyValue("--bg")).toBe("#111936");
    expect(root.style.colorScheme).toBe("dark");
  });

  it("ignores other windows, origins, and message types", () => {
    const { root, data, send } = setup();
    send({ source: null });
    send({ origin: "https://example.com" });
    send({ data: { ...data, type: "unrelated" } });
    expect(root.style.cssText).toBe("");
  });

  it("rejects invalid palettes without partially changing the theme", () => {
    const { root, data, send } = setup();
    data.colors["--text"] = "url(https://example.com/image)";
    send();
    expect(root.style.cssText).toBe("");
    send({ data: { ...data, colors: null } });
    expect(root.style.cssText).toBe("");
  });

  it("does not apply unrecognized properties", () => {
    const { root, data, send } = setup();
    data.colors["background-image"] = "url(https://example.com/image)";
    send();
    expect(root.style.backgroundImage).toBe("");
    expect(root.classList.contains("onboarding-themed")).toBe(true);
  });
});
