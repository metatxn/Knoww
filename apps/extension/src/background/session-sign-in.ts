import { sameAddress } from "@knoww/shared-types/bridge";
import {
  parseSessionSignInRequest,
  SESSION_SIGN_IN_HASH,
  type SessionSignInRequest,
} from "../session-sign-in";
import type { BackgroundResponse } from "../types/chrome-messages";
import { getExtensionSessionInfo, getKnowwAppUrl } from "./extension-session";

type Reply = (response: BackgroundResponse) => void;
interface PendingSignIn {
  id: string;
  url: string;
  tabId?: number;
  sourceTabId: number;
  request: SessionSignInRequest;
  replies: Reply[];
  timer: ReturnType<typeof setTimeout>;
  onRemoved: (tabId: number) => void;
  onUpdated: (tabId: number, change: { url?: string; status?: string }) => void;
}
let pending: PendingSignIn | null = null;

function finish(attempt: PendingSignIn, error?: string): void {
  if (pending !== attempt) return;
  pending = null;
  clearTimeout(attempt.timer);
  chrome.tabs.onRemoved.removeListener(attempt.onRemoved);
  chrome.tabs.onUpdated.removeListener(attempt.onUpdated);
  void (async () => {
    const session = error
      ? null
      : await getExtensionSessionInfo().catch(() => null);
    const success =
      session?.loggedIn &&
      session.address &&
      sameAddress(session.address, attempt.request.address);
    for (const reply of attempt.replies) {
      try {
        reply(
          success
            ? { ok: true, data: session }
            : {
                ok: false,
                error:
                  error || "Sign in with the requested wallet to continue.",
              }
        );
      } catch {
        // A source tab may have closed while the sign-in prompt was open.
      }
    }
    if (attempt.tabId !== undefined)
      await chrome.tabs.remove(attempt.tabId).catch(() => {});
    await chrome.tabs
      .update(attempt.sourceTabId, { active: true })
      .catch(() => {});
  })();
}

export function cancelSessionSignIn(): void {
  if (pending) finish(pending, "Knoww sign-in was cancelled.");
}

export function isSessionSignInSender(
  sender: chrome.runtime.MessageSender
): boolean {
  return Boolean(
    pending &&
      sender.id === chrome.runtime.id &&
      sender.frameId === 0 &&
      sender.tab?.id === pending.tabId &&
      sender.url === pending.url &&
      sender.tab?.url === pending.url
  );
}

export function handleSessionSignInMessage(
  value: unknown,
  sender: chrome.runtime.MessageSender,
  reply: Reply
): boolean {
  const message = value as {
    type?: string;
    requestId?: string;
    error?: string;
  } | null;
  if (
    !message?.type ||
    ![
      "auth:open-sign-in",
      "auth:sign-in-details",
      "auth:sign-in-complete",
    ].includes(message.type)
  )
    return false;
  if (sender.id !== chrome.runtime.id) {
    reply({ ok: false, error: "Unauthorized sign-in request." });
    return true;
  }
  if (message.type !== "auth:open-sign-in") {
    if (
      !pending ||
      !isSessionSignInSender(sender) ||
      message.requestId !== pending.id
    ) {
      reply({
        ok: false,
        error:
          "This sign-in request has expired. Return to your trading tab and try again.",
      });
    } else if (message.type === "auth:sign-in-details") {
      reply({ ok: true, data: pending.request });
    } else {
      reply({ ok: true, data: null });
      finish(
        pending,
        typeof message.error === "string"
          ? message.error.slice(0, 500)
          : undefined
      );
    }
    return true;
  }
  const request = parseSessionSignInRequest(value);
  if (!request || sender.tab?.id === undefined || sender.frameId !== 0) {
    reply({ ok: false, error: "Invalid sign-in request." });
    return true;
  }
  if (pending) {
    if (
      sameAddress(pending.request.address, request.address) &&
      pending.request.wallet.rdns === request.wallet.rdns &&
      pending.request.wallet.name === request.wallet.name
    ) {
      pending.replies.push(reply);
    } else
      reply({
        ok: false,
        error: "Finish or cancel the open Knoww sign-in first.",
      });
    return true;
  }
  const id = crypto.randomUUID();
  const attempt: PendingSignIn = {
    id,
    url: `${getKnowwAppUrl()}/extension/connect${SESSION_SIGN_IN_HASH}${id}`,
    sourceTabId: sender.tab.id,
    request,
    replies: [reply],
    timer: setTimeout(
      () => finish(attempt, "Knoww sign-in timed out. Please try again."),
      180_000
    ),
    onRemoved: (tabId) => {
      if (tabId === attempt.tabId || tabId === attempt.sourceTabId)
        finish(attempt, "Knoww sign-in was cancelled.");
    },
    onUpdated: (tabId, change) => {
      if (
        (tabId === attempt.tabId && change.url && change.url !== attempt.url) ||
        (tabId === attempt.sourceTabId && change.status === "loading")
      )
        finish(attempt, "Knoww sign-in was cancelled.");
    },
  };
  pending = attempt;
  chrome.tabs.onRemoved.addListener(attempt.onRemoved);
  chrome.tabs.onUpdated.addListener(attempt.onUpdated);
  void chrome.tabs
    .create({ url: attempt.url, active: true, windowId: sender.tab.windowId })
    .then((tab) => {
      if (pending !== attempt) {
        if (tab.id !== undefined)
          void chrome.tabs.remove(tab.id).catch(() => {});
        return;
      }
      if (tab.id === undefined)
        finish(attempt, "Could not open Knoww sign-in.");
      else attempt.tabId = tab.id;
    })
    .catch(() => finish(attempt, "Could not open Knoww sign-in."));
  return true;
}
