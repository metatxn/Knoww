import { isOnboardingWalletSetupUrl } from "./onboarding-state";
import { ONBOARDING_THEME_COLORS } from "./onboarding-theme";

// This content script only mounts packaged UI. It does not forward page messages
// into the extension runtime or expose wallet/session data to the website.
if (isOnboardingWalletSetupUrl(location.href)) {
  const mount = () => {
    const slot = document.getElementById("knoww-extension-onboarding");
    if (slot?.dataset.ready !== "true" || slot.querySelector("iframe")) return;
    const frame = document.createElement("iframe");
    frame.src = chrome.runtime.getURL("onboarding.html?embedded=1");
    frame.title = "Knoww extension setup";
    frame.style.cssText =
      "display:block;position:absolute;visibility:hidden;width:100%;height:100%;border:0;background:transparent";
    const extensionOrigin = chrome.runtime.getURL("").replace(/\/$/, "");
    const themeRoot = slot.closest(".kw-page") ?? document.documentElement;
    const syncTheme = () => {
      const styles = getComputedStyle(themeRoot);
      frame.contentWindow?.postMessage(
        {
          type: "knoww:onboarding-theme",
          colorScheme: styles.colorScheme,
          colors: Object.fromEntries(
            Object.entries(ONBOARDING_THEME_COLORS).map(([key, token]) => [
              key,
              styles.getPropertyValue(token).trim(),
            ])
          ),
        },
        extensionOrigin
      );
    };
    frame.addEventListener("load", syncTheme);
    new MutationObserver(syncTheme).observe(themeRoot, {
      attributes: true,
      attributeFilter: ["data-theme", "data-scheme", "class", "style"],
    });
    window.addEventListener("message", (event) => {
      if (
        event.source !== frame.contentWindow ||
        event.origin !== extensionOrigin ||
        event.data?.type !== "knoww:onboarding-height"
      )
        return;
      const height = event.data.height;
      if (typeof height === "number" && Number.isFinite(height)) {
        syncTheme();
        frame.style.position = "static";
        frame.style.visibility = "visible";
        const fallback = document.getElementById(
          "knoww-extension-onboarding-fallback"
        );
        if (fallback) fallback.hidden = true;
      }
    });
    slot.append(frame);
  };
  mount();
  new MutationObserver(mount).observe(document.documentElement, {
    childList: true,
    attributes: true,
    attributeFilter: ["data-ready"],
    subtree: true,
  });
}
