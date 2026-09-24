import { isEmbeddedOnboardingSender } from "../onboarding-state";

const PERMIT_TTL_MS = 240_000;
const permits = new Map<
  string,
  {
    tabId: number;
    address: string;
    url: string;
    expiresAt: number;
  }
>();

/** Only the packaged onboarding iframe can authorize signing in its host tab. */
export function issueOnboardingClobSigningPermit(
  sender: chrome.runtime.MessageSender,
  address: string
): string | undefined {
  const tabId = sender.tab?.id;
  const url = sender.tab?.url;
  if (
    sender.id !== chrome.runtime.id ||
    typeof tabId !== "number" ||
    !url ||
    typeof sender.frameId !== "number" ||
    sender.frameId <= 0 ||
    !/^0x[\da-f]{40}$/i.test(address) ||
    !isEmbeddedOnboardingSender(
      sender.url,
      url,
      chrome.runtime.getURL("onboarding.html"),
      __DEV_MODE__
    )
  )
    return undefined;

  const normalizedAddress = address.toLowerCase();
  for (const [token, permit] of permits) {
    if (
      permit.expiresAt <= Date.now() ||
      (permit.tabId === tabId && permit.address === normalizedAddress)
    ) {
      permits.delete(token);
    }
  }
  const token = crypto.randomUUID();
  permits.set(token, {
    tabId,
    address: normalizedAddress,
    url,
    expiresAt: Date.now() + PERMIT_TTL_MS,
  });
  return token;
}

export function consumeOnboardingClobSigningPermit(
  token: string,
  tabId: number,
  address: string
): string {
  const permit = permits.get(token);
  if (
    !permit ||
    permit.expiresAt <= Date.now() ||
    permit.tabId !== tabId ||
    permit.address !== address.toLowerCase()
  ) {
    throw new Error("Onboarding setup expired. Refresh setup and try again.");
  }
  permits.delete(token);
  return permit.url;
}

export function clearOnboardingClobSigningPermitsForTab(tabId: number): void {
  for (const [token, permit] of permits) {
    if (permit.tabId === tabId) permits.delete(token);
  }
}
