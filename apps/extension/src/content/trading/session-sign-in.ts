import { POLYGON_CHAIN_ID_HEX } from "@knoww/shared-types/polymarket";
import {
  parseSessionSignInRequest,
  SESSION_SIGN_IN_HASH,
  type SessionSignInRequest,
} from "../../session-sign-in";
import { WalletBridge } from "./bridge";
import { ExtensionSession } from "./extension-session";
import { createSessionSignInView } from "./session-sign-in-view";

async function send<T>(message: Record<string, unknown>): Promise<T> {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok)
    throw new Error(response?.error || "Knoww sign-in could not be completed.");
  return response.data as T;
}

export async function signInWithSelectedWallet(
  request: SessionSignInRequest,
  isCurrent: () => boolean
): Promise<void> {
  const matches = () =>
    WalletBridge.getDiscoveredWallets().filter((wallet) =>
      request.wallet.rdns
        ? wallet.rdns === request.wallet.rdns
        : wallet.name === request.wallet.name
    );
  if (matches().length === 0) {
    await new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        unsubscribe();
        resolve();
      };
      const timer = setTimeout(finish, 2000);
      const unsubscribe = WalletBridge.onWalletsChanged(() => {
        if (matches().length) finish();
      });
      if (matches().length) finish();
    });
  }
  if (!isCurrent()) throw new Error("Knoww sign-in was cancelled.");
  const wallets = matches();
  if (wallets.length !== 1)
    throw new Error(
      `Could not identify ${request.wallet.name}. Return to your trading tab and choose a wallet again.`
    );
  const hasAccount = await WalletBridge.ensureAccountAccess(
    wallets[0].uuid,
    request.address,
    isCurrent
  );
  if (!isCurrent()) throw new Error("Knoww sign-in was cancelled.");
  if (!hasAccount) {
    throw new Error(
      `Connect the account shown above in ${request.wallet.name}, then retry. Your trading account has not changed.`
    );
  }
  if ((await WalletBridge.getChainId()) !== POLYGON_CHAIN_ID_HEX) {
    await WalletBridge.switchChain(POLYGON_CHAIN_ID_HEX);
  }
  if (!isCurrent()) throw new Error("Knoww sign-in was cancelled.");
  await ExtensionSession.ensureAuthorized(request.address);
}

export async function mountSessionSignIn(
  container: HTMLElement
): Promise<void> {
  const requestId = location.hash.slice(SESSION_SIGN_IN_HASH.length);
  const { wallet, walletName, account, status, confirm, cancel } =
    createSessionSignInView(container);
  let active = true;
  cancel.addEventListener("click", () => {
    active = false;
    confirm.disabled = true;
    confirm.removeAttribute("aria-busy");
    status.dataset.state = "";
    status.textContent = "Sign-in cancelled. Return to your trading tab.";
    void send({
      type: "auth:sign-in-complete",
      requestId,
      error: "Knoww sign-in was cancelled.",
    }).catch(() => {});
  });
  try {
    const request = parseSessionSignInRequest(
      await send({ type: "auth:sign-in-details", requestId })
    );
    if (!request)
      throw new Error(
        "This sign-in request is invalid. Return to your trading tab and try again."
      );
    if (!active) return;
    window.KNOWW_STYLES?.injectMetamaskBridge();
    WalletBridge.init();
    account.textContent = request.address;
    walletName.textContent = request.wallet.name;
    wallet.hidden = false;
    status.textContent =
      "Review the connection and signature requests in your wallet.";
    confirm.textContent = `Continue with ${request.wallet.name}`;
    confirm.hidden = false;
    confirm.addEventListener("click", async () => {
      confirm.disabled = true;
      status.dataset.state = "waiting";
      confirm.setAttribute("aria-busy", "true");
      status.textContent = `Waiting for ${request.wallet.name}…`;
      try {
        await send({ type: "auth:sign-in-details", requestId });
        await signInWithSelectedWallet(request, () => active);
        if (!active) return;
        status.dataset.state = "success";
        confirm.removeAttribute("aria-busy");
        status.textContent = "Signed in. Returning to your trading tab…";
        await send({ type: "auth:sign-in-complete", requestId });
      } catch (error) {
        if (!active) return;
        status.dataset.state = "error";
        confirm.removeAttribute("aria-busy");
        status.textContent =
          error instanceof Error
            ? error.message
            : "Sign-in failed. Please try again.";
        confirm.disabled = false;
      }
    });
  } catch (error) {
    status.dataset.state = "error";
    status.textContent =
      error instanceof Error ? error.message : "Sign-in could not be started.";
  }
}
