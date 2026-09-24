import type { buildClobAuthRpcTypedData } from "@knoww/shared-types/polymarket";
import { getAddress, recoverTypedDataAddress } from "viem";
import { getKnowwAppUrl } from "./extension-session";
import { consumeOnboardingClobSigningPermit } from "./onboarding-clob-signing";

export const TRUSTED_CLOB_SIGNING_PATH = "/extension-credentials.html";
const SIGNING_TIMEOUT_MS = 180_000;

export interface TrustedClobWallet {
  name: string;
  rdns: string;
}

interface PageSigningRequest {
  address: string;
  expectedOrigin: string;
  expectedPath: string;
  typedData: string;
  wallet: TrustedClobWallet;
}

export async function assertClobAuthSigner(
  auth: ReturnType<typeof buildClobAuthRpcTypedData>,
  signature: `0x${string}`,
  address: string
): Promise<void> {
  const signer = await recoverTypedDataAddress({
    domain: auth.typedData.domain,
    types: { ClobAuth: auth.typedData.types.ClobAuth },
    primaryType: "ClobAuth",
    message: {
      ...auth.typedData.message,
      address: getAddress(address),
      nonce: BigInt(auth.nonce),
    },
    signature,
  });
  if (getAddress(signer) !== getAddress(address)) {
    throw new Error("The signature came from a different wallet account.");
  }
}

/** This function runs in the trusted tab's MAIN world via executeScript. */
export async function signClobAuthInPage(
  input: PageSigningRequest
): Promise<string> {
  if (
    location.origin !== input.expectedOrigin ||
    location.pathname !== input.expectedPath ||
    window.top !== window
  ) {
    throw new Error("The Knoww signing page changed. Try again.");
  }

  type Provider = {
    request(args: { method: string; params?: unknown[] }): Promise<unknown>;
    providers?: unknown[];
    info?: { rdns?: string; name?: string };
    rdns?: string;
    name?: string;
    isMetaMask?: boolean;
    isPhantom?: boolean;
  };
  type Announcement = {
    detail?: {
      info?: { rdns?: string; name?: string };
      provider?: Provider;
    };
  };

  const desiredRdns = input.wallet.rdns.trim().toLowerCase();
  const desiredName = input.wallet.name.trim().toLowerCase();
  const candidates = new Set<Provider>();
  const matches = (
    provider: Provider,
    info?: { rdns?: string; name?: string }
  ) => {
    const rdns = (info?.rdns || provider.info?.rdns || provider.rdns || "")
      .trim()
      .toLowerCase();
    const name = (info?.name || provider.info?.name || provider.name || "")
      .trim()
      .toLowerCase();
    if (desiredRdns) {
      if (rdns) return rdns === desiredRdns;
      if (desiredRdns === "io.metamask")
        return provider.isMetaMask === true && provider.isPhantom !== true;
      if (desiredRdns === "app.phantom") return provider.isPhantom === true;
      return false;
    }
    if (name === desiredName) return true;
    if (desiredName === "metamask")
      return provider.isMetaMask === true && provider.isPhantom !== true;
    if (desiredName === "phantom") return provider.isPhantom === true;
    return false;
  };

  const onProvider = (event: Event) => {
    const detail = (event as Event & Announcement).detail;
    const provider = detail?.provider;
    if (
      provider &&
      typeof provider.request === "function" &&
      matches(provider, detail.info)
    ) {
      candidates.add(provider);
    }
  };
  window.addEventListener("eip6963:announceProvider", onProvider);
  try {
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    await new Promise<void>((resolve) => setTimeout(resolve, 1_500));
  } finally {
    window.removeEventListener("eip6963:announceProvider", onProvider);
  }

  if (candidates.size === 0) {
    const injected = (window as Window & { ethereum?: Provider }).ethereum;
    const legacy = Array.isArray(injected?.providers)
      ? injected.providers
      : injected
        ? [injected]
        : [];
    for (const value of legacy) {
      const provider = value as Provider;
      if (
        provider &&
        typeof provider.request === "function" &&
        matches(provider)
      ) {
        candidates.add(provider);
      }
    }
  }

  if (candidates.size !== 1) {
    throw new Error(
      `Could not identify ${input.wallet.name} on Knoww. Check the selected wallet and retry.`
    );
  }
  const provider = [...candidates][0];
  const address = input.address.toLowerCase();
  const containsAddress = (value: unknown): boolean =>
    Array.isArray(value) &&
    value.some(
      (account) =>
        typeof account === "string" && account.toLowerCase() === address
    );

  let accounts = await provider.request({ method: "eth_accounts" });
  if (!containsAddress(accounts)) {
    accounts = await provider.request({ method: "eth_requestAccounts" });
  }
  if (!containsAddress(accounts)) {
    throw new Error(
      `Select ${input.address} in ${input.wallet.name} and retry.`
    );
  }

  const chainId = await provider.request({ method: "eth_chainId" });
  if (chainId !== "0x89") {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x89" }],
    });
  }
  if (!containsAddress(await provider.request({ method: "eth_accounts" }))) {
    throw new Error("The wallet account changed. Try again.");
  }
  if (
    location.origin !== input.expectedOrigin ||
    location.pathname !== input.expectedPath
  ) {
    throw new Error("The Knoww signing page changed. Try again.");
  }

  const signature = await provider.request({
    method: "eth_signTypedData_v4",
    params: [input.address, input.typedData],
  });
  if (
    location.origin !== input.expectedOrigin ||
    location.pathname !== input.expectedPath ||
    !containsAddress(await provider.request({ method: "eth_accounts" }))
  ) {
    throw new Error("The signing page or wallet account changed. Try again.");
  }
  if (typeof signature !== "string") {
    throw new Error("The wallet did not return a signature.");
  }
  return signature;
}

export async function signClobAuthInTrustedTab(input: {
  address: string;
  sourceTabId: number;
  sourceDocumentId?: string;
  onboardingSigningPermit?: string;
  typedData: string;
  wallet: TrustedClobWallet;
}): Promise<string> {
  const onboardingUrl = input.onboardingSigningPermit
    ? consumeOnboardingClobSigningPermit(
        input.onboardingSigningPermit,
        input.sourceTabId,
        input.address
      )
    : undefined;
  if (onboardingUrl && !input.sourceDocumentId) {
    throw new Error("Refresh the Knoww onboarding page and try again.");
  }
  const trustedUrl = onboardingUrl
    ? new URL(onboardingUrl)
    : new URL(TRUSTED_CLOB_SIGNING_PATH, getKnowwAppUrl());
  const sourceTab = await chrome.tabs.get(input.sourceTabId);
  if (
    onboardingUrl &&
    (sourceTab.url !== trustedUrl.href || sourceTab.status !== "complete")
  ) {
    throw new Error("The Knoww onboarding page changed. Try again.");
  }
  const tab = onboardingUrl
    ? sourceTab
    : await chrome.tabs.create({
        url: trustedUrl.href,
        active: true,
        windowId: sourceTab.windowId,
      });
  if (tab.id === undefined) throw new Error("Could not open Knoww signing.");
  const tabId = tab.id;

  let resolveLoaded: (() => void) | undefined;
  let rejectCancelled: ((error: Error) => void) | undefined;
  const loaded = new Promise<void>((resolve) => {
    resolveLoaded = resolve;
  });
  const cancelled = new Promise<never>((_, reject) => {
    rejectCancelled = reject;
  });
  void cancelled.catch(() => {});
  let cancellationError: Error | undefined;
  const cancel = (message: string) => {
    cancellationError = new Error(message);
    rejectCancelled?.(cancellationError);
  };
  const onUpdated = (
    updatedId: number,
    change: { status?: string; url?: string }
  ) => {
    if (updatedId === input.sourceTabId && change.status === "loading") {
      cancel("The original trading tab changed. Try again.");
    }
    if (updatedId !== tabId) return;
    if (change.url && change.url !== trustedUrl.href) {
      cancel("The Knoww signing page changed. Try again.");
    }
    if (change.status === "complete") resolveLoaded?.();
  };
  const onRemoved = (removedId: number) => {
    if (removedId === tabId || removedId === input.sourceTabId) {
      cancel("Trading credential setup was cancelled.");
    }
  };
  chrome.tabs.onUpdated.addListener(onUpdated);
  chrome.tabs.onRemoved.addListener(onRemoved);
  const timer = setTimeout(
    () => cancel("Wallet signing timed out. Try again."),
    SIGNING_TIMEOUT_MS
  );

  try {
    const current = await chrome.tabs.get(tabId);
    if (
      (current.url || current.pendingUrl) &&
      current.url !== trustedUrl.href &&
      current.pendingUrl !== trustedUrl.href
    ) {
      throw new Error("The Knoww signing page changed. Try again.");
    }
    if (current.status !== "complete") {
      await Promise.race([loaded, cancelled]);
    }
    const ready = await chrome.tabs.get(tabId);
    if (ready.url !== trustedUrl.href || ready.status !== "complete") {
      throw new Error("The Knoww signing page changed. Try again.");
    }
    if (cancellationError) throw cancellationError;

    const results = await Promise.race([
      chrome.scripting.executeScript({
        target:
          onboardingUrl && input.sourceDocumentId
            ? { tabId, documentIds: [input.sourceDocumentId] }
            : { tabId, frameIds: [0] },
        world: "MAIN",
        func: signClobAuthInPage,
        args: [
          {
            address: input.address,
            expectedOrigin: trustedUrl.origin,
            expectedPath: trustedUrl.pathname,
            typedData: input.typedData,
            wallet: input.wallet,
          },
        ],
      }),
      cancelled,
    ]);
    const after = await chrome.tabs.get(tabId);
    if (cancellationError) throw cancellationError;
    if (
      after.url !== trustedUrl.href ||
      after.status !== "complete" ||
      results.length !== 1 ||
      results[0].frameId !== 0 ||
      (onboardingUrl && results[0].documentId !== input.sourceDocumentId)
    ) {
      throw new Error("The Knoww signing page changed. Try again.");
    }
    const signature = results[0].result;
    if (typeof signature !== "string" || !/^0x[\da-f]{130}$/i.test(signature)) {
      throw new Error("The wallet did not return a valid signature.");
    }
    return signature;
  } finally {
    clearTimeout(timer);
    chrome.tabs.onUpdated.removeListener(onUpdated);
    chrome.tabs.onRemoved.removeListener(onRemoved);
    if (!onboardingUrl) {
      await chrome.tabs.remove(tabId).catch(() => {});
      await chrome.tabs
        .update(input.sourceTabId, { active: true })
        .catch(() => {});
    }
  }
}
