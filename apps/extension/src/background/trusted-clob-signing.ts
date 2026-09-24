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
): Promise<string | { error: string }> {
  // Chrome may turn an injected function's rejected promise into a null
  // result. Return failures explicitly so the worker can report them safely.
  class SigningFailure extends Error {}
  let walletAction = "connect to your wallet";
  try {
    const checkPage = () => {
      if (
        location.origin !== input.expectedOrigin ||
        location.pathname !== input.expectedPath ||
        window.top !== window
      ) {
        throw new SigningFailure("The Knoww signing page changed. Try again.");
      }
    };
    checkPage();

    const signingStatus =
      input.expectedPath === "/extension-credentials.html" &&
      typeof document !== "undefined"
        ? document.getElementById("signing-status")
        : null;
    if (signingStatus) {
      const account = document.getElementById("signing-account");
      const label = document.getElementById("signing-account-label");
      const address = document.getElementById("signing-account-address");
      if (label)
        label.textContent = `Account to connect in ${input.wallet.name}`;
      if (address) address.textContent = input.address;
      if (account) account.hidden = false;
      signingStatus.textContent = `Checking account access in ${input.wallet.name}`;
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
      throw new SigningFailure(
        `Could not identify ${input.wallet.name} on Knoww. Check the selected wallet and retry.`
      );
    }
    const provider = [...candidates][0];
    const request = async (method: string, params?: unknown[]) => {
      checkPage();
      const result = await provider.request({
        method,
        ...(params && { params }),
      });
      checkPage();
      return result;
    };
    const address = input.address.toLowerCase();
    const containsAddress = (value: unknown): boolean =>
      Array.isArray(value) &&
      value.some(
        (account) =>
          typeof account === "string" && account.toLowerCase() === address
      );

    // Keep this permission check self-contained: Chrome serializes this
    // function without its imports. Match wallet-account-access.ts's explicit
    // account grants, including accounts other than MetaMask's active account.
    const permitsAddress = (value: unknown): boolean => {
      if (!Array.isArray(value)) return false;
      return value.some((permission) => {
        if (
          permission?.parentCapability !== "eth_accounts" ||
          !Array.isArray(permission.caveats)
        )
          return false;
        const restrictions = permission.caveats.filter(
          (caveat: { type?: unknown } | null) =>
            caveat?.type === "restrictReturnedAccounts"
        );
        return (
          restrictions.length > 0 &&
          restrictions.every((caveat: { value?: unknown }) =>
            containsAddress(caveat.value)
          )
        );
      });
    };
    const unsupportedMethod = (error: unknown): boolean => {
      const code = (error as { code?: unknown } | null)?.code;
      return code === 4200 || code === -32601;
    };
    const hasAccountAccess = async (): Promise<boolean> => {
      if (containsAddress(await request("eth_accounts"))) return true;
      try {
        return permitsAddress(await request("wallet_getPermissions"));
      } catch (error) {
        if (unsupportedMethod(error)) return false;
        throw error;
      }
    };

    let authorized = containsAddress(await request("eth_accounts"));
    if (!authorized) {
      try {
        authorized = permitsAddress(await request("wallet_getPermissions"));
        if (!authorized) {
          if (signingStatus)
            signingStatus.textContent = `Connect the account shown above in ${input.wallet.name}`;
          const granted = await request("wallet_requestPermissions", [
            { eth_accounts: {} },
          ]);
          authorized =
            permitsAddress(granted) ||
            containsAddress(await request("eth_accounts"));
        }
      } catch (error) {
        if (!unsupportedMethod(error)) throw error;
        if (signingStatus)
          signingStatus.textContent = `Connect the account shown above in ${input.wallet.name}`;
        authorized = containsAddress(await request("eth_requestAccounts"));
      }
    }
    if (!authorized) {
      throw new SigningFailure(
        `Select ${input.address} in ${input.wallet.name}'s connection prompt for ${input.expectedOrigin}, then retry.`
      );
    }

    walletAction = "check your wallet network";
    const chainId = await request("eth_chainId");
    if (chainId !== "0x89") {
      walletAction = "switch your wallet to Polygon";
      await request("wallet_switchEthereumChain", [{ chainId: "0x89" }]);
    }
    if (!(await hasAccountAccess())) {
      throw new SigningFailure("The wallet account changed. Try again.");
    }

    walletAction = "request the trading setup signature";
    if (signingStatus)
      signingStatus.textContent = `Confirm trading setup in ${input.wallet.name}`;
    const signature = await request("eth_signTypedData_v4", [
      input.address,
      input.typedData,
    ]);
    if (!(await hasAccountAccess())) {
      throw new SigningFailure(
        "The signing page or wallet account changed. Try again."
      );
    }
    if (typeof signature !== "string") {
      throw new SigningFailure("The wallet did not return a signature.");
    }
    return signature;
  } catch (error) {
    if (error instanceof SigningFailure) return { error: error.message };
    const code = (error as { code?: unknown } | null)?.code;
    if (code === 4001 || code === "ACTION_REJECTED") {
      return { error: "User rejected the request." };
    }
    if (code === -32002) {
      return {
        error: `A wallet request is already pending. Open ${input.wallet.name} to continue.`,
      };
    }
    if (code === 4902) {
      return {
        error: `Add the Polygon network in ${input.wallet.name}, then try again.`,
      };
    }
    return {
      error: `Could not ${walletAction}. Open ${input.wallet.name} and try again.`,
    };
  }
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
    if (
      signature &&
      typeof signature === "object" &&
      typeof signature.error === "string"
    ) {
      throw new Error(signature.error);
    }
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
