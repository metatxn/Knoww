import { logWarn } from "@knoww/logger";
import { isSupportedSiteUrl } from "../site-support";
import { isWebmailUrl } from "../webmail";

export const TOOLBAR_BADGE_MESSAGE = "KNOWW_TOOLBAR_BADGE";
export const SIDEPANEL_BADGE_PORT = "knoww-sidepanel-badge";

export function formatMatchBadge(count: number): string {
  return count > 99 ? "99+" : count > 0 ? String(count) : "";
}

/** Serialize tab writes so a delayed count cannot overwrite a later clear. */
export class ToolbarBadgeController {
  private queues = new Map<number, Promise<void>>();
  private panels = new Map<number, Set<object>>();
  constructor(
    private readonly write: (tabId: number, text: string) => Promise<void>
  ) {}

  private enqueue(tabId: number, text: string): Promise<void> {
    const task = (this.queues.get(tabId) ?? Promise.resolve())
      .catch(() => {})
      .then(() => this.write(tabId, text));
    this.queues.set(tabId, task);
    void task
      .finally(() => {
        if (this.queues.get(tabId) === task) this.queues.delete(tabId);
      })
      .catch(() => {});
    return task;
  }

  matches(tabId: number, count: number, floatingOpen: boolean): Promise<void> {
    return this.enqueue(
      tabId,
      floatingOpen || this.panels.get(tabId)?.size
        ? ""
        : formatMatchBadge(count)
    );
  }

  panel(tabId: number, owner: object, open: boolean): Promise<void> {
    const owners = this.panels.get(tabId) ?? new Set<object>();
    if (open) owners.add(owner);
    else owners.delete(owner);
    if (owners.size) this.panels.set(tabId, owners);
    else this.panels.delete(tabId);
    // Closing never restores the previous count.
    return open ? this.clear(tabId) : Promise.resolve();
  }

  clear(tabId: number): Promise<void> {
    return this.enqueue(tabId, "");
  }
  remove(tabId: number): void {
    this.panels.delete(tabId);
  }
}

export function installToolbarBadge(): void {
  const badge = new ToolbarBadgeController(async (tabId, text) => {
    if (text) {
      await chrome.action.setBadgeBackgroundColor({ tabId, color: "#DC2626" });
      await chrome.action.setBadgeTextColor({ tabId, color: "#FFFFFF" });
    }
    await chrome.action.setBadgeText({ tabId, text });
  });
  const guard = (task: Promise<unknown>) =>
    void task.catch(() => {
      logWarn("toolbar.badge-update-failed");
    });
  const revisions = new Map<number, number>();
  const messages = new Map<number, Promise<void>>();
  chrome.tabs.onUpdated.addListener((tabId, change) => {
    if (change.url || change.status === "loading") {
      revisions.set(tabId, (revisions.get(tabId) ?? 0) + 1);
      guard(badge.clear(tabId));
    }
  });
  chrome.tabs.onRemoved.addListener((tabId) => {
    revisions.delete(tabId);
    badge.remove(tabId);
  });
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (
      message?.type !== TOOLBAR_BADGE_MESSAGE ||
      sender.id !== chrome.runtime.id ||
      sender.frameId !== 0 ||
      typeof sender.tab?.id !== "number"
    )
      return;
    const tabId = sender.tab.id;
    if (message.kind === "clear") {
      revisions.set(tabId, (revisions.get(tabId) ?? 0) + 1);
    }
    const revision = revisions.get(tabId) ?? 0;
    const task = (messages.get(tabId) ?? Promise.resolve())
      .catch(() => {})
      .then(async () => {
        const tab = await chrome.tabs.get(tabId);
        if (
          revision !== (revisions.get(tabId) ?? 0) ||
          message.pageUrl !== tab.url ||
          !isSupportedSiteUrl(tab.url) ||
          isWebmailUrl(tab.url) ||
          sender.documentLifecycle === "prerender"
        )
          return;
        if (message.kind === "clear") await badge.clear(tabId);
        else if (
          message.kind === "matches" &&
          Number.isSafeInteger(message.count) &&
          message.count >= 0 &&
          typeof message.floatingOpen === "boolean" &&
          tab.status !== "loading"
        ) {
          await badge.matches(tabId, message.count, message.floatingOpen);
        }
      });
    messages.set(tabId, task);
    guard(
      task.finally(() => {
        if (messages.get(tabId) === task) messages.delete(tabId);
      })
    );
  });
  chrome.runtime.onConnect.addListener((port) => {
    if (
      port.name !== SIDEPANEL_BADGE_PORT ||
      port.sender?.id !== chrome.runtime.id ||
      port.sender.url !== chrome.runtime.getURL("sidepanel.html")
    )
      return;
    let tabId: number | undefined;
    port.onMessage.addListener((message) => {
      if (
        !Number.isSafeInteger(message?.tabId) ||
        message.tabId < 0 ||
        typeof message.open !== "boolean"
      )
        return;
      if (tabId !== undefined) guard(badge.panel(tabId, port, false));
      tabId = message.open ? message.tabId : undefined;
      if (tabId !== undefined) {
        revisions.set(tabId, (revisions.get(tabId) ?? 0) + 1);
        guard(badge.panel(tabId, port, true));
      }
    });
    port.onDisconnect.addListener(() => {
      if (tabId !== undefined) guard(badge.panel(tabId, port, false));
    });
  });
}
