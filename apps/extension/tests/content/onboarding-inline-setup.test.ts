// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InlineSetup } from "../../src/onboarding-inline-setup";
import { sendRuntimeMessage } from "../../src/sidepanel/messaging";
import { createPortfolioSetup } from "../../src/sidepanel/setup";

vi.mock("../../src/sidepanel/messaging", async (original) => ({
  ...(await original<object>()),
  sendRuntimeMessage: vi.fn(),
}));

let root: Root;
let container: HTMLDivElement;
let wallets: { uuid: string; name: string }[];

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  wallets = [{ uuid: "metamask", name: "MetaMask" }];
  vi.mocked(sendRuntimeMessage).mockImplementation(async (message) => {
    if (message.type === "auth:get-session-info")
      return { ok: true, data: { loggedIn: false } };
    if (message.type === "KNOWW_GET_PORTFOLIO_WALLETS")
      return { ok: true, data: { success: true, data: { wallets } } };
    return { ok: false };
  });
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(async () => {
  await React.act(async () => root.unmount());
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

async function mount() {
  await React.act(async () => {
    root.render(
      React.createElement(InlineSetup, { onProgress: async () => {} })
    );
  });
}

describe("inline onboarding setup", () => {
  it("shows only the active trading action for a new wallet", () => {
    const setup = createPortfolioSetup({
      presentation: "focused",
      root: container,
      getPortfolioData: () => null,
      reloadPortfolio: async () => {},
      renderPortfolio: () => {},
      invalidatePortfolio: () => {},
      resetFunding: () => {},
      openFunding: () => {},
    });
    const surface = setup.renderSurface({
      address: "0x0000000000000000000000000000000000000001",
      ownerAddress: "0x0000000000000000000000000000000000000002",
      walletMode: "deposit",
      hasTradingWallet: false,
      hasTradingCredentials: false,
      hasApproval: false,
      approvalReadStatus: "complete",
      cashBalance: 0,
    });
    container.innerHTML = surface.html;
    expect(
      container.querySelector("[data-deploy-portfolio-trading-wallet]")
    ).not.toBeNull();
    expect(container.querySelectorAll("button")).toHaveLength(1);
    expect(container.textContent).not.toContain("Generate API keys");
  });

  it.each([
    "[data-connect-portfolio-wallet]",
    "[data-connect-portfolio-walletconnect]",
  ])(
    "starts %s on the first click after the iframe gains focus",
    async (selector) => {
      await mount();
      const button = container.querySelector<HTMLButtonElement>(selector);
      if (!button) throw new Error("Wallet button missing");
      await React.act(async () => {
        window.dispatchEvent(new Event("focus"));
        button.click();
      });
      expect(
        vi
          .mocked(sendRuntimeMessage)
          .mock.calls.filter(
            ([message]) => message.type === "KNOWW_CONNECT_PORTFOLIO_WALLET"
          )
      ).toHaveLength(1);
    }
  );

  it("rediscovers wallets when Refresh setup is clicked", async () => {
    await mount();
    wallets = [...wallets, { uuid: "rabby", name: "Rabby" }];
    await React.act(async () => {
      container
        .querySelector<HTMLButtonElement>("[data-onboarding-refresh]")
        ?.click();
    });
    expect(
      container.querySelector("[data-sidepanel-portfolio]")?.textContent
    ).toContain("Rabby");
    expect(
      container.querySelector<HTMLButtonElement>("[data-onboarding-refresh]")
        ?.disabled
    ).toBe(false);
  });
});
