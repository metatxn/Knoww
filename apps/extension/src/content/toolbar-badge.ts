import type { Market } from "../types/market";

let pageUrl = "";
const matched = new Set<string>();
const read = new Set<string>();

function markMatchesRead(): void {
  for (const id of matched) read.add(id);
  matched.clear();
}

function isFloatingPanelOpen(): boolean {
  const panel = document.getElementById("knoww-notification-stack");
  return !!panel && getComputedStyle(panel).display !== "none";
}

function send(kind: "matches" | "clear"): void {
  const floatingOpen = isFloatingPanelOpen();
  if (floatingOpen) markMatchesRead();
  try {
    void chrome.runtime
      .sendMessage({
        type: "KNOWW_TOOLBAR_BADGE",
        kind,
        pageUrl: window.location.href,
        count: matched.size,
        floatingOpen,
      })
      .catch(() => {});
  } catch {
    /* An extension reload must not interrupt matching. */
  }
}

function syncPage(): void {
  if (pageUrl === window.location.href) return;
  pageUrl = window.location.href;
  matched.clear();
  read.clear();
  send("clear");
}

export function recordToolbarMatches(
  markets: readonly Pick<Market, "id" | "source">[],
  runUrl: string
): void {
  syncPage();
  if (runUrl !== pageUrl) return;
  const floatingOpen = isFloatingPanelOpen();
  for (const market of markets) {
    const id = `${market.source || "polymarket"}:${market.id}`;
    if (floatingOpen) read.add(id);
    else if (!read.has(id)) matched.add(id);
  }
}

export function finishToolbarMatchRun(runUrl: string): void {
  syncPage();
  if (runUrl === pageUrl) send("matches");
}

export function replaceToolbarMatches(
  markets: readonly Pick<Market, "id" | "source">[],
  runUrl: string
): void {
  syncPage();
  if (runUrl !== pageUrl) return;
  matched.clear();
  recordToolbarMatches(markets, runUrl);
  finishToolbarMatchRun(runUrl);
}

export function clearToolbarBadge(): void {
  syncPage();
  markMatchesRead();
  send("clear");
}

window.addEventListener("popstate", syncPage);
window.addEventListener("hashchange", syncPage);
(window as Window & { navigation?: EventTarget }).navigation?.addEventListener(
  "currententrychange",
  syncPage
);
