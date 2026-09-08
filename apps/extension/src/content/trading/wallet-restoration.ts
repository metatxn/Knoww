import { sameAddress } from "@knoww/shared-types/bridge";
import {
  ONBOARDING_STORAGE_KEY,
  parseOnboardingProgress,
} from "../../onboarding-state";
import { WALLETCONNECT_WALLET_UUID, WalletBridge } from "./bridge";
import { ExtensionSession } from "./extension-session";

export const WALLET_PREFERENCE_STORAGE_KEY = "knoww_wallet_preference_v1";
const MOBILE_RDNS = "walletconnect";
const DISCOVERY_TIMEOUT_MS = 1500;

interface WalletPreference {
  address: string;
  rdns: string;
  name: string;
}

function parsePreference(value: unknown): WalletPreference | null {
  if (!value || typeof value !== "object") return null;
  const preference = value as Partial<WalletPreference>;
  if (
    typeof preference.address !== "string" ||
    !/^0x[\da-f]{40}$/i.test(preference.address) ||
    typeof preference.rdns !== "string" ||
    preference.rdns.length > 255 ||
    typeof preference.name !== "string" ||
    !preference.name ||
    preference.name.length > 255
  )
    return null;
  return preference as WalletPreference;
}

export async function rememberWalletConnection(address: string): Promise<void> {
  try {
    const uuid = WalletBridge.getSelectedWalletUuid();
    const wallets = WalletBridge.getDiscoveredWallets();
    const wallet =
      uuid === WALLETCONNECT_WALLET_UUID
        ? { rdns: MOBILE_RDNS, name: "Mobile Wallet" }
        : (wallets.find((wallet) => wallet.uuid === uuid) ??
          (wallets.length === 1 ? wallets[0] : undefined));
    if (!wallet) return;
    await chrome.storage.local.set({
      [WALLET_PREFERENCE_STORAGE_KEY]: {
        address,
        rdns: wallet.rdns,
        name: wallet.name,
      },
    });
  } catch {
    // A storage failure must not prevent an explicit wallet connection.
  }
}

function matchingWallets(preference: WalletPreference) {
  return WalletBridge.getDiscoveredWallets().filter((wallet) =>
    preference.rdns
      ? wallet.rdns === preference.rdns
      : wallet.name === preference.name
  );
}

async function waitForWallets(
  preference: WalletPreference | null
): Promise<void> {
  const available = () =>
    preference
      ? matchingWallets(preference).length > 0
      : WalletBridge.getDiscoveredWallets().length > 0;
  if (available()) return;
  await new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      unsubscribe();
      resolve();
    };
    const timer = setTimeout(finish, DISCOVERY_TIMEOUT_MS);
    const unsubscribe = WalletBridge.onWalletsChanged(() => {
      if (available()) finish();
    });
    if (available()) finish();
  });
}

export async function restoreOnboardedWallet(
  isCurrent: () => boolean,
  onStart: () => void = () => {}
): Promise<{ address: string; walletUuid: string } | null> {
  try {
    const stored = await chrome.storage.local.get([
      ONBOARDING_STORAGE_KEY,
      WALLET_PREFERENCE_STORAGE_KEY,
    ]);
    if (
      !parseOnboardingProgress(stored[ONBOARDING_STORAGE_KEY]).completedAt ||
      !isCurrent()
    )
      return null;
    const session = await ExtensionSession.getInfo();
    const address = session.address;
    if (
      !session.loggedIn ||
      !address ||
      !/^0x[\da-f]{40}$/i.test(address) ||
      !isCurrent()
    )
      return null;

    const preference = parsePreference(stored[WALLET_PREFERENCE_STORAGE_KEY]);
    if (preference && !sameAddress(preference.address, address)) return null;
    onStart();
    let walletUuid: string;
    if (preference) {
      if (preference.rdns === MOBILE_RDNS) {
        walletUuid = WALLETCONNECT_WALLET_UUID;
      } else {
        await waitForWallets(preference);
        const matches = matchingWallets(preference);
        if (matches.length !== 1 || !isCurrent()) return null;
        walletUuid = matches[0].uuid;
      }
      let accounts = await WalletBridge.getWalletAccounts(walletUuid, false);
      if (!isCurrent()) return null;
      if (accounts.length === 0 && walletUuid !== WALLETCONNECT_WALLET_UUID) {
        // A new site may need account-access permission from the chosen wallet.
        accounts = await WalletBridge.getWalletAccounts(walletUuid, true);
      }
      if (!accounts[0] || !sameAddress(accounts[0], address)) return null;
    } else {
      // Migrate completed onboarding from releases that saved no provider choice.
      // Probe silently and restore only one unambiguous active-account match.
      await waitForWallets(null);
      if (!isCurrent()) return null;
      const candidates = [
        ...WalletBridge.getDiscoveredWallets().map((wallet) => wallet.uuid),
        WALLETCONNECT_WALLET_UUID,
      ];
      const matches = await Promise.all(
        candidates.map(async (uuid) => {
          const accounts = await WalletBridge.getWalletAccounts(
            uuid,
            false
          ).catch(() => []);
          return accounts[0] && sameAddress(accounts[0], address) ? uuid : null;
        })
      );
      const matching = matches.filter((uuid): uuid is string => uuid !== null);
      if (matching.length !== 1) return null;
      walletUuid = matching[0];
    }

    const currentSession = await ExtensionSession.getInfo();
    if (
      !isCurrent() ||
      !currentSession.loggedIn ||
      !currentSession.address ||
      !sameAddress(currentSession.address, address)
    )
      return null;
    WalletBridge.selectWallet(walletUuid);
    await rememberWalletConnection(address);
    return isCurrent() ? { address, walletUuid } : null;
  } catch {
    return null;
  }
}
