import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { transpile } from "typescript";
import { describe, expect, it, vi } from "vitest";

const readSource = (path: string): string =>
  readFileSync(join(process.cwd(), path), "utf8");

describe("unsupported-site toolbar routing", () => {
  it.each([false, true])(
    "generates only explicit host permissions (store=%s)",
    (storeBuild) => {
      const webpack = readSource("webpack.config.cjs");
      const helpers = webpack.slice(
        webpack.indexOf("function extractStringArray"),
        webpack.indexOf("const transformersEntry")
      );
      const permissions: string[] = runInNewContext(
        `${helpers}; buildHostPermissions(hosts, false, storeBuild)`,
        { hosts: readSource("src/supported-hosts.ts"), storeBuild }
      );
      expect(permissions.length).toBeGreaterThan(0);
      expect(permissions).toContain("https://x.com/*");
      expect(permissions).toContain("https://knoww.app/*");
      expect(
        permissions.some(
          (pattern) =>
            pattern === "<all_urls>" ||
            /^\*?:?\/\/\*/.test(pattern) ||
            /^[^:]+:\/\/\*\//.test(pattern)
        )
      ).toBe(false);
    }
  );

  it.each([false, true])(
    "migrates script registrations without adding all-site injection (existing=%s)",
    async (hasLegacy) => {
      const background = readSource("src/background.ts");
      const register = background.slice(
        background.indexOf("async function performContentScriptRegistration"),
        background.indexOf("\nregisterContentScripts();")
      );
      const scripting = {
        getRegisteredContentScripts: vi
          .fn()
          .mockResolvedValue(
            hasLegacy ? [{ id: "legacy" }, { id: "supported" }] : []
          ),
        unregisterContentScripts: vi.fn().mockResolvedValue(undefined),
        updateContentScripts: vi.fn().mockResolvedValue(undefined),
        registerContentScripts: vi.fn().mockResolvedValue(undefined),
      };
      const logWarn = vi.fn();
      await runInNewContext(
        transpile(`${register}; performContentScriptRegistration()`),
        {
          chrome: { scripting },
          logWarn,
          __DEV_MODE__: false,
          CONTENT_SCRIPT_ID: "supported",
          ONBOARDING_WALLET_SETUP_SCRIPT_ID: "onboarding",
          UNSUPPORTED_SITE_SUPPORT_SCRIPT_ID: "legacy",
          SUPPORTED_MATCH_PATTERNS: ["https://x.com/*"],
          WEBMAIL_HOST_EXCLUDE_PATTERNS: [],
          getOnboardingWalletSetupMatchPatterns: () => [
            "https://knoww.app/extension/connect",
          ],
        }
      );
      expect(logWarn).not.toHaveBeenCalled();
      if (hasLegacy)
        expect(scripting.unregisterContentScripts).toHaveBeenCalledWith({
          ids: ["legacy"],
        });
      else expect(scripting.unregisterContentScripts).not.toHaveBeenCalled();
      const registrations = [
        ...scripting.registerContentScripts.mock.calls,
        ...scripting.updateContentScripts.mock.calls,
      ].flatMap(([scripts]) => scripts);
      expect(registrations.map((script) => script.id).sort()).toEqual([
        "onboarding",
        "supported",
      ]);
      expect(registrations.flatMap((script) => script.matches)).toEqual(
        expect.arrayContaining([
          "https://x.com/*",
          "https://knoww.app/extension/connect",
        ])
      );
    }
  );

  it("uses activeTab without requesting all-site host access", () => {
    const manifest = JSON.parse(readSource("manifest.json"));
    const webpack = readSource("webpack.config.cjs");
    const buildHosts = webpack.slice(
      webpack.indexOf("function buildHostPermissions"),
      webpack.indexOf("function buildWarMatches")
    );
    expect(manifest.permissions).toContain("activeTab");
    expect(buildHosts).not.toContain("unsupportedSiteSupportPatterns");
    expect(buildHosts).not.toContain("UNSUPPORTED_SITE_SUPPORT");
    expect(buildHosts).toContain('"SUPPORTED_MATCH_PATTERNS"');
    expect(buildHosts).toContain('"API_HOST_PERMISSIONS"');
  });

  it("removes the old all-site registration while retaining supported-site scripts", () => {
    const background = readSource("src/background.ts");
    expect(background).toContain("chrome.scripting.unregisterContentScripts");
    expect(background).toContain("ids: [UNSUPPORTED_SITE_SUPPORT_SCRIPT_ID]");
    expect(background).not.toContain("id: UNSUPPORTED_SITE_SUPPORT_SCRIPT_ID");
    expect(background).toContain("matches: SUPPORTED_MATCH_PATTERNS");
    expect(background).toContain("id: ONBOARDING_WALLET_SETUP_SCRIPT_ID");
  });

  it("routes an unsupported toolbar click to the floating support prompt", () => {
    const background = readSource("src/background.ts");
    const clickHandler = background.slice(
      background.indexOf("chrome.action.onClicked.addListener"),
      background.indexOf("chrome.runtime.onInstalled.addListener")
    );

    expect(clickHandler).toContain("getUnsupportedSiteHostname(tab.url)");
    expect(clickHandler).toContain(
      "showUnsupportedSiteSupportPrompt(tab.id, { reveal: true })"
    );
    expect(clickHandler).not.toContain("openSiteSupportRequest(");
    expect(background).toContain(
      "setPanelBehavior({ openPanelOnActionClick: false })"
    );
    expect(background).toContain(
      'response?.surface === "unsupported-site-prompt"'
    );
    expect(clickHandler.indexOf("getUnsupportedSiteHostname")).toBeLessThan(
      clickHandler.indexOf("cachedNotificationPanelSurface")
    );
  });

  it("does not inject prompts into existing tabs on install or update", () => {
    const background = readSource("src/background.ts");
    expect(background).not.toContain("refreshOpenUnsupportedSitePrompts");
    expect(background).not.toContain("reveal: false");
  });

  it("does not attach a full URL or path to default usage events", () => {
    const analytics = readSource("src/content/analytics.ts");

    expect(analytics).not.toContain("page_url");
    expect(analytics).not.toContain("page_path");
    const emittedContext = analytics.slice(
      analytics.indexOf("return {"),
      analytics.indexOf("function isAnalyticsEnabled")
    );
    expect(emittedContext).not.toContain("window.location.href");
    expect(emittedContext).not.toContain("pageUrl");
    expect(analytics).not.toContain("window.location.pathname");
  });
});
